'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const { Worker } = require('node:worker_threads');
const { resolveRuntimeEntry } = require('./runtimeEntries');
const { MAX_ALIGNMENT_SECONDS } = require('./library/trackVideo');

const exec = promisify(execFile);
const SAMPLE_RATE = 4000;
const MAX_SAMPLES = SAMPLE_RATE * MAX_ALIGNMENT_SECONDS;
const DEMUXERS = new Map([
  ['.mp3', 'mp3'],
  ['.wav', 'wav'],
  ['.flac', 'flac'],
  ['.m4a', 'mov'],
  ['.mp4', 'mov'],
  ['.aac', 'aac'],
  ['.webm', 'matroska'],
  ['.ogg', 'ogg'],
  ['.opus', 'ogg'],
]);

async function decode(ffmpeg, file, signal) {
  const format = DEMUXERS.get(path.extname(file).toLowerCase());
  if (!format) return null;
  const { stdout } = await exec(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-f',
      format,
      '-copyts',
      '-start_at_zero',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-vn',
      '-ac',
      '1',
      '-af',
      `aresample=${SAMPLE_RATE}:async=1:first_pts=0`,
      '-t',
      String(MAX_ALIGNMENT_SECONDS + 1),
      '-f',
      'f32le',
      'pipe:1',
    ],
    {
      encoding: 'buffer',
      windowsHide: true,
      signal,
      timeout: 15_000,
      maxBuffer: (MAX_SAMPLES + SAMPLE_RATE) * 4,
    },
  );
  return samplesFrom(stdout);
}

// A pooled Buffer may start at an offset Float32Array cannot view, so the
// bytes are copied into their own buffer.
function samplesFrom(bytes) {
  if (bytes.length % 4 || bytes.length > MAX_SAMPLES * 4) return null;
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  );
}

function compareInWorker(source, target, signal, includeWaveforms) {
  const deadline = AbortSignal.timeout(15_000);
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  bounded.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      resolveRuntimeEntry(path.resolve(__dirname, '../..'), 'videoSyncWorker'),
      {
        workerData: {
          kind: 'track-video-offset',
          source,
          target,
          includeWaveforms,
        },
        // samplesFrom owns these buffers, so they move instead of copying.
        transferList: [source.buffer, target.buffer],
      },
    );
    function cancel() {
      worker.terminate().then(() => reject(bounded.reason), reject);
    }
    function settle(callback, value) {
      bounded.removeEventListener('abort', cancel);
      if (!bounded.aborted) callback(value);
    }
    worker.once('message', (offset) => settle(resolve, offset));
    worker.once('error', (error) => settle(reject, error));
    worker.once('exit', () =>
      settle(
        reject,
        new Error('Video alignment worker ended without a result'),
      ),
    );
    bounded.addEventListener('abort', cancel, { once: true });
  });
}

async function estimateTrackVideoAlignment({
  ffmpeg,
  audioPath,
  referencePath,
  signal,
  includeWaveforms = false,
}) {
  const [source, target] = await Promise.all([
    decode(ffmpeg, audioPath, signal),
    decode(ffmpeg, referencePath, signal),
  ]);
  if (!source || !target) return null;
  const alignment = await compareInWorker(
    source,
    target,
    signal,
    includeWaveforms,
  );
  signal?.throwIfAborted();
  return alignment;
}

module.exports = {
  SAMPLE_RATE,
  estimateTrackVideoAlignment,
  samplesFrom,
};
