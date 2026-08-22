'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { AUDIO_PYTHON_PROTOCOL_VERSION } = require('../audioPythonRuntimeHost');

const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 4096;
const SAFE_STAGE_RE = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

function isAbsolutePath(filePath) {
  return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath);
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function createProtocolError() {
  return new Error('audio Python worker protocol error');
}

function createAudioPythonProcessJob({
  executablePath,
  workerPath,
  request,
  emitProgress,
  cleanup,
  spawnImpl = spawn,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
}) {
  if (!isAbsolutePath(executablePath) || !isAbsolutePath(workerPath)) {
    throw new Error('audio Python worker paths must be absolute');
  }
  if (
    !isPlainObject(request) ||
    Object.hasOwn(request, 'protocolVersion') ||
    !Number.isSafeInteger(maxMessageBytes) ||
    maxMessageBytes < 1
  ) {
    throw new Error('invalid audio Python worker request');
  }

  const child = spawnImpl(executablePath, [workerPath], {
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let settled = false;
  let cleaned = false;
  let cancelRequested = false;
  let resolveCancellation;
  let terminalMessage = null;
  let stdoutBuffer = Buffer.alloc(0);
  let stderr = '';
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function settle(callback, value) {
    if (settled) return;
    settled = true;
    if (!cleaned && typeof cleanup === 'function') {
      cleaned = true;
      try {
        cleanup();
      } catch (error) {
        console.error('audio Python job cleanup failed', error);
        rejectResult(new Error('audio Python job cleanup failed'));
        return;
      }
    }
    callback(value);
  }

  function terminateAfterProtocolError() {
    try {
      child.kill();
    } catch {
      // The protocol failure is already authoritative. A process that exited
      // between the bad line and kill() does not need a second error path.
    }
    settle(rejectResult, createProtocolError());
  }

  function handleMessage(message) {
    if (!isPlainObject(message) || terminalMessage) {
      terminateAfterProtocolError();
      return;
    }

    if (message.type === 'progress') {
      if (
        !SAFE_STAGE_RE.test(message.stage || '') ||
        (message.percent !== undefined &&
          (!Number.isFinite(message.percent) ||
            message.percent < 0 ||
            message.percent > 100))
      ) {
        terminateAfterProtocolError();
        return;
      }
      emitProgress?.({
        stage: message.stage,
        ...(Number.isFinite(message.percent)
          ? { percent: message.percent }
          : {}),
      });
      return;
    }

    if (message.type === 'done' && isPlainObject(message.result)) {
      terminalMessage = { type: 'done', result: message.result };
      return;
    }

    if (
      message.type === 'error' &&
      SAFE_ERROR_CODE_RE.test(message.code || '') &&
      typeof message.message === 'string' &&
      message.message.length > 0 &&
      message.message.length <= 500
    ) {
      const error = new Error(message.message);
      error.code = message.code;
      terminalMessage = { type: 'error', error };
      return;
    }

    terminateAfterProtocolError();
  }

  function consumeStdout() {
    for (;;) {
      const newlineIndex = stdoutBuffer.indexOf(0x0a);
      if (newlineIndex === -1) {
        if (stdoutBuffer.length > maxMessageBytes) {
          terminateAfterProtocolError();
        }
        return;
      }

      const rawLine = stdoutBuffer.subarray(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.subarray(newlineIndex + 1);
      if (rawLine.length === 0 || rawLine.length > maxMessageBytes) {
        terminateAfterProtocolError();
        return;
      }

      try {
        handleMessage(JSON.parse(rawLine.toString('utf8').trimEnd()));
      } catch {
        terminateAfterProtocolError();
        return;
      }
      if (settled) return;
    }
  }

  child.stdout.on('data', (chunk) => {
    if (settled || cancelRequested) return;
    stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.from(chunk)]);
    consumeStdout();
  });
  child.stderr.on('data', (chunk) => {
    if (stderr.length >= MAX_STDERR_BYTES) return;
    stderr += String(chunk).slice(0, MAX_STDERR_BYTES - stderr.length);
  });
  child.on('error', () => {
    settle(
      rejectResult,
      cancelRequested
        ? new Error('audio-processing job cancelled')
        : new Error('audio Python worker failed to start'),
    );
    resolveCancellation?.();
  });
  child.on('close', (code, signal) => {
    if (settled) return;
    if (stderr) {
      console.error(`audio Python worker stderr:\n${stderr}`);
    }
    if (cancelRequested) {
      settle(rejectResult, new Error('audio-processing job cancelled'));
      resolveCancellation?.();
      return;
    }
    if (terminalMessage?.type === 'error') {
      settle(rejectResult, terminalMessage.error);
      return;
    }
    if (code !== 0) {
      const suffix = Number.isInteger(code)
        ? ` with code ${code}`
        : signal
          ? ` from signal ${signal}`
          : '';
      settle(rejectResult, new Error(`audio Python worker exited${suffix}`));
      return;
    }
    if (stdoutBuffer.length > 0 || !terminalMessage) {
      settle(rejectResult, createProtocolError());
      return;
    }
    settle(resolveResult, terminalMessage.result);
  });

  child.stdin.end(
    `${JSON.stringify({
      protocolVersion: AUDIO_PYTHON_PROTOCOL_VERSION,
      ...request,
    })}\n`,
  );

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

module.exports = { createAudioPythonProcessJob };
