/* global require, process, Buffer, console */
'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

let child,
  cancelRequested = false;
process.on('message', (message) => {
  if (message?.type === 'cancel') {
    cancelRequested = true;
    child?.kill();
  }
});
const stamp = (file) => {
  const s = fs.statSync(file, { bigint: true });
  return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
};
async function run(request) {
  const { PeakAccumulator } = await import('./peaks.mjs');
  const { LIMITS } = await import('./policy.mjs');
  const started = performance.now(),
    initialStamp = stamp(request.inputPath);
  const accumulator = new PeakAccumulator(request.metadata);
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let bytes = 0,
    maxChunkBytes = 0,
    remainder = Buffer.alloc(0),
    stderrBytes = 0,
    stopped = null,
    first = true;
  child = spawn(
    request.ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-xerror',
      '-threads',
      '1',
      '-protocol_whitelist',
      'file,pipe',
      ...(request.realtime ? ['-re'] : []),
      '-i',
      request.inputPath,
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-c:a',
      'pcm_f32le',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  process.send({ type: 'producer', pid: child.pid });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      stopped = { code, signal };
      resolve(stopped);
    });
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > 4096) child.kill();
  });
  if (cancelRequested) child.kill();
  try {
    for await (const chunk of child.stdout) {
      if (cancelRequested) break;
      maxChunkBytes = Math.max(maxChunkBytes, chunk.length);
      if (chunk.length > LIMITS.pcmChunkBytes) throw Error('PCM_CHUNK');
      bytes += chunk.length;
      if (bytes > accumulator.maxFrames * request.metadata.channels * 4)
        throw Error('PCM_DURATION');
      const input = remainder.length
        ? Buffer.concat([remainder, chunk])
        : chunk;
      const frameBytes = request.metadata.channels * 4,
        end = input.length - (input.length % frameBytes);
      accumulator.pushInterleaved(
        new DataView(input.buffer, input.byteOffset, end),
      );
      remainder = Buffer.from(input.subarray(end));
      if (first) {
        first = false;
        process.send({ type: 'first-pcm', bytes });
      }
    }
    await closed;
    if (cancelRequested) throw Error('CANCELLED');
    if (stopped.code !== 0 || stderrBytes > 4096 || remainder.length)
      throw Error('DECODE_FAILED');
    if (stamp(request.inputPath) !== initialStamp) throw Error('SOURCE_STALE');
    const summary = accumulator.finish();
    process.send({
      type: 'done',
      summary,
      metrics: {
        elapsedMs: performance.now() - started,
        pcmBytes: bytes,
        maxChunkBytes,
        workerRssBytes: process.memoryUsage().rss,
        workerPeakRssBytes: process.resourceUsage().maxRSS * 1024,
        workerLoopMaxMs: loop.max / 1e6,
        producerClosed: true,
      },
    });
  } catch (error) {
    child.kill();
    await closed.catch(() => {});
    process.send({
      type: 'failed',
      code: cancelRequested ? 'CANCELLED' : error.message,
      metrics: {
        elapsedMs: performance.now() - started,
        pcmBytes: bytes,
        maxChunkBytes,
        workerPeakRssBytes: process.resourceUsage().maxRSS * 1024,
        producerClosed: true,
      },
    });
  } finally {
    loop.disable();
    process.disconnect();
  }
}
process.once('message', (message) => {
  if (message?.type === 'start')
    run(message.request).catch((error) => {
      console.error(error.stack);
      process.send({ type: 'failed', code: 'WORKER_FAILED' });
      process.disconnect();
    });
});
