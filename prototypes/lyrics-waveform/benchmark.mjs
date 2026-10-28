/* global URL, process, console, setInterval, clearInterval */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createStreamingProducer } from './producer.mjs';
import { createWaveformLane } from './lane.mjs';
import { validateMetadata, LIMITS } from './policy.mjs';
import { evaluate } from './evaluate.mjs';

const require = createRequire(import.meta.url),
  { hashAudioFile } = require('../../electron/lib/works/trackBinding.js');
const root = fileURLToPath(new URL('../../', import.meta.url)),
  directory = fileURLToPath(new URL('./', import.meta.url));
const [ffmpegPath, ffprobePath] = process.argv.slice(2);
for (const file of [ffmpegPath, ffprobePath])
  if (!file || !path.isAbsolute(file) || !fs.statSync(file).isFile())
    throw Error('Explicit installed decoder paths required');
const out = fs.mkdtempSync(path.join(root, 'tasks/waveform-backend-'));
const fixtureDir = path.join(out, 'fixtures');
fs.mkdirSync(fixtureDir);
function command(exe, args) {
  const result = spawnSync(exe, args, {
    windowsHide: true,
    shell: false,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 65536,
  });
  if (result.status !== 0)
    throw Error('Fixture/probe command failed: ' + result.status);
  return result.stdout;
}
const base = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-nostdin',
  '-y',
  '-threads',
  '1',
];
const fixtures = [];
function generate(id, extension, source, output) {
  const file = path.join(fixtureDir, id + '.' + extension);
  command(ffmpegPath, [...base, '-f', 'lavfi', '-i', source, ...output, file]);
  const probe = JSON.parse(
    command(ffprobePath, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate,channels,duration:format=duration',
      '-of',
      'json',
      file,
    ]),
  );
  const metadata = validateMetadata({
    sampleRate: Number(probe.streams[0].sample_rate),
    channels: probe.streams[0].channels,
    durationSec: Number(probe.streams[0].duration ?? probe.format.duration),
    inputBytes: fs.statSync(file).size,
  });
  fixtures.push({ id, file, metadata });
}
console.log('Generating bounded synthetic fixtures');
generate('mono', 'wav', 'sine=frequency=440:sample_rate=16000:duration=15', [
  '-c:a',
  'pcm_s16le',
]);
generate('wav', 'wav', 'sine=frequency=440:sample_rate=44100:duration=30', [
  '-af',
  'pan=stereo|c0=c0|c1=-1*c0',
  '-c:a',
  'pcm_s16le',
]);
generate('mp3', 'mp3', 'sine=frequency=440:sample_rate=44100:duration=30', [
  '-ac',
  '2',
  '-c:a',
  'libmp3lame',
  '-b:a',
  '128k',
]);
generate('aac', 'm4a', 'sine=frequency=440:sample_rate=48000:duration=30', [
  '-ac',
  '2',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
]);
generate('opus', 'ogg', 'sine=frequency=440:sample_rate=48000:duration=30', [
  '-ac',
  '2',
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
]);
generate(
  'medium',
  'flac',
  'sine=frequency=440:sample_rate=48000:duration=120',
  ['-af', 'pan=stereo|c0=c0|c1=-1*c0', '-c:a', 'flac'],
);
generate('long', 'flac', 'sine=frequency=440:sample_rate=48000:duration=1800', [
  '-af',
  'pan=stereo|c0=c0|c1=-1*c0',
  '-c:a',
  'flac',
]);
generate('quad', 'flac', 'aevalsrc=0.1|-0.1|0.2|-0.2:s=96000:d=15', [
  '-c:a',
  'flac',
]);
generate(
  'eight',
  'flac',
  'aevalsrc=0.1|-0.1|0.2|-0.2|0.3|-0.3|0.4|-0.4:s=192000:d=5',
  ['-c:a', 'flac'],
);
const sampler = spawn(
  'powershell',
  [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(directory, 'memory.ps1'),
  ],
  { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] },
);
const lines = createInterface({ input: sampler.stdout }),
  ready = Promise.withResolvers();
let sampled = null;
sampler.once('exit', () => {
  sampled?.reject(Error('Memory observer exited'));
});
lines.on('line', (line) => {
  if (line === 'READY') ready.resolve();
  else if (sampled) {
    sampled.resolve(JSON.parse(line));
    sampled = null;
  }
});
await ready.promise;
const results = [];
const stamp = (file) => {
  const value = fs.statSync(file, { bigint: true });
  return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(
    ':',
  );
};
async function runCase(item, variant = 'first-read') {
  console.log('Main ' + item.id + ' ' + variant);
  let producer,
    handle,
    identity = stamp(item.file),
    installed = 0,
    sourceCancelled = false;
  const baseline = process.memoryUsage().rss;
  let peak = baseline,
    cancelStarted = null;
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 20);
  const sample = Promise.withResolvers();
  sampled = sample;
  let observedPid = false;
  const lane = createWaveformLane({
    identity: () => identity,
    start: () => {
      producer = createStreamingProducer(
        {
          ffmpegPath,
          inputPath: item.file,
          metadata:
            variant === 'output-limit'
              ? { ...item.metadata, durationSec: 1 }
              : item.metadata,
          realtime: ['cancel', 'source', 'worker-exit'].includes(variant),
        },
        {
          deadlineMs: variant === 'deadline' ? 5 : LIMITS.deadlineMs,
          onProducer: (pid) => {
            if (Number.isInteger(pid)) {
              observedPid = true;
              sampler.stdin.write(JSON.stringify([pid, producer.pid]) + '\n');
            }
          },
          onFirstPcm: () => {
            if (
              ['cancel', 'source', 'worker-exit'].includes(variant) &&
              cancelStarted === null
            ) {
              cancelStarted = performance.now();
              if (variant === 'source') {
                identity += 'new';
                sourceCancelled = true;
                void lane.invalidate();
              } else if (variant === 'worker-exit')
                process.kill(producer.pid, 'SIGKILL');
              else void handle.cancel();
            }
          },
        },
      );
      return producer;
    },
    install: () => {
      installed++;
    },
  });
  const binding = await hashAudioFile(item.file);
  handle = lane.request(binding.value);
  try {
    const value = await handle.result;
    const metrics = observedPid ? await sample.promise : null;
    const decoder = metrics?.processes.find(
      (row) => row.pid === value.metrics.producerPid,
    );
    const worker = metrics?.processes.find((row) => row.pid === producer.pid);
    results.push({
      id: item.id,
      variant,
      status: 'completed',
      metadata: item.metadata,
      min: Math.min(...value.coarse.min),
      max: Math.max(...value.coarse.max),
      payloadBytes: value.payloadBytes,
      workingSummaryBytes: value.workingSummaryBytes,
      ...value.metrics,
      producerMemory: metrics,
      observedPeakSumBytes:
        decoder?.peakWorkingSetBytes && worker?.peakWorkingSetBytes
          ? decoder.peakWorkingSetBytes +
            worker.peakWorkingSetBytes +
            (peak - baseline)
          : null,
      hostPeakDeltaBytes: peak - baseline,
      hostLoopMaxMs: loop.max / 1e6,
      installed,
    });
  } catch (error) {
    await producer.cancel();
    const settled = await producer.result.catch((failed) => failed);
    if (producer.diagnostic())
      fs.writeFileSync(
        path.join(out, `${item.id}-${variant}-worker.log`),
        producer.diagnostic(),
      );
    const metrics = observedPid ? await sample.promise : null;
    let producerAlive = false;
    if (settled.metrics?.producerPid)
      try {
        process.kill(settled.metrics.producerPid, 0);
        producerAlive = true;
      } catch {
        /* The exact owned decoder has exited. */
      }
    results.push({
      id: item.id,
      variant,
      status: error.message,
      sourceCancelled,
      ...settled.metrics,
      producerMemory: metrics,
      producerAlive,
      installed,
      cancelWaitMs:
        cancelStarted === null ? null : performance.now() - cancelStarted,
    });
  } finally {
    clearInterval(timer);
    loop.disable();
    if (!observedPid) sampled = null;
  }
}
try {
  for (const item of fixtures) await runCase(item);
  await runCase(
    fixtures.find((item) => item.id === 'long'),
    'repeat-read',
  );
  for (const variant of [
    'cancel',
    'source',
    'deadline',
    'output-limit',
    'worker-exit',
  ])
    await runCase(
      fixtures.find((item) => item.id === 'long'),
      variant,
    );
  const corruptFile = path.join(fixtureDir, 'corrupt.wav');
  fs.writeFileSync(corruptFile, 'not a media file');
  await runCase(
    {
      id: 'corrupt',
      file: corruptFile,
      metadata: {
        ...fixtures[0].metadata,
        inputBytes: fs.statSync(corruptFile).size,
      },
    },
    'corrupt',
  );
  fs.writeFileSync(
    path.join(out, 'main.json'),
    JSON.stringify(results, null, 2),
  );
  const config = path.join(out, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ out, fixtures }));
  const electron = require('electron'),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const browser = spawnSync(
    electron,
    [path.join(directory, 'capture.cjs'), config],
    {
      env,
      windowsHide: true,
      shell: false,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 65536,
    },
  );
  fs.writeFileSync(path.join(out, 'browser.stderr.log'), browser.stderr || '');
  if (browser.status !== 0)
    throw Error('Browser probe failed: ' + browser.status);
  const version = command(ffmpegPath, ['-version']).split('\n')[0];
  const report = {
    schemaVersion: 1,
    date: '2026-10-28',
    platform: process.platform,
    node: process.versions.node,
    environment: {
      cpu: os.cpus()[0].model.trim(),
      logicalCpus: os.availableParallelism(),
      ramBytes: os.totalmem(),
      arch: process.arch,
      osRelease: os.release(),
    },
    decoder: version,
    limits: LIMITS,
    measurement:
      'Host RSS sampled 20ms; worker OS maxRSS; decoder OS peak working set sampled 20ms in a prestarted PowerShell observer. First/repeat reads do not flush OS cache.',
    main: results,
    browser: JSON.parse(
      fs.readFileSync(path.join(out, 'browser.json'), 'utf8'),
    ),
  };
  report.gates = evaluate(report);
  process.exitCode =
    report.gates.mainCandidate && report.gates.browser.incompleteProbes === 0
      ? 0
      : 1;
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      out,
      mainCases: results.length,
      browserCases: report.browser.results.length,
    }),
  );
} finally {
  sampler.stdin.end('quit\n');
  lines.close();
}
