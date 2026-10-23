// Bounded transport for research plans. No provider or product IPC access.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LIMITS, safeFallback, withinBudget } from './contract.mjs';
import { isAlive, terminateOwnedProcess } from './processLifecycle.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function runLocalCpu({
  directory,
  assetDirectory,
  runtimeDirectory,
  modelName,
  plan,
  validate,
}) {
  const write = (p, value) =>
    fs.writeFileSync(
      path.join(directory, p),
      JSON.stringify(value, null, 2) + '\n',
    );
  const clockPath = path.join(directory, 'clock.json');
  if (fs.existsSync(clockPath)) throw new Error('clock-exists-no-budget-reset');
  const startedAt = Date.now(),
    deadline = startedAt + LIMITS.totalMs;
  write('clock.json', { startedAt, deadline });
  const elapsed = () => Date.now() - startedAt;
  const socket = net.createServer();
  await new Promise((resolve, reject) =>
    socket.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const key = randomBytes(24).toString('hex'),
    base = `http://127.0.0.1:${port}`;
  const args = [
    '-m',
    path.join(assetDirectory, modelName),
    '-t',
    '4',
    '-tb',
    '4',
    '-c',
    '4096',
    '-np',
    '1',
    '-ngl',
    '0',
    '--offline',
    '--no-webui',
    '--no-warmup',
    '--no-context-shift',
    '--cache-ram',
    '0',
    '--reasoning',
    'off',
    '--reasoning-budget',
    '0',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key',
    key,
  ];
  const server = spawn(path.join(runtimeDirectory, 'llama-server.exe'), args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '',
      HIP_VISIBLE_DEVICES: '',
      OMP_NUM_THREADS: '4',
      OPENBLAS_NUM_THREADS: '4',
    },
  });
  const streams = [];
  const pipeLog = (source, name) => {
    const target = fs.createWriteStream(path.join(directory, name));
    streams.push(target);
    source.pipe(target);
  };
  pipeLog(server.stdout, 'server.stdout.log');
  pipeLog(server.stderr, 'server.stderr.log');
  const sampler = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('sample-process.ps1', import.meta.url)),
      '-TargetPid',
      String(server.pid),
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  pipeLog(sampler.stderr, 'sampler.stderr.log');
  const samples = [],
    results = [];
  let fatal = null,
    pending = '';
  server.on('error', (e) => {
    fatal = `server-spawn:${e.message}`;
  });
  sampler.on('error', (e) => {
    fatal = `sampler-spawn:${e.message}`;
  });
  const sampleLog = fs.createWriteStream(
    path.join(directory, 'samples.ndjson'),
  );
  sampler.stdout.on('data', (b) => {
    pending += b.toString();
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop();
    for (const line of lines.filter(Boolean))
      try {
        const s = {
          ...JSON.parse(line),
          runnerRss: process.memoryUsage().rss,
          runnerCpu: process.cpuUsage(),
        };
        samples.push(s);
        sampleLog.write(JSON.stringify(s) + '\n');
        if (
          Math.max(s.privateBytes, s.workingSet) +
            s.runnerRss +
            Math.max(s.samplerPrivateBytes, s.samplerWorkingSet) >=
          LIMITS.memory
        )
          fatal = 'memory-cap';
      } catch {
        fatal = 'invalid-telemetry';
      }
  });
  const watchdog = setInterval(() => {
    if (Date.now() >= deadline) fatal = 'total-time-cap';
    if (samples.length && Date.now() - samples.at(-1).at > 2000)
      fatal = 'telemetry-stale';
    if (fatal && isAlive(server)) server.kill();
  }, 50);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  const request = async (route, body, ms = 30000) => {
    if (fatal) throw Error(fatal);
    const r = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(ms, deadline - Date.now())),
      ),
    });
    const raw = await r.text();
    if (!r.ok) throw Object.assign(Error(`http-${r.status}`), { raw });
    return JSON.parse(raw);
  };
  const infer = async (body, id) => {
    const began = Date.now(),
      response = {
        choices: [
          {
            finish_reason: null,
            message: { content: '', reasoning_content: '' },
          },
        ],
        firstContentTokenMs: null,
      };
    const output = fs.createWriteStream(
      path.join(directory, id + '.response.sse'),
    );
    const timer = setTimeout(
      () => {
        fatal = 'request-timeout';
        if (isAlive(server)) server.kill();
      },
      Math.max(1, Math.min(LIMITS.requestMs, deadline - began)),
    );
    try {
      const r = await fetch(base + '/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(LIMITS.requestMs, deadline - Date.now())),
        ),
      });
      if (!r.ok)
        throw Object.assign(Error(`http-${r.status}`), { raw: await r.text() });
      let buffer = '';
      const decoder = new TextDecoder();
      for await (const block of r.body) {
        output.write(block);
        buffer += decoder.decode(block, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/u);
        buffer = events.pop();
        for (const event of events)
          for (const line of event
            .split(/\r?\n/u)
            .filter((x) => x.startsWith('data: '))) {
            if (line.slice(6) === '[DONE]') continue;
            const chunk = JSON.parse(line.slice(6)),
              choice = chunk.choices?.[0];
            if (choice?.delta?.content) {
              response.firstContentTokenMs ??= Date.now() - began;
              response.choices[0].message.content += choice.delta.content;
            }
            if (choice?.delta?.reasoning_content)
              response.choices[0].message.reasoning_content +=
                choice.delta.reasoning_content;
            if (choice?.finish_reason)
              response.choices[0].finish_reason = choice.finish_reason;
            if (chunk.usage) response.usage = chunk.usage;
            if (chunk.timings) response.timings = chunk.timings;
          }
      }
      return response;
    } catch (e) {
      e.partial = response;
      throw e;
    } finally {
      clearTimeout(timer);
      output.end();
    }
  };
  const life = {
    startedAt,
    serverPid: server.pid,
    samplerPid: sampler.pid,
    arguments: args.map((a) => (a === key ? '[redacted]' : a)),
    status: 'starting',
  };
  write('lifecycle.json', life);
  try {
    let ready = false;
    while (elapsed() < LIMITS.requestMs) {
      if (fatal || !isAlive(server)) throw Error(fatal ?? 'server-exited');
      try {
        ready = (await request('/health', null, 1000)).status === 'ok';
      } catch {
        /* no inference */
      }
      if (ready && samples.length) break;
      await pause(100);
    }
    if (!ready || !samples.length) throw Error('startup-or-telemetry-timeout');
    life.readyAt = Date.now();
    life.status = 'running';
    life.readySample = samples.at(-1);
    write('lifecycle.json', life);
    for (const [index, entry] of plan.entries()) {
      if (fatal || elapsed() >= LIMITS.totalMs) break;
      const c = entry.condition;
      const row = {
        requestId: entry.requestId,
        caseId: entry.caseId,
        language: entry.language,
        arm: entry.arm,
        kind: entry.kind,
        status: 'preflight',
        processCold: index === 0,
      };
      let began;
      try {
        if (c.input.skip) throw Error(c.input.skip);
        const messages = [
          { role: 'system', content: c.system },
          { role: 'user', content: JSON.stringify(c.payload) },
        ];
        const formatted = await request('/apply-template', {
          messages,
          chat_template_kwargs: { enable_thinking: false },
        });
        const tokens = await request('/tokenize', {
          content: formatted.prompt,
          add_special: true,
          parse_special: true,
        });
        row.inputTokensPreflight = tokens.tokens.length;
        const last = samples.at(-1);
        if (
          !withinBudget({
            inputTokens: tokens.tokens.length,
            outputTokens: 512,
            elapsedMs: elapsed(),
            memoryBytes:
              Math.max(last.privateBytes, last.workingSet) +
              last.runnerRss +
              Math.max(last.samplerPrivateBytes, last.samplerWorkingSet),
          })
        )
          throw Error('preflight-budget');
        const body = {
          messages,
          max_tokens: 512,
          temperature: 0,
          seed: 117,
          cache_prompt: false,
          stream: true,
          stream_options: { include_usage: true },
          chat_template_kwargs: { enable_thinking: false },
          reasoning_effort: 'none',
          response_format: { type: 'json_object', schema: c.schema },
        };
        write(entry.requestId + '.request.json', body);
        row.telemetryBefore = samples.at(-1);
        began = Date.now();
        row.generationStarted = began;
        row.raw = await infer(body, entry.requestId);
        row.wallMs = Date.now() - began;
        if (row.raw.choices[0].finish_reason !== 'stop')
          throw Error('finish-' + row.raw.choices[0].finish_reason);
        if (row.raw.choices[0].message.reasoning_content)
          throw Error('unexpected-thinking');
        row.suggestion = validate(
          c,
          JSON.parse(row.raw.choices[0].message.content),
        );
        row.status = 'accepted';
      } catch (e) {
        row.status = 'fallback';
        row.error =
          fatal ?? (e.name === 'TimeoutError' ? 'request-timeout' : e.message);
        if (e.raw) row.errorBody = e.raw;
        if (e.partial) row.raw = e.partial;
        if (began) row.wallMs = Date.now() - began;
        row.suggestion = safeFallback(c.input, row.error);
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          fatal ??= 'request-timeout';
          if (isAlive(server)) server.kill();
        }
      }
      const ended = Date.now();
      for (let n = 0; n < 10 && samples.at(-1)?.at < ended; n++)
        await pause(25);
      row.telemetryAfter = samples.at(-1);
      row.cpuSecondsBracket = row.telemetryBefore
        ? row.telemetryAfter.cpuSeconds - row.telemetryBefore.cpuSeconds
        : null;
      write(entry.requestId + '.result.json', row);
      results.push(row);
      console.log(
        JSON.stringify({
          id: entry.requestId,
          case: entry.caseId,
          arm: entry.arm,
          status: row.status,
          wallMs: row.wallMs,
          error: row.error ?? null,
        }),
      );
      if (fatal) break;
    }
    life.status = fatal ? 'stopped' : 'complete';
  } catch (e) {
    life.status = 'failed';
    life.failure = e.message;
  } finally {
    clearInterval(watchdog);
    life.finishedAt = Date.now();
    life.fatal = fatal;
    life.completed = results.length;
    life.scheduled = plan.length;
    life.lastSample = samples.at(-1) ?? null;
    await terminateOwnedProcess(server);
    await terminateOwnedProcess(sampler);
    life.serverExited = !isAlive(server);
    life.samplerExited = !isAlive(sampler);
    life.closedAt = Date.now();
    write('lifecycle.json', life);
    write('summary.json', {
      scheduled: plan.length,
      attempted: results.length,
      missing: plan
        .filter((e) => !results.some((r) => r.requestId === e.requestId))
        .map((e) => ({ requestId: e.requestId, caseId: e.caseId, arm: e.arm })),
      elapsedMs: life.finishedAt - startedAt,
      fatal,
      status: life.status,
    });
    sampleLog.end();
  }
  return { life, results };
}
