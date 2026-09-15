'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES = 512 * 1024 * 1024;
// A stalled connection (accepted but silently sending nothing) previously
// hung both downloadBuffer() and downloadText() forever, with no way for the
// renderer to recover short of restarting the whole app — bare `fetch(url)`
// had no timeout at all. Metadata fetches are small and bounded, so a fixed
// deadline is fine; a dependency archive can legitimately take minutes on a
// slow connection, so it gets an *idle* timeout instead (reset on every
// chunk) rather than a fixed one, so a slow-but-progressing download is
// never wrongly aborted.
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_METADATA_TIMEOUT_MS = 15_000;

function timeoutError(message) {
  return Object.assign(new Error(message), { name: 'TimeoutError' });
}

function isAbortLike(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

// One AbortController reused for the whole request: aborting it after
// headers have already arrived still errors the in-flight body stream (part
// of the Fetch spec), so a single idle window correctly covers both "never
// got a response" and "stopped sending mid-transfer" without needing a
// second controller for the body-read phase.
function createIdleAbort(idleTimeoutMs) {
  const controller = new AbortController();
  let timer = null;
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(timeoutError('feature dependency download stalled'));
    }, idleTimeoutMs);
    timer.unref?.();
  }
  function disarm() {
    clearTimeout(timer);
  }
  arm();
  return { signal: controller.signal, arm, disarm };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function emitProgress(options, payload) {
  options.onProgress?.(payload);
}

function readContentLength(response) {
  const value = response.headers?.get?.('content-length');
  const total = Number(value);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function downloadSizeLimit(dependency) {
  const maxDownloadSize = Number(dependency?.maxDownloadSize);
  if (Number.isSafeInteger(maxDownloadSize) && maxDownloadSize > 0) {
    return maxDownloadSize;
  }

  const expectedSize = Number(dependency?.expectedSize);
  return Number.isSafeInteger(expectedSize) && expectedSize > 0
    ? expectedSize
    : DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES;
}

function dependencyDownloadLabel(dependency) {
  return dependency?.role || dependency?.id || dependency?.name || 'dependency';
}

function assertDownloadSizeWithinLimit(size, dependency) {
  const limit = downloadSizeLimit(dependency);
  if (size > limit) {
    throw new Error(
      `Downloaded ${dependencyDownloadLabel(dependency)} exceeds allowed size (${size} > ${limit})`,
    );
  }
}

async function readResponseBuffer(
  response,
  options = {},
  dependency = null,
  idle = null,
) {
  const total = readContentLength(response);
  if (total) assertDownloadSizeWithinLimit(total, dependency);

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertDownloadSizeWithinLimit(buffer.length, dependency);
    emitProgress(options, { stage: 'downloading', percent: 100 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastPercent = -1;

  for (;;) {
    const { done, value } = await reader.read();
    // Activity (a chunk, or a clean close) — push the stall deadline out
    // again rather than judging the whole transfer against one fixed clock.
    idle?.arm();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    received += chunk.length;
    assertDownloadSizeWithinLimit(received, dependency);

    if (total) {
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        emitProgress(options, { stage: 'downloading', percent });
      }
    } else {
      emitProgress(options, { stage: 'downloading' });
    }
  }

  if (total && lastPercent < 100) {
    emitProgress(options, { stage: 'downloading', percent: 100 });
  }
  return Buffer.concat(chunks);
}

async function downloadBuffer(
  url,
  fetchImpl = fetch,
  options = {},
  dependency = null,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
) {
  const idle = createIdleAbort(idleTimeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { signal: idle.signal });
  } catch (error) {
    idle.disarm();
    throw isAbortLike(error)
      ? timeoutError('Feature dependency download timed out')
      : error;
  }
  // Headers arrived — that's activity, so restart the idle window for the
  // body read rather than letting the connect-phase deadline govern it too.
  idle.arm();
  if (!response.ok) {
    idle.disarm();
    await response.body?.cancel?.().catch(() => undefined);
    throw new Error(
      `Failed to download feature dependency: HTTP ${response.status}`,
    );
  }
  try {
    return await readResponseBuffer(response, options, dependency, idle);
  } catch (error) {
    throw isAbortLike(error)
      ? timeoutError('Feature dependency download timed out')
      : error;
  } finally {
    idle.disarm();
  }
}

async function downloadText(
  url,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_METADATA_TIMEOUT_MS,
) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw isAbortLike(error)
      ? timeoutError('Feature dependency metadata request timed out')
      : error;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency metadata: HTTP ${response.status}`,
    );
  }
  return (await response.text()).trim();
}

module.exports = {
  dependencyDownloadLabel,
  downloadBuffer,
  downloadText,
  emitProgress,
  sha256,
};
