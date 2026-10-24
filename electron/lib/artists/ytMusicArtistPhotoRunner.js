'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 4096;
const MAX_INPUT_BYTES = 8192;
const MAX_CANDIDATES = 3;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PORTRAIT_HOSTS = new Set([
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
  'lh3.googleusercontent.com',
]);
const WORKER_ERROR_REASONS = new Set([
  'cancelled',
  'provider-unavailable',
  'provider-rejected',
  'rate-limited',
  'schema-error',
  'timeout',
  'worker-failed',
]);
const CHILD_ENV_ALLOWLIST = new Set([
  'NUMBER_OF_PROCESSORS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'WINDIR',
]);

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isAbsolutePath(filePath) {
  return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath);
}

function isValidWorkerRequest(request) {
  if (!hasExactKeys(request, ['artistName', 'recordings'])) return false;
  if (
    typeof request.artistName !== 'string' ||
    request.artistName.trim().length === 0 ||
    request.artistName.length > 200 ||
    !Array.isArray(request.recordings) ||
    request.recordings.length > 3
  ) {
    return false;
  }
  for (const recording of request.recordings) {
    if (
      !hasExactKeys(recording, ['videoId', 'channelId']) ||
      typeof recording.videoId !== 'string' ||
      !VIDEO_ID_RE.test(recording.videoId) ||
      !(
        recording.channelId === null ||
        (typeof recording.channelId === 'string' &&
          OPAQUE_ID_RE.test(recording.channelId))
      )
    ) {
      return false;
    }
  }
  return true;
}

function validateRequest(request) {
  if (!isValidWorkerRequest(request)) {
    throw new TypeError('invalid YT Music artist photo request');
  }
}

function isPortrait(portrait) {
  if (!hasExactKeys(portrait, ['url', 'width', 'height'])) return false;
  if (
    !Number.isSafeInteger(portrait.width) ||
    portrait.width < 60 ||
    portrait.width > 2048 ||
    portrait.height !== portrait.width
  ) {
    return false;
  }
  try {
    const url = new URL(portrait.url);
    return Boolean(
      url.protocol === 'https:' &&
      PORTRAIT_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port,
    );
  } catch {
    return false;
  }
}

function isCandidate(candidate, index) {
  if (
    !hasExactKeys(candidate, [
      'rank',
      'name',
      'browseId',
      'portrait',
      'evidence',
    ]) ||
    candidate.rank !== index + 1 ||
    typeof candidate.name !== 'string' ||
    candidate.name.trim().length === 0 ||
    candidate.name.length > 200 ||
    typeof candidate.browseId !== 'string' ||
    !OPAQUE_ID_RE.test(candidate.browseId) ||
    !isPortrait(candidate.portrait) ||
    !hasExactKeys(candidate.evidence, [
      'exactName',
      'matchedChannelCount',
      'matchedVideoCount',
    ]) ||
    typeof candidate.evidence.exactName !== 'boolean'
  ) {
    return false;
  }
  return ['matchedChannelCount', 'matchedVideoCount'].every(
    (key) =>
      Number.isSafeInteger(candidate.evidence[key]) &&
      candidate.evidence[key] >= 0 &&
      candidate.evidence[key] <= 3,
  );
}

function validateWorkerResult(result) {
  if (
    hasExactKeys(result, ['status', 'reason']) &&
    result.status === 'error' &&
    WORKER_ERROR_REASONS.has(result.reason)
  ) {
    return result;
  }
  if (
    hasExactKeys(result, ['status', 'candidates']) &&
    result.status === 'no-match' &&
    Array.isArray(result.candidates) &&
    result.candidates.length === 0
  ) {
    return result;
  }
  const isSuccess =
    hasExactKeys(result, ['status', 'candidates']) && result.status === 'ok';
  const isPartial =
    hasExactKeys(result, ['status', 'reason', 'candidates']) &&
    result.status === 'partial' &&
    WORKER_ERROR_REASONS.has(result.reason);
  if (!isSuccess && !isPartial) return null;
  if (
    !Array.isArray(result.candidates) ||
    result.candidates.length === 0 ||
    result.candidates.length > MAX_CANDIDATES ||
    !result.candidates.every(isCandidate)
  ) {
    return null;
  }
  return result;
}

async function runYtMusicArtistPhotoWorker(options) {
  const {
    pythonPath,
    workerPath,
    request,
    signal,
    spawnImpl = spawn,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    terminationTimeoutMs = DEFAULT_TERMINATION_TIMEOUT_MS,
    maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
    logger = console,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = options || {};

  if (!isAbsolutePath(pythonPath) || !isAbsolutePath(workerPath)) {
    throw new TypeError('YT Music artist photo worker paths must be absolute');
  }
  validateRequest(request);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(terminationTimeoutMs) ||
    terminationTimeoutMs < 1 ||
    !Number.isSafeInteger(maxStdoutBytes) ||
    maxStdoutBytes < 1
  ) {
    throw new TypeError('invalid YT Music artist photo runner limits');
  }
  const input = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(input) > MAX_INPUT_BYTES) {
    throw new TypeError('invalid YT Music artist photo request');
  }
  if (signal?.aborted) {
    return { status: 'error', reason: 'cancelled' };
  }

  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      CHILD_ENV_ALLOWLIST.has(name.toUpperCase()),
    ),
  );
  childEnv.PYTHONNOUSERSITE = '1';

  let child;
  try {
    child = spawnImpl(pythonPath, ['-I', workerPath], {
      env: childEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    return { status: 'error', reason: 'worker-failed' };
  }

  return new Promise((resolve) => {
    let settled = false;
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let timer;
    let terminationTimer;
    let terminationResult = null;

    const cleanup = () => {
      if (timer !== undefined) clearTimer(timer);
      if (terminationTimer !== undefined) clearTimer(terminationTimer);
      signal?.removeEventListener('abort', handleAbort);
    };
    const settle = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const terminate = (result) => {
      if (settled || terminationResult) return;
      terminationResult = result;
      try {
        child.kill();
      } catch {
        // The forced attempt below remains the final bounded fallback.
      }
      child.stdout?.destroy?.();
      child.stderr?.destroy?.();
      terminationTimer = setTimer(() => {
        if (settled) return;
        try {
          child.kill('SIGKILL');
        } catch {
          // The final timer below bounds a child that cannot be signalled.
        }
        terminationTimer = setTimer(
          () => settle({ status: 'error', reason: 'worker-failed' }),
          terminationTimeoutMs,
        );
        terminationTimer?.unref?.();
      }, terminationTimeoutMs);
      terminationTimer?.unref?.();
    };
    const handleAbort = () =>
      terminate({ status: 'error', reason: 'cancelled' });

    child.stdout?.on('data', (chunk) => {
      if (settled || terminationResult) return;
      const bytes = Buffer.from(chunk);
      if (bytes.length > maxStdoutBytes - stdout.length) {
        terminate({ status: 'error', reason: 'schema-error' });
        return;
      }
      stdout = Buffer.concat([stdout, bytes]);
    });
    child.stderr?.on('data', (chunk) => {
      if (settled || terminationResult) return;
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > MAX_STDERR_BYTES) {
        stderrBytes = MAX_STDERR_BYTES + 1;
        terminate({ status: 'error', reason: 'worker-failed' });
      }
    });
    child.stdin?.on?.('error', () =>
      terminate({ status: 'error', reason: 'worker-failed' }),
    );
    child.on('error', () => {
      if (terminationResult) return;
      settle({ status: 'error', reason: 'worker-failed' });
    });
    child.on('close', (code) => {
      if (stderrBytes > 0) {
        logger.warn?.('[artist-photo] Worker emitted stderr', null, {
          reason: 'stderr-output',
        });
      }
      if (settled) return;
      if (terminationResult) {
        settle(terminationResult);
        return;
      }
      if (code !== 0) {
        settle({ status: 'error', reason: 'worker-failed' });
        return;
      }
      try {
        const text = stdout.toString('utf8').trim();
        if (!text || text.split(/\r?\n/u).length !== 1) {
          throw new TypeError('invalid worker output');
        }
        const result = validateWorkerResult(JSON.parse(text));
        settle(result || { status: 'error', reason: 'schema-error' });
      } catch {
        settle({ status: 'error', reason: 'schema-error' });
      }
    });

    signal?.addEventListener('abort', handleAbort, { once: true });
    timer = setTimer(
      () => terminate({ status: 'error', reason: 'timeout' }),
      timeoutMs,
    );
    timer?.unref?.();
    try {
      child.stdin.end(input);
    } catch {
      terminate({ status: 'error', reason: 'worker-failed' });
    }
  });
}

module.exports = {
  isValidWorkerRequest,
  runYtMusicArtistPhotoWorker,
  validateWorkerResult,
};
