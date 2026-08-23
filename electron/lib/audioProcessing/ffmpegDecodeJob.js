'use strict';

const path = require('path');
const { spawn } = require('child_process');

function isAbsolutePath(filePath) {
  return (
    path.isAbsolute(filePath || '') || path.win32.isAbsolute(filePath || '')
  );
}

function createFfmpegDecodeJob({
  ffmpegPath,
  inputPath,
  outputPath,
  emitProgress,
  spawnImpl = spawn,
}) {
  if (
    !isAbsolutePath(ffmpegPath) ||
    !isAbsolutePath(inputPath) ||
    !isAbsolutePath(outputPath)
  ) {
    throw new Error('analysis decode paths must be absolute');
  }
  const child = spawnImpl(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-sn',
      '-dn',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      outputPath,
    ],
    {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    },
  );
  let settled = false;
  let cancelRequested = false;
  let resolveCancellation;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    callback(value);
  };

  emitProgress?.({ stage: 'decoding', percent: 0 });
  child.on('error', () => {
    settle(
      rejectResult,
      new Error(
        cancelRequested
          ? 'audio-processing job cancelled'
          : 'analysis audio decode failed',
      ),
    );
    resolveCancellation?.();
  });
  child.on('close', (code) => {
    if (cancelRequested) {
      settle(rejectResult, new Error('audio-processing job cancelled'));
      resolveCancellation?.();
      return;
    }
    if (code !== 0) {
      settle(rejectResult, new Error('analysis audio decode failed'));
      return;
    }
    emitProgress?.({ stage: 'decoding', percent: 100 });
    settle(resolveResult, outputPath);
  });

  async function cancel() {
    if (settled || cancelRequested) return;
    cancelRequested = true;
    const cancellation = new Promise((resolve) => {
      resolveCancellation = resolve;
    });
    try {
      child.kill();
    } catch {
      settle(rejectResult, new Error('audio-processing job cancelled'));
      resolveCancellation();
    }
    await cancellation;
  }

  return { result, cancel };
}

module.exports = { createFfmpegDecodeJob };
