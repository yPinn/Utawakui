'use strict';

const { PROJECT_URL, appUserAgent } = require('../userAgent.js');
const { normalizeLrclibRecord } = require('./record.js');
const {
  getLyricsRequestPolicy,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const {
  createProviderRequestGuard,
  parseRetryAfterMs,
  isProviderCooldownResponse,
} = require('../providerServiceCooldown.js');

const LRCLIB_API_BASE_URL = 'https://lrclib.net';
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RETRY_AFTER_MS = 5_000;

function buildLrclibUserAgent() {
  return appUserAgent(PROJECT_URL);
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
  return requestFailure(error);
}

async function readBoundedText(response, maxResponseBytes, signal) {
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
  } catch (error) {
    return signal?.aborted
      ? classifyTransportFailure(signal.reason)
      : classifyTransportFailure(error);
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
  const requestGuard = createProviderRequestGuard(fetchFn, options);
  const policy = getLyricsRequestPolicy('lrclib', fetchFn, options);
  const scheduler = policy.scheduler;
  const baseUrl = options.baseUrl || LRCLIB_API_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRetryAfterMs = Math.min(
    options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS,
    DEFAULT_MAX_RETRY_AFTER_MS,
  );
  const userAgent = options.userAgent || buildLrclibUserAgent();
  const acquisitionSignal = options.signal;

  async function request(endpoint, params, requestOptions = {}) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    const url = buildUrl(endpoint, params, baseUrl);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      let requestSignal;
      let retryAllowed = false;
      try {
        response = await scheduler.schedule(
          async () => {
            const requestTimeoutSignal = AbortSignal.timeout(timeoutMs);
            const externalSignals = [requestOptions.signal].filter(Boolean);
            requestSignal =
              externalSignals.length > 0
                ? AbortSignal.any([...externalSignals, requestTimeoutSignal])
                : requestTimeoutSignal;
            const fetched = await requestGuard.fetch(
              url,
              {
                headers: { 'User-Agent': userAgent },
                signal: requestSignal,
              },
              requestOptions.charge,
            );
            const delayMs = parseRetryAfterMs(
              fetched.headers.get('retry-after'),
            );
            retryAllowed =
              requestOptions.allowRetry !== false &&
              attempt === 0 &&
              fetched.status === 503 &&
              delayMs > 0 &&
              delayMs <= maxRetryAfterMs;
            if (retryAllowed) scheduler.deferFor(delayMs);
            return fetched;
          },
          {
            signal: requestOptions.signal || acquisitionSignal,
            ...(requestOptions.priority === 'background'
              ? { priority: 'background', minIntervalMs: 1000 }
              : {}),
          },
        );
      } catch (error) {
        return classifyTransportFailure(error);
      }

      if (retryAllowed) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const failureContext = {
          httpStatus: response.status,
          requestSource: isProviderCooldownResponse(response)
            ? 'cooldown'
            : 'network',
        };
        if (response.status === 429) {
          return { status: 'error', reason: 'rate-limited', ...failureContext };
        }
        if (response.status === 503) {
          return {
            status: 'error',
            reason: 'service-unavailable',
            ...failureContext,
          };
        }
        return {
          status: 'error',
          reason: 'http-error',
          ...failureContext,
        };
      }

      const bounded = await readBoundedText(
        response,
        maxResponseBytes,
        requestSignal,
      );
      if (bounded.status === 'error') return bounded;
      return parseJson(bounded.text);
    }

    return { status: 'error', reason: 'http-error' };
  }

  async function readById(recordId, requestOptions) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request(
      `/api/get/${encodeURIComponent(recordId)}`,
      {},
      requestOptions,
    );
    if (result.status === 'error') return result;
    return normalizeLrclibRecord(result.value);
  }

  async function readExact(query, requestOptions) {
    if (!validIdentityQuery(query)) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request(
      '/api/get',
      structuredParams(query),
      requestOptions,
    );
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

  async function readSearch(query, requestOptions) {
    if (!validTitleQuery(query)) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request(
      '/api/search',
      structuredParams(query),
      requestOptions,
    );
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

  async function readBroad(query, requestOptions) {
    if (!query || typeof query.q !== 'string' || query.q.trim().length === 0) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request('/api/search', { q: query.q }, requestOptions);
    if (result.status === 'error') return result;
    return normalizeSearchRecords(result.value);
  }

  async function run(endpoint, params, read, requestOptions = {}) {
    try {
      return await policy.run(
        [baseUrl, endpoint, params, maxResponseBytes],
        (context) => read({ ...requestOptions, ...context }),
        {
          ...requestOptions,
          signal:
            acquisitionSignal && requestOptions.signal
              ? AbortSignal.any([acquisitionSignal, requestOptions.signal])
              : requestOptions.signal || acquisitionSignal,
        },
      );
    } catch (error) {
      return requestFailure(error);
    }
  }
  function getById(recordId, requestOptions = {}) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0)
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    return run(
      `/api/get/${recordId}`,
      {},
      (context) => readById(recordId, context),
      { ...requestOptions, fresh: true },
    );
  }
  function getExact(query, requestOptions) {
    if (!validIdentityQuery(query))
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    const snapshot = { ...query };
    return run(
      '/api/get',
      structuredParams(snapshot),
      (context) => readExact(snapshot, context),
      requestOptions,
    );
  }
  function search(query, requestOptions) {
    if (!validTitleQuery(query))
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    const snapshot = { ...query };
    return run(
      '/api/search',
      structuredParams(snapshot),
      (context) => readSearch(snapshot, context),
      requestOptions,
    );
  }
  function searchBroad(query, requestOptions) {
    if (!query || typeof query.q !== 'string' || !query.q.trim())
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    const snapshot = { q: query.q };
    return run(
      '/api/search',
      snapshot,
      (context) => readBroad(snapshot, context),
      requestOptions,
    );
  }
  return {
    getById,
    getExact,
    search,
    searchBroad,
    invalidateDiscovery: policy.invalidate,
  };
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
