'use strict';
const fs = require('node:fs');
const { sendTerminal: sendTerminalMessage } = require('./workerProtocol');
const { spawn } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

let child,
  cancelRequested = false;
process.on('disconnect', () => {
  cancelRequested = true;
  child?.kill();
});
const sendTerminal = (message) => sendTerminalMessage(process, message);
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
  const { PeakAccumulator } = require('../../../shared/waveform/peaks.mjs');
  const { LIMITS } = require('../../../shared/waveform/policy.mjs');
  const started = performance.now(),
    initialStamp = stamp(request.inputPath);
  if (request.expectedStamp !== stamp(request.inputPath))
    throw Error('SOURCE_STALE');
  if (request.mode === 'prepare') {
    const { hashAudioFile } = require('../works/trackBinding');
    const { parseFile } = require('music-metadata');
    const { validateMetadata } = require('../../../shared/waveform/policy.mjs');
    const check = () => {
      if (cancelRequested) throw Error('CANCELLED');
    };
    const binding = await hashAudioFile(request.inputPath, {
      maxBytes: LIMITS.inputBytes,
      check,
    });
    const parsed = await parseFile(request.inputPath, {
      duration: true,
      skipCovers: true,
    });
    check();
    const metadata = validateMetadata({
      durationSec: parsed.format.duration,
      sampleRate: parsed.format.sampleRate,
      channels: parsed.format.numberOfChannels,
      inputBytes: Number(fs.statSync(request.inputPath).size),
    });
    if (stamp(request.inputPath) !== initialStamp) throw Error('SOURCE_STALE');
    await sendTerminal({ type: 'done', summary: { binding, metadata } });
    if (process.connected) process.disconnect();
    return;
  }
  const accumulator = new PeakAccumulator(request.metadata, {
    detailStartSec: (request.tileIndex ?? 0) * 10,
  });
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let bytes = 0,
    maxChunkBytes = 0,
    remainder = Buffer.alloc(0),
    stderrBytes = 0,
    diagnostic = '',
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
    diagnostic += chunk
      .toString('utf8')
      .slice(0, Math.max(0, 4096 - diagnostic.length));
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
    await sendTerminal({
      type: 'done',
      summary: {
        producerVersion: summary.producerVersion,
        sampleRate: summary.sampleRate,
        channels: summary.channels,
        frames: summary.frames,
        durationSec: summary.durationSec,
        peaks: summary[request.kind === 'detail' ? 'detail' : 'coarse'],
      },
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
    await sendTerminal({
      type: 'failed',
      code: cancelRequested ? 'CANCELLED' : error.message,
      diagnostic,
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
    if (process.connected) process.disconnect();
  }
}
process.once('message', (message) => {
  if (message?.type === 'start')
    run(message.request).catch(async (error) => {
      const expected = [
        'METADATA_BUDGET',
        'SOURCE_STALE',
        'CANCELLED',
      ].includes(error.message);
      if (!expected) console.error(error.stack);
      await sendTerminal({
        type: 'failed',
        code: expected ? error.message : 'WORKER_FAILED',
      });
      if (process.connected) process.disconnect();
    });
});
