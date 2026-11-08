'use strict';
const { createProviderRequestGuard } = require('../providerServiceCooldown.js');

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

// Some CDNs reset long transfers; resume from the received offset a few times.
const MAX_RESUME_ATTEMPTS = 3;

// A connection lost after headers; the transfer keeps its bytes for a resume.
class InterruptedTransfer extends Error {
  constructor(cause) {
    super('feature dependency transfer interrupted', { cause });
  }
}

function createTransfer() {
  return {
    chunks: [],
    received: 0,
    total: null,
    validator: null,
    lastPercent: -1,
  };
}

function resetTransfer(transfer) {
  transfer.chunks = [];
  transfer.received = 0;
}

function addChunk(transfer, chunk, options, dependency) {
  transfer.chunks.push(chunk);
  transfer.received += chunk.length;
  assertDownloadSizeWithinLimit(transfer.received, dependency);
  if (!transfer.total) {
    emitProgress(options, { stage: 'downloading' });
    return;
  }
  const percent = Math.min(
    100,
    Math.floor((transfer.received / transfer.total) * 100),
  );
  if (percent > transfer.lastPercent) {
    transfer.lastPercent = percent;
    emitProgress(options, { stage: 'downloading', percent });
  }
}

async function readResponseBuffer(
  response,
  options = {},
  dependency = null,
  idle = null,
  transfer = createTransfer(),
) {
  if (transfer.total === null) {
    transfer.total = readContentLength(response);
    if (transfer.total)
      assertDownloadSizeWithinLimit(transfer.total, dependency);
  }

  if (!response.body?.getReader) {
    let body;
    try {
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw isAbortLike(error) ? error : new InterruptedTransfer(error);
    }
    transfer.chunks.push(body);
    transfer.received += body.length;
    assertDownloadSizeWithinLimit(transfer.received, dependency);
    emitProgress(options, { stage: 'downloading', percent: 100 });
    return Buffer.concat(transfer.chunks);
  }

  const reader = response.body.getReader();
  for (;;) {
    let result;
    try {
      result = await reader.read();
    } catch (error) {
      throw isAbortLike(error) ? error : new InterruptedTransfer(error);
    }
    // Activity (a chunk, or a clean close) — push the stall deadline out
    // again rather than judging the whole transfer against one fixed clock.
    idle?.arm();
    if (result.done) break;
    addChunk(transfer, Buffer.from(result.value), options, dependency);
  }

  if (transfer.total && transfer.lastPercent < 100) {
    emitProgress(options, { stage: 'downloading', percent: 100 });
  }
  return Buffer.concat(transfer.chunks);
}

// A strong ETag or Last-Modified lets the server refuse a range of a changed file.
function rangeValidator(response) {
  const etag = response.headers?.get?.('etag');
  if (etag && !etag.startsWith('W/')) return etag;
  return response.headers?.get?.('last-modified') || null;
}

function contentRangeStart(response, transfer) {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/u.exec(
    response.headers?.get?.('content-range') ?? '',
  );
  if (!match) return null;
  if (match[3] !== '*' && transfer.total && Number(match[3]) !== transfer.total)
    return null;
  return Number(match[1]);
}

async function requestAttempt(url, fetchImpl, idle, transfer) {
  const init = { signal: idle.signal };
  if (transfer.received > 0) {
    init.headers = { Range: `bytes=${transfer.received}-` };
    if (transfer.validator) init.headers['If-Range'] = transfer.validator;
  }
  const response = await createProviderRequestGuard(fetchImpl).fetch(url, init);
  if (!response.ok) return response;
  if (transfer.received === 0) {
    transfer.validator = rangeValidator(response);
  } else if (response.status === 206) {
    if (contentRangeStart(response, transfer) !== transfer.received) {
      await response.body?.cancel?.().catch(() => undefined);
      resetTransfer(transfer);
      throw new InterruptedTransfer(
        new Error('Resumed range did not match the received bytes'),
      );
    }
  } else {
    // The server sent the whole file again (range ignored or file changed).
    resetTransfer(transfer);
    transfer.total = null;
    transfer.validator = rangeValidator(response);
  }
  return response;
}

async function downloadAttempt(
  url,
  fetchImpl,
  options,
  dependency,
  idleTimeoutMs,
  transfer,
) {
  const resuming = transfer.received > 0;
  const idle = createIdleAbort(idleTimeoutMs);
  let response;
  try {
    response = await requestAttempt(url, fetchImpl, idle, transfer);
  } catch (error) {
    idle.disarm();
    if (isAbortLike(error))
      throw timeoutError('Feature dependency download timed out');
    // A failed first connection is reported as is; a failed resume retries.
    throw resuming && !(error instanceof InterruptedTransfer)
      ? new InterruptedTransfer(error)
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
    return await readResponseBuffer(
      response,
      options,
      dependency,
      idle,
      transfer,
    );
  } catch (error) {
    throw isAbortLike(error)
      ? timeoutError('Feature dependency download timed out')
      : error;
  } finally {
    idle.disarm();
  }
}

async function downloadBuffer(
  url,
  fetchImpl = fetch,
  options = {},
  dependency = null,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
) {
  const transfer = createTransfer();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await downloadAttempt(
        url,
        fetchImpl,
        options,
        dependency,
        idleTimeoutMs,
        transfer,
      );
    } catch (error) {
      if (!(error instanceof InterruptedTransfer)) throw error;
      if (attempt >= MAX_RESUME_ATTEMPTS) throw error.cause;
    }
  }
}

async function downloadText(
  url,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_METADATA_TIMEOUT_MS,
) {
  let response;
  try {
    response = await createProviderRequestGuard(fetchImpl).fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
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
