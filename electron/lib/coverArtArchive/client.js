'use strict';

const packageMetadata = require('../../../package.json');
const { readBoundedText } = require('../lrclib/client.js');

const COVER_ART_ARCHIVE_BASE_URL = 'https://coverartarchive.org';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const MAX_IMAGES = 50;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const directScheduler = Object.freeze({
  schedule(operation, options = {}) {
    if (options.signal?.aborted) {
      return Promise.reject(
        options.signal.reason instanceof Error
          ? options.signal.reason
          : Object.assign(new Error('operation aborted'), {
              name: 'AbortError',
            }),
      );
    }
    return operation();
  },
});

function isAllowedCoverArtUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (hostname === 'coverartarchive.org' ||
        hostname === 'archive.org' ||
        hostname.endsWith('.archive.org'))
    );
  } catch {
    return false;
  }
}

function allowedUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !(
        hostname === 'coverartarchive.org' ||
        hostname === 'archive.org' ||
        hostname.endsWith('.archive.org')
      )
    ) {
      return undefined;
    }
    url.protocol = 'https:';
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeCoverArtResponse(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.images)) {
    return { status: 'error', reason: 'invalid-json' };
  }
  if (value.images.length > MAX_IMAGES) {
    return { status: 'error', reason: 'response-too-large' };
  }
  for (const image of value.images) {
    if (!image || image.front !== true) continue;
    const imageUrl = allowedUrl(image.image);
    const previewUrl =
      allowedUrl(image.thumbnails?.['250']) ||
      allowedUrl(image.thumbnails?.small) ||
      allowedUrl(image.thumbnails?.['500']) ||
      imageUrl;
    const applyUrl =
      allowedUrl(image.thumbnails?.['1200']) ||
      allowedUrl(image.thumbnails?.large) ||
      imageUrl;
    if (!imageUrl || !previewUrl || !applyUrl) continue;
    return {
      status: 'ok',
      front: { imageUrl, previewUrl, applyUrl },
    };
  }
  return { status: 'unavailable', reason: 'no-front' };
}

function classifyTransportFailure(error) {
  return {
    status: 'error',
    reason:
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'timeout'
        : 'offline',
  };
}

function createCoverArtArchiveClient(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const scheduler = options.scheduler || directScheduler;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const now = options.now || Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map();

  function remember(key, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { expiresAt: now() + cacheTtlMs, value });
  }

  function readCache(key) {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async function lookupFront(entityType, mbid, requestOptions = {}) {
    if (
      !['release', 'release-group'].includes(entityType) ||
      typeof mbid !== 'string' ||
      !MBID_RE.test(mbid)
    ) {
      return { status: 'error', reason: 'invalid-request' };
    }
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    const url = new URL(
      `/${entityType}/${mbid.toLowerCase()}`,
      COVER_ART_ARCHIVE_BASE_URL,
    );
    const cacheKey = url.href;
    const cached = readCache(cacheKey);
    if (cached) return cached;

    let response;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = requestOptions.signal
      ? AbortSignal.any([requestOptions.signal, timeoutSignal])
      : timeoutSignal;
    let currentUrl = url;
    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        response = await scheduler.schedule(
          () =>
            fetchFn(currentUrl, {
              method: 'GET',
              redirect: 'manual',
              headers: {
                Accept: 'application/json',
                'User-Agent': `Utawakui/${packageMetadata.version}`,
              },
              signal,
            }),
          { signal: requestOptions.signal },
        );
        if (!REDIRECT_STATUSES.has(response.status)) break;
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get('location');
        let resolved;
        try {
          resolved = new URL(location, currentUrl).href;
        } catch {
          return { status: 'error', reason: 'invalid-redirect' };
        }
        const nextUrl = allowedUrl(resolved);
        if (!nextUrl) {
          return { status: 'error', reason: 'redirect-not-allowed' };
        }
        currentUrl = new URL(nextUrl);
        response = undefined;
      }
    } catch (error) {
      return classifyTransportFailure(error);
    }
    if (!response) return { status: 'error', reason: 'too-many-redirects' };
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      const result = { status: 'unavailable', reason: 'not-found' };
      remember(cacheKey, result);
      return result;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: 'error',
        reason:
          response.status === 429
            ? 'rate-limited'
            : response.status === 503
              ? 'service-unavailable'
              : 'http-error',
        httpStatus: response.status,
      };
    }
    const bounded = await readBoundedText(response, maxResponseBytes, signal);
    if (bounded.status === 'error') return bounded;
    let value;
    try {
      value = JSON.parse(bounded.text);
    } catch {
      return { status: 'error', reason: 'invalid-json' };
    }
    const result = normalizeCoverArtResponse(value);
    if (result.status !== 'error') remember(cacheKey, result);
    return result;
  }

  return { lookupFront };
}

module.exports = {
  COVER_ART_ARCHIVE_BASE_URL,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  createCoverArtArchiveClient,
  isAllowedCoverArtUrl,
  normalizeCoverArtResponse,
};
