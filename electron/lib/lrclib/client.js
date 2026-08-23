'use strict';

const packageMetadata = require('../../../package.json');
const { normalizeLrclibRecord } = require('./record.js');
const { sharedLrclibRequestScheduler } = require('./scheduler.js');

const LRCLIB_API_BASE_URL = 'https://lrclib.net';
const LRCLIB_PROJECT_URL = 'https://github.com/yPinn/Utawakui';
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RETRY_AFTER_MS = 60_000;

function buildLrclibUserAgent() {
  return `Utawakui/${packageMetadata.version} (${LRCLIB_PROJECT_URL})`;
}

function buildUrl(endpoint, params, baseUrl) {
  const url = new URL(
    `${String(baseUrl || LRCLIB_API_BASE_URL).replace(/\/+$/u, '')}${endpoint}`,
  );
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

function classifyTransportFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { status: 'error', reason: 'timeout' };
  }
  return { status: 'error', reason: 'offline' };
}

function parseRetryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const normalized = value.trim();
  if (/^-?\d+(?:\.\d+)?$/u.test(normalized)) {
    const seconds = Number(normalized);
    return seconds >= 0 ? seconds * 1000 : null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now);
}

async function readBoundedText(response, maxResponseBytes) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { status: 'error', reason: 'response-too-large' };
  }

  if (!response.body) return { status: 'ok', text: '' };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 'error', reason: 'response-too-large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { status: 'ok', text };
  } catch {
    return { status: 'error', reason: 'offline' };
  } finally {
    reader.releaseLock();
  }
}

function parseJson(text) {
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
}

function normalizeSearchRecords(value) {
  if (!Array.isArray(value)) {
    return { status: 'error', reason: 'invalid-json' };
  }
  const records = [];
  let invalidRecordCount = 0;
  for (const candidate of value) {
    const normalized = normalizeLrclibRecord(candidate);
    if (normalized.status === 'ok') records.push(normalized.record);
    else invalidRecordCount += 1;
  }
  return { status: 'ok', records, invalidRecordCount };
}

function structuredParams(query) {
  return {
    track_name: query.trackName,
    artist_name: query.artistName,
    album_name: query.albumName,
    duration: query.duration,
  };
}

function validTitleQuery(query) {
  return (
    query &&
    typeof query.trackName === 'string' &&
    query.trackName.trim().length > 0
  );
}

function validIdentityQuery(query) {
  return (
    validTitleQuery(query) &&
    typeof query.artistName === 'string' &&
    query.artistName.trim().length > 0
  );
}

function createLrclibClient(options = {}) {
  const hasInjectedFetch = Object.prototype.hasOwnProperty.call(
    options,
    'fetch',
  );
  const fetchFn = hasInjectedFetch ? options.fetch : globalThis.fetch;
  const scheduler = options.scheduler || sharedLrclibRequestScheduler;
  const baseUrl = options.baseUrl || LRCLIB_API_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  const userAgent = options.userAgent || buildLrclibUserAgent();

  async function request(endpoint, params) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    const url = buildUrl(endpoint, params, baseUrl);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await scheduler.schedule(() =>
          fetchFn(url, {
            headers: { 'User-Agent': userAgent },
            signal: AbortSignal.timeout(timeoutMs),
          }),
        );
      } catch (error) {
        return classifyTransportFailure(error);
      }

      const retryAfterMs = parseRetryAfterMs(
        response.headers.get('retry-after'),
      );
      const isRetryable =
        response.status === 429 ||
        (response.status === 503 && retryAfterMs !== null);
      if (attempt === 0 && isRetryable && retryAfterMs !== null) {
        await response.body?.cancel().catch(() => undefined);
        scheduler.deferFor(Math.min(retryAfterMs, maxRetryAfterMs));
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) {
          return { status: 'error', reason: 'rate-limited' };
        }
        if (response.status === 503) {
          return { status: 'error', reason: 'service-unavailable' };
        }
        return {
          status: 'error',
          reason: 'http-error',
          httpStatus: response.status,
        };
      }

      const bounded = await readBoundedText(response, maxResponseBytes);
      if (bounded.status === 'error') return bounded;
      return parseJson(bounded.text);
    }

    return { status: 'error', reason: 'http-error' };
  }

  async function getById(recordId) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request(
      `/api/get/${encodeURIComponent(recordId)}`,
      {},
    );
    if (result.status === 'error') return result;
    return normalizeLrclibRecord(result.value);
  }

  async function getExact(query) {
    if (!validIdentityQuery(query)) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request('/api/get', structuredParams(query));
    if (
      result.status === 'error' &&
      result.reason === 'http-error' &&
      result.httpStatus === 404
    ) {
      return { status: 'unavailable', reason: 'not-found' };
    }
    if (result.status === 'error') return result;
    return normalizeLrclibRecord(result.value);
  }

  async function search(query) {
    if (!validTitleQuery(query)) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request('/api/search', structuredParams(query));
    if (
      result.status === 'error' &&
      result.reason === 'http-error' &&
      result.httpStatus === 404
    ) {
      return { status: 'ok', records: [], invalidRecordCount: 0 };
    }
    if (result.status === 'error') return result;
    return normalizeSearchRecords(result.value);
  }

  async function searchBroad(query) {
    if (!query || typeof query.q !== 'string' || query.q.trim().length === 0) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request('/api/search', { q: query.q });
    if (result.status === 'error') return result;
    return normalizeSearchRecords(result.value);
  }

  return { getById, getExact, search, searchBroad };
}

module.exports = {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MAX_RETRY_AFTER_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  LRCLIB_API_BASE_URL,
  buildLrclibUserAgent,
  createLrclibClient,
  parseRetryAfterMs,
  readBoundedText,
};
