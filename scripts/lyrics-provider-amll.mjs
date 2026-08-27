import { createRequire } from 'node:module';
import { setTimeout as sleepFor } from 'node:timers/promises';
import {
  classifyAmllTtml,
  DEFAULT_AMLL_TTML_RESPONSE_BYTES,
} from './lyrics-provider-amll-ttml.mjs';
import { createAmllEvaluationProbeWithDependencies } from './lyrics-provider-amll-probe.mjs';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');

export { classifyAmllTtml } from './lyrics-provider-amll-ttml.mjs';
export {
  rankAmllEvaluationCandidates,
  toAmllEvaluationObservation,
} from './lyrics-provider-amll-probe.mjs';

export const AMLL_API_BASE_URL = 'https://api.amll.dev';
export const DEFAULT_AMLL_TIMEOUT_MS = 10_000;
export const DEFAULT_AMLL_SEARCH_RESPONSE_BYTES = 512 * 1024;
export { DEFAULT_AMLL_TTML_RESPONSE_BYTES } from './lyrics-provider-amll-ttml.mjs';
const AMLL_USER_AGENT = `Utawakui/${packageMetadata.version} (lyrics-provider-evaluation)`;

const MAX_QUERY_TEXT = 256;
const MAX_SEARCH_PAGE_SIZE = 25;
const MAX_METADATA_VALUES = 16;
const MAX_METADATA_TEXT = 256;
const SAFE_FILENAME_RE = /^[a-z0-9._-]{1,155}\.ttml$/iu;
const MAX_EVALUATION_DURATION_MS = 120_000;
const DEFAULT_AMLL_MINIMUM_INTERVAL_MS = 100;

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return Object.assign(new Error('operation aborted'), { name: 'AbortError' });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function defaultAmllSleep(milliseconds, signal) {
  return signal
    ? sleepFor(milliseconds, undefined, { signal })
    : sleepFor(milliseconds);
}

export function createAmllEvaluationScheduler(options = {}) {
  const minimumIntervalMs = boundedOption(
    options.minimumIntervalMs,
    DEFAULT_AMLL_MINIMUM_INTERVAL_MS,
    10_000,
  );
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep =
    typeof options.sleep === 'function' ? options.sleep : defaultAmllSleep;
  let earliestStartMs = 0;
  let tail = Promise.resolve();

  function schedule(task, scheduleOptions = {}) {
    if (typeof task !== 'function') {
      return Promise.reject(new TypeError('AMLL scheduled task is invalid'));
    }
    const signal = scheduleOptions.signal;
    const run = tail.then(async () => {
      throwIfAborted(signal);
      const waitMs = Math.max(0, earliestStartMs - now());
      if (waitMs > 0) {
        if (signal) await sleep(waitMs, signal);
        else await sleep(waitMs);
      }
      throwIfAborted(signal);
      earliestStartMs = now() + minimumIntervalMs;
      return task();
    });
    tail = run.catch(() => undefined);
    return run;
  }

  return { schedule };
}

const sharedAmllEvaluationScheduler = createAmllEvaluationScheduler();

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function hasOnlyKeys(value, allowed) {
  return (
    isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key))
  );
}

function containsControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function validText(value, { required = false } = {}) {
  if (value === undefined || value === null) return !required;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_QUERY_TEXT &&
    !containsControlCharacter(value)
  );
}

function normalizeSearchQuery(value) {
  const allowed = new Set([
    'trackName',
    'artistName',
    'albumName',
    'page',
    'pageSize',
  ]);
  if (
    !hasOnlyKeys(value, allowed) ||
    !validText(value.trackName, { required: true })
  ) {
    return null;
  }
  if (!validText(value.artistName) || !validText(value.albumName)) return null;
  const page = value.page ?? 1;
  const pageSize = value.pageSize ?? 10;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10_000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_SEARCH_PAGE_SIZE
  ) {
    return null;
  }
  return {
    trackName: value.trackName.trim(),
    artistName: value.artistName?.trim() || null,
    albumName: value.albumName?.trim() || null,
    page,
    pageSize,
  };
}

export function buildAmllSearchUrl(query) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    throw new TypeError('invalid AMLL search request');
  }
  const url = new URL('/v1/lyrics/search', AMLL_API_BASE_URL);
  url.searchParams.set('musicName', normalized.trackName);
  if (normalized.artistName) {
    url.searchParams.set('artistName', normalized.artistName);
  }
  if (normalized.albumName) {
    url.searchParams.set('albumName', normalized.albumName);
  }
  url.searchParams.set('page', String(normalized.page));
  url.searchParams.set('pageSize', String(normalized.pageSize));
  return url;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value) || value.length > MAX_METADATA_VALUES) return null;
  const normalized = [];
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > MAX_METADATA_TEXT ||
      containsControlCharacter(item)
    ) {
      return null;
    }
    normalized.push(item);
  }
  return normalized;
}

function normalizeSongItem(value, { requireLyrics = false } = {}) {
  if (!isPlainObject(value)) return null;
  if (
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.filename !== 'string' ||
    !SAFE_FILENAME_RE.test(value.filename) ||
    value.format !== 'ttml' ||
    (requireLyrics &&
      (typeof value.lyrics !== 'string' || value.lyrics.length === 0))
  ) {
    return null;
  }
  const fields = [
    'musicNames',
    'artistNames',
    'albumNames',
    'ncmMusicIds',
    'qqMusicIds',
    'appleMusicIds',
    'spotifyIds',
    'isrcs',
    'authorIds',
    'authorUsernames',
  ];
  const normalized = { id: value.id, filename: value.filename };
  for (const field of fields) {
    const array = normalizeStringArray(value[field]);
    if (!array) return null;
    normalized[field] = array;
  }
  if (
    normalized.musicNames.length === 0 ||
    normalized.artistNames.length === 0
  ) {
    return null;
  }
  normalized.format = 'ttml';
  return normalized;
}

function normalizePagination(value, itemCount, expectedPage, expectedPageSize) {
  if (!isPlainObject(value)) return null;
  const { page, pageSize, total, totalPages, hasMore } = value;
  if (
    !Number.isSafeInteger(page) ||
    page !== expectedPage ||
    !Number.isSafeInteger(pageSize) ||
    pageSize !== expectedPageSize ||
    !Number.isSafeInteger(total) ||
    total < itemCount ||
    total > 100_000_000 ||
    !Number.isSafeInteger(totalPages) ||
    totalPages < 0 ||
    typeof hasMore !== 'boolean'
  ) {
    return null;
  }
  const expectedTotalPages = Math.ceil(total / pageSize);
  if (totalPages !== expectedTotalPages || hasMore !== page < totalPages) {
    return null;
  }
  return { page, pageSize, total, totalPages, hasMore };
}

function boundedOption(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

async function readBoundedText(response, maximumBytes, signal) {
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
  } catch (error) {
    const failure = signal?.aborted ? signal.reason : error;
    return {
      status: 'error',
      reason:
        failure?.name === 'TimeoutError' || failure?.name === 'AbortError'
          ? 'timeout'
          : 'offline',
    };
  } finally {
    reader.releaseLock();
  }
}

function parseJson(value) {
  try {
    return { status: 'ok', value: JSON.parse(value) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
}

function mapHttpFailure(status) {
  if (status === 404) return { status: 'unavailable', reason: 'not-found' };
  if (status === 429) return { status: 'error', reason: 'rate-limited' };
  if (new Set([500, 502, 503]).has(status)) {
    return { status: 'error', reason: 'service-unavailable' };
  }
  return { status: 'error', reason: 'http-error' };
}

function mapEnvelopeFailure(value) {
  if (!isPlainObject(value) || !Number.isInteger(value.status)) {
    return { status: 'error', reason: 'invalid-record' };
  }
  if (value.status !== 200) return mapHttpFailure(value.status);
  return null;
}

export function createAmllEvaluationClient(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AMLL_TIMEOUT_MS;
  const maxSearchResponseBytes = boundedOption(
    options.maxSearchResponseBytes,
    DEFAULT_AMLL_SEARCH_RESPONSE_BYTES,
    DEFAULT_AMLL_SEARCH_RESPONSE_BYTES,
  );
  const maxTtmlResponseBytes = boundedOption(
    options.maxTtmlResponseBytes,
    DEFAULT_AMLL_TTML_RESPONSE_BYTES,
    DEFAULT_AMLL_TTML_RESPONSE_BYTES,
  );
  const boundedTimeoutMs = boundedOption(
    timeoutMs,
    DEFAULT_AMLL_TIMEOUT_MS,
    60_000,
  );
  const now = options.now || (() => performance.now());
  const scheduler =
    options.scheduler && typeof options.scheduler.schedule === 'function'
      ? options.scheduler
      : sharedAmllEvaluationScheduler;
  const acquisitionSignal = options.signal;

  function elapsed(startedAt) {
    const measured = Math.round(now() - startedAt);
    return Number.isSafeInteger(measured)
      ? Math.min(MAX_EVALUATION_DURATION_MS, Math.max(0, measured))
      : 0;
  }

  async function request(url, maximumBytes) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable', durationMs: 0 };
    }
    const startedAt = now();
    let response;
    let requestSignal;
    try {
      response = await scheduler.schedule(
        () => {
          const requestTimeoutSignal = AbortSignal.timeout(boundedTimeoutMs);
          requestSignal = acquisitionSignal
            ? AbortSignal.any([acquisitionSignal, requestTimeoutSignal])
            : requestTimeoutSignal;
          return fetchFn(url, {
            headers: {
              Accept: 'application/json',
              'User-Agent': AMLL_USER_AGENT,
            },
            redirect: 'error',
            signal: requestSignal,
          });
        },
        { signal: acquisitionSignal },
      );
    } catch (error) {
      return {
        status: 'error',
        reason:
          error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'timeout'
            : 'offline',
        durationMs: elapsed(startedAt),
      };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ...mapHttpFailure(response.status),
        durationMs: elapsed(startedAt),
      };
    }
    const bounded = await readBoundedText(
      response,
      maximumBytes,
      requestSignal,
    );
    const durationMs = elapsed(startedAt);
    if (bounded.status === 'error') return { ...bounded, durationMs };
    const parsed = parseJson(bounded.text);
    if (parsed.status === 'error') return { ...parsed, durationMs };
    const envelopeFailure = mapEnvelopeFailure(parsed.value);
    if (envelopeFailure) return { ...envelopeFailure, durationMs };
    return { status: 'ok', value: parsed.value.data, durationMs };
  }

  async function search(query) {
    const normalized = normalizeSearchQuery(query);
    if (!normalized) {
      return { status: 'error', reason: 'invalid-request', durationMs: 0 };
    }
    const result = await request(
      buildAmllSearchUrl(normalized),
      maxSearchResponseBytes,
    );
    if (result.status === 'unavailable') {
      return {
        status: 'ok',
        records: [],
        invalidRecordCount: 0,
        pagination: null,
        durationMs: result.durationMs,
      };
    }
    if (result.status === 'error') return result;
    if (
      !isPlainObject(result.value) ||
      !Array.isArray(result.value.items) ||
      result.value.items.length > normalized.pageSize
    ) {
      return {
        status: 'error',
        reason: 'invalid-record',
        durationMs: result.durationMs,
      };
    }
    const pagination = normalizePagination(
      result.value.pagination,
      result.value.items.length,
      normalized.page,
      normalized.pageSize,
    );
    if (!pagination) {
      return {
        status: 'error',
        reason: 'invalid-record',
        durationMs: result.durationMs,
      };
    }
    const records = [];
    let invalidRecordCount = 0;
    for (const item of result.value.items) {
      const normalizedItem = normalizeSongItem(item);
      if (normalizedItem) records.push(normalizedItem);
      else invalidRecordCount += 1;
    }
    return {
      status: 'ok',
      records,
      invalidRecordCount,
      pagination,
      durationMs: result.durationMs,
    };
  }

  async function getById(recordId) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0) {
      return { status: 'error', reason: 'invalid-request', durationMs: 0 };
    }
    const url = new URL('/v1/lyrics/get', AMLL_API_BASE_URL);
    url.searchParams.set('id', String(recordId));
    const result = await request(url, maxTtmlResponseBytes);
    if (result.status !== 'ok') return result;
    const record = normalizeSongItem(result.value, { requireLyrics: true });
    if (!record) {
      return {
        status: 'error',
        reason: 'invalid-record',
        durationMs: result.durationMs,
      };
    }
    const timing = classifyAmllTtml(result.value.lyrics);
    if (timing.status === 'error') {
      return {
        status: 'error',
        reason: timing.reason,
        durationMs: result.durationMs,
      };
    }
    const timingSummary = {
      capability: timing.capability,
      timingValidation: timing.timingValidation,
      timingMode: timing.timingMode,
      lineCount: timing.lineCount,
      timedLineCount: timing.timedLineCount,
      segmentCount: timing.segmentCount,
      invalidSegmentCount: timing.invalidSegmentCount,
    };
    return {
      status: 'ok',
      record,
      timing: timingSummary,
      durationMs: result.durationMs,
    };
  }

  return { search, getById };
}

export function createAmllEvaluationProbe(options = {}) {
  return createAmllEvaluationProbeWithDependencies(
    {
      createClient: createAmllEvaluationClient,
      sharedScheduler: sharedAmllEvaluationScheduler,
    },
    options,
  );
}
