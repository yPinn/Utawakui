// Isolated research only. Never imported by the application or exposed via IPC.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  LIMITS,
  SYSTEM,
  makeInput,
  modelPayload,
  responseSchema,
  validateSuggestion,
  safeFallback,
  withinBudget,
} from './contract.mjs';
import { isAlive, terminateOwnedProcess } from './processLifecycle.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dir = path.resolve(repo, 'tasks/lyrics-text-qwen-pilot-20261023');
const diagnostic = process.argv.includes('--diagnose');
const resumeFour = process.argv.includes('--resume-four');
const outputDir = diagnostic ? path.join(dir, 'diagnostic') : dir;
const write = (name, data) =>
  fs.writeFileSync(
    path.join(outputDir, name),
    JSON.stringify(data, null, 2) + '\n',
  );
const sha = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const shaStream = async (p) => {
  const hash = createHash('sha256');
  for await (const block of fs.createReadStream(p)) hash.update(block);
  return hash.digest('hex');
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lock = JSON.parse(fs.readFileSync(path.join(dir, 'assets.lock.json')));
const corpusFile = path.join(
  repo,
  'docs/research/lyrics-text-preprocessing-corpus-2026-10-23.json',
);
const corpus = JSON.parse(fs.readFileSync(corpusFile));
const languages = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'];
const order = diagnostic
  ? Array(4).fill(corpus.cases.find((c) => c.id === 'en-s3'))
  : Array.from({ length: 12 }, (_, i) =>
      languages.map(
        (lang) => corpus.cases.filter((c) => c.language === lang)[i],
      ),
    ).flat();
const frozen = {
  corpusSha256: sha(corpusFile),
  system: SYSTEM,
  limits: LIMITS,
  inputs: order.map((c, i) => ({
    caseId: c.id,
    input: makeInput(c, diagnostic ? 0 : i),
  })),
  mode: diagnostic ? 'schema-diagnostic-not-quality-score' : 'primary-pilot',
  moduleHashes: Object.fromEntries(
    [
      'contract.mjs',
      'pilot.mjs',
      'sample-process.ps1',
      'processLifecycle.mjs',
    ].map((p) => [p, sha(fileURLToPath(new URL(p, import.meta.url)))]),
  ),
};
const results = [];
let child, sampler, watchdog, fatal;
let startedAt;
const elapsed = () => Date.now() - startedAt;
const clean = async () => {
  clearInterval(watchdog);
  await terminateOwnedProcess(child);
  await terminateOwnedProcess(sampler);
  child = null;
  sampler = null;
};

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) =>
    socket.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function runModel(asset) {
  const modelDir = path.join(outputDir, asset.kind);
  fs.mkdirSync(modelDir);
  const samples = [];
  const key = randomBytes(24).toString('hex');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const args = [
    '-m',
    path.join(dir, 'assets', asset.name),
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
  const launched = Date.now();
  const out = fs.createWriteStream(path.join(modelDir, 'server.stdout.log'));
  const err = fs.createWriteStream(path.join(modelDir, 'server.stderr.log'));
  child = spawn(path.join(dir, 'runtime', 'llama-server.exe'), args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '',
      HIP_VISIBLE_DEVICES: '',
      GGML_CUDA_ENABLE_UNIFIED_MEMORY: '0',
      OMP_NUM_THREADS: '4',
      OPENBLAS_NUM_THREADS: '4',
    },
  });
  child.on('error', (e) => {
    fatal = `server-spawn:${e.message}`;
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  const sampleLog = fs.createWriteStream(path.join(modelDir, 'samples.ndjson'));
  sampler = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('sample-process.ps1', import.meta.url)),
      '-TargetPid',
      String(child.pid),
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  sampler.on('error', (e) => {
    fatal = `sampler-spawn:${e.message}`;
  });
  sampler.stderr.pipe(
    fs.createWriteStream(path.join(modelDir, 'sampler.stderr.log')),
  );
  let pending = '';
  sampler.stdout.on('data', (block) => {
    pending += block.toString();
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop();
    for (const line of lines.filter(Boolean)) {
      try {
        const value = {
          ...JSON.parse(line),
          runnerRss: process.memoryUsage().rss,
          runnerCpu: process.cpuUsage(),
        };
        samples.push(value);
        sampleLog.write(JSON.stringify(value) + '\n');
        if (
          Math.max(value.privateBytes, value.workingSet) +
            value.runnerRss +
            Math.max(value.samplerPrivateBytes, value.samplerWorkingSet) >=
          LIMITS.memory
        )
          fatal = 'memory-cap';
      } catch {
        fatal = 'invalid-telemetry';
      }
    }
  });
  watchdog = setInterval(() => {
    if (elapsed() >= LIMITS.totalMs) fatal = 'total-time-cap';
    if (samples.length && Date.now() - samples.at(-1).at > 2000)
      fatal = 'telemetry-stale';
    if (fatal && isAlive(child)) child.kill();
  }, 50);
  const request = async (route, body, timeout = LIMITS.requestMs) => {
    if (fatal) throw new Error(fatal);
    const response = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(timeout, LIMITS.totalMs - elapsed())),
      ),
    });
    const raw = await response.text();
    if (!response.ok)
      throw Object.assign(new Error(`http-${response.status}`), { raw });
    return JSON.parse(raw);
  };
  const infer = async (body, prefix) => {
    const began = Date.now();
    const nativeDeadline = setTimeout(
      () => {
        fatal = 'request-timeout-stop-model';
        if (isAlive(child)) child.kill();
      },
      Math.max(1, Math.min(LIMITS.requestMs, LIMITS.totalMs - elapsed())),
    );
    const rawLog = fs.createWriteStream(
      path.join(modelDir, `${prefix}.response.sse`),
    );
    const result = {
      choices: [
        {
          finish_reason: null,
          message: { content: '', reasoning_content: '' },
        },
      ],
      firstContentTokenMs: null,
    };
    try {
      const res = await fetch(base + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(LIMITS.requestMs, LIMITS.totalMs - elapsed())),
        ),
      });
      if (!res.ok)
        throw Object.assign(new Error(`http-${res.status}`), {
          raw: await res.text(),
        });
      let buffer = '';
      const decoder = new TextDecoder();
      for await (const block of res.body) {
        rawLog.write(block);
        buffer += decoder.decode(block, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/u);
        buffer = events.pop();
        for (const event of events) {
          for (const line of event
            .split(/\r?\n/u)
            .filter((x) => x.startsWith('data: '))) {
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;
            const chunk = JSON.parse(payload);
            const choice = chunk.choices?.[0];
            if (choice?.delta?.content) {
              result.firstContentTokenMs ??= Date.now() - began;
              result.choices[0].message.content += choice.delta.content;
            }
            if (choice?.delta?.reasoning_content)
              result.choices[0].message.reasoning_content +=
                choice.delta.reasoning_content;
            if (choice?.finish_reason)
              result.choices[0].finish_reason = choice.finish_reason;
            if (chunk.usage) result.usage = chunk.usage;
            if (chunk.timings) result.timings = chunk.timings;
          }
        }
      }
      return result;
    } catch (e) {
      e.partial = result;
      throw e;
    } finally {
      clearTimeout(nativeDeadline);
      rawLog.end();
    }
  };
  const modelRecord = {
    model: asset.kind,
    serverPid: child.pid,
    launched,
    arguments: args.map((a) => (a === key ? '[redacted]' : a)),
    status: 'starting',
  };
  write(`${asset.kind}/lifecycle.json`, modelRecord);
  try {
    let ready = false;
    while (Date.now() - launched < LIMITS.requestMs) {
      if (fatal || child.exitCode !== null)
        throw new Error(fatal ?? 'server-exited');
      try {
        ready = (await request('/health', null, 1000)).status === 'ok';
      } catch {
        /* readiness retries perform no inference */
      }
      if (ready && samples.length) break;
      await delay(100);
    }
    if (!ready || !samples.length)
      throw new Error('startup-or-telemetry-timeout');
    modelRecord.readyAt = Date.now();
    modelRecord.startupMs = modelRecord.readyAt - launched;
    modelRecord.idleReadySample = samples.at(-1);
    modelRecord.status = 'running';
    write(`${asset.kind}/lifecycle.json`, modelRecord);
    for (const [index, c] of order.entries()) {
      if (fatal || elapsed() >= LIMITS.totalMs)
        throw new Error(fatal ?? 'total-time-cap');
      const input = frozen.inputs[index].input;
      const messages = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(modelPayload(input)) },
      ];
      const item = {
        model: asset.kind,
        caseId: c.id,
        language: c.language,
        input,
        status: 'preflight',
        processCold: index === 0,
      };
      let generationStarted;
      try {
        if (input.skip) throw new Error(input.skip);
        const formatted = await request('/apply-template', {
          messages,
          chat_template_kwargs: { enable_thinking: false },
        });
        const tokens = await request('/tokenize', {
          content: formatted.prompt,
          add_special: true,
          parse_special: true,
        });
        item.inputTokensPreflight = tokens.tokens.length;
        if (
          !withinBudget({
            inputTokens: tokens.tokens.length,
            outputTokens: LIMITS.output,
            elapsedMs: elapsed(),
            memoryBytes: Math.max(
              samples.at(-1).privateBytes,
              samples.at(-1).workingSet,
            ),
          })
        )
          throw new Error('preflight-budget');
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
          response_format: {
            type: 'json_object',
            schema: responseSchema(input),
          },
        };
        if (diagnostic) {
          item.diagnosticVariant = [
            'original-schema',
            'reversed-enums',
            'json-only',
            'unconstrained',
          ][index];
          if (index === 1) {
            const schema = body.response_format.schema;
            schema.properties.kind.enum.reverse();
            schema.properties.breakIds.items.enum.reverse();
            schema.properties.reasonCodes.items.enum.reverse();
          } else if (index === 2)
            body.response_format = { type: 'json_object' };
          else if (index === 3) delete body.response_format;
        }
        fs.writeFileSync(
          path.join(modelDir, `${index}.request.json`),
          JSON.stringify(body, null, 2),
        );
        item.telemetryBefore = samples.at(-1);
        generationStarted = Date.now();
        item.generationStarted = generationStarted;
        item.raw = await infer(body, index);
        item.wallMs = Date.now() - generationStarted;
        const choice = item.raw.choices?.[0];
        if (choice?.finish_reason !== 'stop')
          throw new Error(`finish-${choice?.finish_reason}`);
        if (choice.message?.reasoning_content)
          throw new Error('unexpected-thinking');
        item.suggestion = validateSuggestion(
          input,
          JSON.parse(choice.message.content),
        );
        item.status = 'accepted';
      } catch (e) {
        item.status = 'fallback';
        item.error =
          fatal === 'request-timeout-stop-model' || e.name === 'TimeoutError'
            ? 'request-timeout'
            : e.message;
        if (e.raw) item.errorBody = e.raw;
        if (e.partial) item.raw = e.partial;
        if (generationStarted) item.wallMs = Date.now() - generationStarted;
        item.suggestion = safeFallback(input, item.error);
        if (
          e.name === 'TimeoutError' ||
          e.name === 'AbortError' ||
          fatal === 'request-timeout-stop-model'
        ) {
          // Do not overlap a native request while its cancellation completes.
          let idle = false;
          for (let attempt = 0; attempt < 20 && !idle && !fatal; attempt++) {
            try {
              const slots = await request('/slots', null, 1000);
              idle =
                Array.isArray(slots) && slots.every((s) => !s.is_processing);
            } catch {
              /* no generation retry */
            }
            if (!idle) await delay(100);
          }
          if (!idle) fatal = 'request-timeout-stop-model';
        }
      }
      const finished = Date.now();
      for (let n = 0; n < 10 && samples.at(-1)?.at < finished; n++)
        await delay(25);
      item.telemetryAfter = samples.at(-1);
      item.cpuSecondsBracket = item.telemetryBefore
        ? item.telemetryAfter.cpuSeconds - item.telemetryBefore.cpuSeconds
        : null;
      item.telemetryBracketMs = item.telemetryBefore
        ? [
            item.generationStarted - item.telemetryBefore.at,
            item.telemetryAfter.at - finished,
          ]
        : null;
      fs.writeFileSync(
        path.join(modelDir, `${index}.result.json`),
        JSON.stringify(item, null, 2),
      );
      results.push(item);
      console.log(
        JSON.stringify({
          model: asset.kind,
          case: c.id,
          status: item.status,
          kind: item.suggestion.kind ?? null,
          wallMs: item.wallMs ?? null,
          error: item.error ?? null,
        }),
      );
      if (!modelRecord.firstResponseAt && item.status === 'accepted')
        modelRecord.firstResponseAt = Date.now();
      if (fatal) break;
    }
    modelRecord.status = fatal ? 'stopped' : 'complete';
    modelRecord.stopReason = fatal ?? null;
  } catch (e) {
    modelRecord.status = 'failed';
    modelRecord.stopReason = e.message;
  } finally {
    modelRecord.finishedAt = Date.now();
    modelRecord.samples = samples.length;
    modelRecord.peakSampledPrivateBytes = Math.max(
      0,
      ...samples.map((s) => s.privateBytes),
    );
    modelRecord.peakWorkingSetBytes = Math.max(
      0,
      ...samples.map((s) => s.peakWorkingSet),
    );
    modelRecord.totalCpuSeconds = samples.at(-1)?.cpuSeconds ?? null;
    modelRecord.lastSampleBeforeShutdown = samples.at(-1) ?? null;
    await clean();
    modelRecord.exitedAt = Date.now();
    modelRecord.ownedServerExited = true;
    write(`${asset.kind}/lifecycle.json`, modelRecord);
    sampleLog.end();
    out.end();
    err.end();
  }
  if (fatal === 'request-timeout-stop-model') fatal = null;
  else if (modelRecord.status === 'failed' || fatal)
    throw new Error(modelRecord.stopReason ?? fatal);
}

async function main() {
  if (diagnostic && resumeFour) throw new Error('incompatible-modes');
  if (
    !diagnostic &&
    !resumeFour &&
    fs.existsSync(path.join(dir, 'inference-clock.json'))
  )
    throw new Error('existing-inference-clock-no-budget-reset');
  const previous = resumeFour
    ? JSON.parse(fs.readFileSync(path.join(dir, 'run-summary.json')))
    : null;
  if (
    resumeFour &&
    (previous.attempted !== 60 ||
      previous.results.some((r) => r.model !== 'two'))
  )
    throw new Error('invalid-resume');
  if (diagnostic) {
    const primary = JSON.parse(
      fs.readFileSync(path.join(dir, 'run-summary.json')),
    );
    if (primary.attempted !== 120 || primary.fatal)
      throw new Error('primary-not-complete');
    fs.mkdirSync(outputDir);
  }
  for (const asset of lock.files.filter((f) => f.kind !== 'runtime')) {
    const p = path.join(dir, 'assets', asset.name);
    if (
      fs.statSync(p).size !== asset.size ||
      (await shaStream(p)) !== asset.sha256
    )
      throw new Error('asset-integrity');
  }
  write(resumeFour ? 'resume-protocol.json' : 'frozen-protocol.json', frozen);
  startedAt =
    diagnostic || resumeFour
      ? JSON.parse(fs.readFileSync(path.join(dir, 'inference-clock.json')))
          .startedAt
      : Date.now();
  if (elapsed() >= LIMITS.totalMs) throw new Error('total-time-cap');
  write(resumeFour ? 'resume-clock.json' : 'inference-clock.json', {
    startedAt,
    deadline: startedAt + LIMITS.totalMs,
  });
  try {
    for (const asset of lock.files.filter((f) =>
      resumeFour ? f.kind === 'four' : f.kind !== 'runtime',
    ))
      await runModel(asset);
  } finally {
    write('run-summary.json', {
      startedAt,
      finishedAt: Date.now(),
      elapsedMs: elapsed(),
      attempted: results.length + (previous?.attempted ?? 0),
      fatal: fatal ?? null,
      results: [
        ...(previous?.results ?? []),
        ...results.map((r) => ({
          model: r.model,
          caseId: r.caseId,
          status: r.status,
          error: r.error ?? null,
        })),
      ],
    });
  }
}

main().catch(async (e) => {
  write('pilot-failure.json', {
    message: e.message,
    at: new Date().toISOString(),
  });
  console.error(e.message);
  await clean();
  process.exitCode = 1;
});
