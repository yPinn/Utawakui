import fs from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { WAVEFORM_RUNTIME_PACKAGES } from './verify-runtime-package.mjs';
import { createStreamingProducer } from '../electron/lib/waveform/producer.js';
import { createWaveformSource } from '../electron/lib/waveform/source.js';
import { createHeavyJobScheduler } from '../electron/lib/audioProcessing/heavyJobScheduler.js';
import { buildReleaseRuntime } from './build-release-runtime.mjs';

const root = fs.mkdtempSync(path.resolve('tasks/wave-main-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
function wav() {
  const dir = path.join(root, 'library/tracks/track');
  fs.mkdirSync(dir, { recursive: true });
  const bytes = Buffer.alloc(44 + 16000 * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  const file = path.join(dir, 'audio.wav');
  fs.writeFileSync(file, bytes);
  return file;
}
it('prepares original binding and metadata in the real isolated worker, and after release relocation', async () => {
  wav();
  const scheduler = createHeavyJobScheduler();
  const source = createWaveformSource({
    scheduler,
    start: createStreamingProducer,
  });
  const value = await source.prepare(
    { dir: path.join(root, 'library'), epoch: 1 },
    'track',
    () => {},
    new AbortController().signal,
  );
  expect(value.binding.value).toMatch(/^[a-f0-9]{64}$/);
  expect(value.metadata).toMatchObject({
    channels: 2,
    sampleRate: 8000,
    durationSec: 1,
  });
  const runtime = path.join(root, 'runtime');
  await buildReleaseRuntime({
    outputDirectory: runtime,
    entries: {
      waveformWorker: {
        source: 'electron/lib/waveform/worker.js',
        file: 'waveform.cjs',
        physical: true,
      },
    },
  });
  const relocated = path.join(root, 'relocated');
  fs.renameSync(runtime, relocated);
  for (const name of WAVEFORM_RUNTIME_PACKAGES)
    fs.cpSync(
      path.resolve('node_modules', name),
      path.join(relocated, 'node_modules', name),
      { recursive: true },
    );
  const resolver = createRequire(path.join(relocated, 'waveform.cjs'));
  for (const name of WAVEFORM_RUNTIME_PACKAGES)
    expect(resolver.resolve(name).startsWith(relocated + path.sep)).toBe(true);
  const wrapper = path.join(relocated, 'contained-dependencies.cjs');
  fs.writeFileSync(
    wrapper,
    `const Module=require('node:module');
    const original=Module._load;
    Module._load=function(id,...args) {
      if(!Module.isBuiltin(id) && !Module._resolveFilename(id,...args).startsWith(${JSON.stringify(relocated + path.sep)})) throw Error('External dependency: '+id);
      return original.call(this,id,...args);
    }; require(${JSON.stringify(path.join(relocated, 'waveform.cjs'))});`,
  );
  const result = await createStreamingProducer(
    {
      mode: 'prepare',
      inputPath: value.file,
      expectedStamp: value.stamp.split('/').at(-1),
    },
    { workerPath: wrapper },
  ).result.catch((error) => {
    throw Error(error.privateDiagnostic || error.message);
  });
  expect(result.binding).toEqual(value.binding);
  expect(result.metrics).toMatchObject({
    workerClosed: true,
    producerClosed: true,
  });
  await scheduler.shutdown();
});
it('waits for actual child close on cancellation and refuses changed input before spawning a decoder', async () => {
  const job = createStreamingProducer({
    mode: 'prepare',
    inputPath: path.join(root, 'missing'),
    expectedStamp: 'stale',
  });
  const error = job.result.catch((error) => error);
  await job.cancel();
  expect((await error).metrics).toMatchObject({
    workerClosed: true,
    producerClosed: true,
  });
});
it('does not settle on exit before IPC is drained, and strips injected child runtime options', async () => {
  const worker = new EventEmitter();
  Object.assign(worker, {
    pid: 12345,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    connected: true,
    send() {},
  });
  let options;
  const job = createStreamingProducer(
    {},
    {
      forkImpl: (_file, _args, value) => {
        options = value;
        return worker;
      },
    },
  );
  let settled = false;
  job.result.finally(() => {
    settled = true;
  });
  worker.emit('exit', 0);
  await Promise.resolve();
  expect(settled).toBe(false);
  worker.emit('message', { type: 'done', summary: { result: 'drained' } });
  worker.emit('close', 0);
  expect((await job.result).result).toBe('drained');
  expect(options.execArgv).toEqual([]);
  expect(options.env).not.toHaveProperty('NODE_OPTIONS');
});
it('fails cancellation closed when the OS cannot confirm owned decoder exit', async () => {
  const worker = new EventEmitter();
  Object.assign(worker, {
    pid: 12345,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    connected: true,
    send() {},
  });
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  try {
    const job = createStreamingProducer({}, { forkImpl: () => worker });
    const result = job.result.catch((error) => error.message);
    worker.emit('message', { type: 'producer', pid: 12346 });
    const cancelled = expect(job.cancel()).rejects.toThrow('CLEANUP_FAILED');
    worker.emit('close', 1);
    await cancelled;
    expect(await result).toBe('CANCELLED');
  } finally {
    kill.mockRestore();
  }
});
