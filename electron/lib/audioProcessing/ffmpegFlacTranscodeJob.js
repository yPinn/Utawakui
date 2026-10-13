'use strict';

const path = require('path');
const { spawn } = require('child_process');

function isAbsolutePath(filePath) {
  return (
    path.isAbsolute(filePath || '') || path.win32.isAbsolute(filePath || '')
  );
}

function createFfmpegFlacTranscodeJob({
  ffmpegPath,
  inputPath,
  outputPath,
  spawnImpl = spawn,
}) {
  if (
    !isAbsolutePath(ffmpegPath) ||
    !isAbsolutePath(inputPath) ||
    !isAbsolutePath(outputPath)
  ) {
    throw new Error('compatibility conversion paths must be absolute');
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
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-map_metadata',
      '0',
      '-c:a',
      'flac',
      '-compression_level',
      '5',
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

  child.on('error', () => {
    settle(
      rejectResult,
      new Error(
        cancelRequested
          ? 'local audio compatibility conversion cancelled'
          : 'local audio compatibility conversion failed',
      ),
    );
    resolveCancellation?.();
  });
  child.on('close', (code) => {
    if (cancelRequested) {
      settle(
        rejectResult,
        new Error('local audio compatibility conversion cancelled'),
      );
      resolveCancellation?.();
      return;
    }
    if (code !== 0) {
      settle(
        rejectResult,
        new Error('local audio compatibility conversion failed'),
      );
      return;
    }
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
      settle(
        rejectResult,
        new Error('local audio compatibility conversion cancelled'),
      );
      resolveCancellation();
    }
    await cancellation;
  }

  return { result, cancel };
}

module.exports = { createFfmpegFlacTranscodeJob };
