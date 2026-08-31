'use strict';

const crypto = require('crypto');
const { setTimeout: sleepFor } = require('node:timers/promises');
const packageMetadata = require('../../../package.json');
const { DEFAULT_AMLL_TTML_RESPONSE_BYTES } = require('../amll/ttml.js');

const BETTER_LYRICS_API_BASE_URL = 'https://lyrics-api.boidu.dev';
const MAX_QUERY_CHARS = 256;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const USER_AGENT = `Utawakui/${packageMetadata.version} (lyrics-provider)`;
const CACHE_STATUSES = new Set(['HIT', 'MISS', 'NEGATIVE_HIT', 'STALE']);

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127;
  });
}

function normalizeText(value, required = false) {
  if (value === undefined || value === null) return required ? null : '';
  if (
    typeof value !== 'string' ||
    value.length > MAX_QUERY_CHARS ||
    containsControlCharacter(value)
  ) {
    return null;
  }
  const normalized = value.trim();
  return required && !normalized ? null : normalized;
}

function normalizeQuery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    Object.keys(value).some(
      (key) =>
        !['trackName', 'artistName', 'albumName', 'duration'].includes(key),
    )
  ) {
    return null;
  }
  const trackName = normalizeText(value.trackName, true);
  const artistName = normalizeText(value.artistName, true);
  const albumName = normalizeText(value.albumName);
  if (
    !trackName ||
    !artistName ||
    albumName === null ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0 ||
    value.duration > MAX_DURATION_SECONDS
  ) {
    return null;
  }
  return {
    trackName,
    artistName,
    albumName,
    duration: Math.max(1, Math.round(value.duration)),
  };
}

function betterLyricsQueryId(query) {
  const digest = crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        query.trackName,
        query.artistName,
        query.albumName,
        query.duration,
      ]),
    )
    .digest('hex');
  return Math.max(1, Number.parseInt(digest.slice(0, 12), 16));
}

function buildBetterLyricsUrl(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) throw new TypeError('invalid Better Lyrics request');
  const url = new URL('/getLyrics', BETTER_LYRICS_API_BASE_URL);
  url.searchParams.set('s', normalized.trackName);
  url.searchParams.set('a', normalized.artistName);
  if (normalized.albumName) url.searchParams.set('al', normalized.albumName);
  url.searchParams.set('d', String(normalized.duration));
  return url;
}

function mapHttpFailure(status) {
  if (status === 401) return { status: 'unavailable', reason: 'cache-miss' };
  if (status === 404) return { status: 'unavailable', reason: 'not-found' };
  if (status === 429) return { status: 'error', reason: 'rate-limited' };
  if (status >= 500) return { status: 'error', reason: 'service-unavailable' };
  return { status: 'error', reason: 'http-error', httpStatus: status };
}

async function readBoundedText(response, maximumBytes) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { status: 'error', reason: 'response-too-large' };
  }
  if (!response.body) return { status: 'ok', text: '' };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 'error', reason: 'response-too-large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { status: 'ok', text };
  } finally {
    reader.releaseLock();
  }
}

function createBetterLyricsScheduler(options = {}) {
  const minimumIntervalMs = Math.min(
    10_000,
    Math.max(0, options.minimumIntervalMs ?? 250),
  );
  const now = options.now || Date.now;
  const sleep =
    options.sleep ||
    ((milliseconds, signal) =>
      sleepFor(milliseconds, undefined, signal ? { signal } : undefined));
  let earliestStart = 0;
  let tail = Promise.resolve();
  function schedule(task, scheduleOptions = {}) {
    const operation = tail.then(async () => {
      if (scheduleOptions.signal?.aborted) throw scheduleOptions.signal.reason;
      const wait = Math.max(0, earliestStart - now());
      if (wait > 0) await sleep(wait, scheduleOptions.signal);
      earliestStart = now() + minimumIntervalMs;
      return task();
    });
    tail = operation.catch(() => undefined);
    return operation;
  }
  return { schedule };
}

const sharedScheduler = createBetterLyricsScheduler();

function createBetterLyricsClient(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const scheduler = options.scheduler || sharedScheduler;
  const timeoutMs = Math.min(60_000, Math.max(1, options.timeoutMs ?? 12_000));

  async function getLyrics(query, requestOptions = {}) {
    const normalized = normalizeQuery(query);
    if (!normalized) return { status: 'error', reason: 'invalid-request' };
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = requestOptions.signal
      ? AbortSignal.any([requestOptions.signal, timeoutSignal])
      : timeoutSignal;
    let response;
    try {
      response = await scheduler.schedule(
        () =>
          fetchFn(buildBetterLyricsUrl(normalized), {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
            redirect: 'error',
            signal,
          }),
        { signal: requestOptions.signal },
      );
    } catch (error) {
      return {
        status: 'error',
        reason:
          error?.name === 'AbortError' || error?.name === 'TimeoutError'
            ? 'timeout'
            : 'offline',
      };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return mapHttpFailure(response.status);
    }
    let bounded;
    try {
      bounded = await readBoundedText(
        response,
        DEFAULT_AMLL_TTML_RESPONSE_BYTES,
      );
    } catch (error) {
      return {
        status: 'error',
        reason:
          error?.name === 'AbortError' || error?.name === 'TimeoutError'
            ? 'timeout'
            : 'offline',
      };
    }
    if (bounded.status !== 'ok') return bounded;
    let value;
    try {
      value = JSON.parse(bounded.text);
    } catch {
      return { status: 'error', reason: 'invalid-json' };
    }
    const cacheStatus = response.headers.get('x-cache-status');
    const responseProvider = response.headers.get('x-provider');
    const hasScore = value && Object.hasOwn(value, 'score');
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof value.ttml !== 'string' ||
      value.ttml.length === 0 ||
      (hasScore &&
        (!Number.isFinite(value.score) ||
          value.score < 0 ||
          value.score > 100)) ||
      !CACHE_STATUSES.has(cacheStatus) ||
      (responseProvider !== null && responseProvider !== 'ttml')
    ) {
      return { status: 'error', reason: 'invalid-record' };
    }
    return {
      status: 'ok',
      record: {
        id: betterLyricsQueryId(normalized),
        ...normalized,
        ...(hasScore ? { score: value.score } : {}),
        cacheStatus,
        ttml: value.ttml,
      },
    };
  }

  return { getLyrics };
}

module.exports = {
  BETTER_LYRICS_API_BASE_URL,
  buildBetterLyricsUrl,
  createBetterLyricsClient,
  createBetterLyricsScheduler,
};
