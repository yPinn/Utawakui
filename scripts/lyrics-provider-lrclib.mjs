import { createRequire } from 'node:module';
import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';

const require = createRequire(import.meta.url);
const {
  searchLrclibCandidates,
} = require('../electron/lib/lrclib/acquisition.js');
const { LRCLIB_API_BASE_URL } = require('../electron/lib/lrclib/client.js');
const {
  sharedLrclibRequestScheduler,
} = require('../electron/lib/lrclib/scheduler.js');

const MAX_TEXT_LENGTH = 256;
const MAX_DURATION_SECONDS = 86_400;
const MAX_DURATION_MS = 120_000;
const MAX_CANDIDATES = 20;
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;
const MAX_PROBE_TIMEOUT_MS = 120_000;
const MATCH_BANDS = new Set(['exact', 'strong', 'related']);
const REVIEW_VERDICTS = new Set(['correct', 'incorrect', 'unreviewed']);
const REFERENCE_VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const FAILURE_CODES = new Set([
  'timeout',
  'offline',
  'fetch-unavailable',
  'invalid-request',
  'response-too-large',
  'invalid-json',
  'invalid-record',
  'rate-limited',
  'service-unavailable',
  'http-error',
  'probe-error',
  'provider-failure',
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

function hasAllowedKeys(value, keys) {
  return (
    isPlainObject(value) && Object.keys(value).every((key) => keys.has(key))
  );
}

function containsControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function validText(value, required = true) {
  if (value === null && !required) return true;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_TEXT_LENGTH &&
    !containsControlCharacter(value)
  );
}

function validReference(value) {
  return (
    hasExactKeys(value, [
      'title',
      'artist',
      'album',
      'durationSeconds',
      'version',
    ]) &&
    validText(value.title) &&
    validText(value.artist) &&
    validText(value.album, false) &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    value.durationSeconds <= MAX_DURATION_SECONDS &&
    REFERENCE_VERSIONS.has(value.version)
  );
}

function boundedDuration(value) {
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded)
    ? Math.min(MAX_DURATION_MS, Math.max(0, rounded))
    : 0;
}

function capabilityProjection(candidate) {
  const value = candidate?.capability;
  const compatibility = candidate?.compatibility;
  if (
    !isPlainObject(value) ||
    typeof value.partial !== 'boolean' ||
    !isPlainObject(compatibility) ||
    !Number.isSafeInteger(candidate.lineCount) ||
    candidate.lineCount < 1 ||
    !Number.isSafeInteger(candidate.segmentCount) ||
    candidate.segmentCount < 0
  ) {
    return null;
  }
  if (value.level === 'T2' && candidate.segmentCount > 0) {
    if (
      value.partial &&
      compatibility.t1 === true &&
      compatibility.t2 === false
    ) {
      return { capability: 'partial-T2', timingValidation: 'partial' };
    }
    return !value.partial && compatibility.t2 === true
      ? { capability: 'T2', timingValidation: 'valid' }
      : null;
  }
  if (value.level === 'T1' && !value.partial && compatibility.t1 === true) {
    return { capability: 'T1', timingValidation: 'not-applicable' };
  }
  if (value.level === 'T0' && !value.partial && compatibility.t0 === true) {
    return { capability: 'T0', timingValidation: 'not-applicable' };
  }
  return null;
}

function validProbeInput(input) {
  const validShape =
    hasExactKeys(input, ['providerId', 'reference']) ||
    hasExactKeys(input, ['caseId', 'providerId', 'tags', 'reference']);
  return (
    validShape &&
    input.providerId === 'lrclib' &&
    validReference(input.reference) &&
    (input.caseId === undefined || /^case-\d{3}$/u.test(input.caseId)) &&
    (input.tags === undefined ||
      (Array.isArray(input.tags) &&
        input.tags.every((tag) => typeof tag === 'string')))
  );
}

function requestFailure(reason, durationMs) {
  return {
    status: 'error',
    reason: FAILURE_CODES.has(reason) ? reason : 'provider-failure',
    durationMs,
  };
}

export function createFixedLrclibEvaluationFetch(fetchFn = globalThis.fetch) {
  if (typeof fetchFn !== 'function') return null;
  return function fixedLrclibFetch(url, options = {}) {
    const parsed = new URL(url);
    if (
      parsed.origin !== LRCLIB_API_BASE_URL ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return Promise.reject(new TypeError('invalid LRCLIB evaluation origin'));
    }
    return fetchFn(parsed, { ...options, redirect: 'error' });
  };
}

export function toLrclibEvaluationObservation(result, options = {}) {
  if (
    !isPlainObject(result) ||
    !Number.isSafeInteger(result.durationMs) ||
    result.durationMs < 0 ||
    result.durationMs > MAX_DURATION_MS
  ) {
    throw new TypeError('invalid LRCLIB evaluation result');
  }
  if (result.status === 'error') {
    if (
      !hasExactKeys(result, ['status', 'reason', 'durationMs']) ||
      !hasExactKeys(options, []) ||
      !FAILURE_CODES.has(result.reason)
    ) {
      throw new TypeError('invalid LRCLIB evaluation failure');
    }
    return normalizeProbeOutcome({
      providerId: 'lrclib',
      request: {
        status: 'failed',
        durationMs: result.durationMs,
        failureCode: result.reason,
      },
      catalogStatus: 'not-evaluated',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });
  }
  if (result.status === 'miss') {
    if (
      !hasExactKeys(result, ['status', 'durationMs']) ||
      !hasExactKeys(options, [])
    ) {
      throw new TypeError('invalid LRCLIB evaluation miss');
    }
    return normalizeProbeOutcome({
      providerId: 'lrclib',
      request: {
        status: 'ok',
        durationMs: result.durationMs,
        failureCode: null,
      },
      catalogStatus: 'miss',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });
  }
  const reviewVerdict = options.reviewVerdict;
  const timing = capabilityProjection(result.candidate);
  if (
    result.status !== 'ok' ||
    !hasExactKeys(result, ['status', 'candidate', 'durationMs']) ||
    !hasExactKeys(options, ['reviewVerdict']) ||
    !isPlainObject(result.candidate) ||
    !MATCH_BANDS.has(result.candidate.matchBand) ||
    !REVIEW_VERDICTS.has(reviewVerdict) ||
    !timing
  ) {
    throw new TypeError('invalid LRCLIB evaluation match');
  }
  return normalizeProbeOutcome({
    providerId: 'lrclib',
    request: { status: 'ok', durationMs: result.durationMs, failureCode: null },
    catalogStatus: 'match',
    matchBand: result.candidate.matchBand,
    reviewVerdict,
    capability: timing.capability,
    timingValidation: timing.timingValidation,
  });
}

function acquisitionResult(value, durationMs) {
  if (!isPlainObject(value) || value.provider !== 'lrclib') {
    return requestFailure('invalid-record', durationMs);
  }
  if (value.status === 'error' || value.status === 'unavailable') {
    return requestFailure(
      value.reason === 'missing-track-title' ? 'invalid-request' : value.reason,
      durationMs,
    );
  }
  if (
    value.status !== 'ok' ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > MAX_CANDIDATES ||
    !Number.isSafeInteger(value.invalidRecordCount) ||
    value.invalidRecordCount < 0
  ) {
    return requestFailure('invalid-record', durationMs);
  }
  if (value.candidates.length === 0) {
    return value.invalidRecordCount > 0
      ? requestFailure('invalid-record', durationMs)
      : { status: 'miss', durationMs };
  }
  const candidate = value.candidates[0];
  if (
    new Set(['instrumental', 'unsupported']).has(candidate?.capability?.level)
  ) {
    return { status: 'miss', durationMs };
  }
  return { status: 'ok', candidate, durationMs };
}

export function createLrclibEvaluationProbe(options = {}) {
  if (
    !hasAllowedKeys(
      options,
      new Set([
        'fetch',
        'searchCandidates',
        'scheduler',
        'probeTimeoutMs',
        'now',
      ]),
    ) ||
    (Object.hasOwn(options, 'fetch') &&
      Object.hasOwn(options, 'searchCandidates')) ||
    (Object.hasOwn(options, 'scheduler') &&
      Object.hasOwn(options, 'searchCandidates'))
  ) {
    throw new TypeError('invalid LRCLIB evaluation probe options');
  }
  const fixedFetch = createFixedLrclibEvaluationFetch(
    Object.hasOwn(options, 'fetch') ? options.fetch : globalThis.fetch,
  );
  const searchCandidates = options.searchCandidates;
  const scheduler = options.scheduler || sharedLrclibRequestScheduler;
  const probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const now = options.now || (() => performance.now());
  if (
    (searchCandidates !== undefined &&
      typeof searchCandidates !== 'function') ||
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    typeof scheduler.deferFor !== 'function' ||
    !Number.isSafeInteger(probeTimeoutMs) ||
    probeTimeoutMs < 1 ||
    probeTimeoutMs > MAX_PROBE_TIMEOUT_MS ||
    typeof now !== 'function'
  ) {
    throw new TypeError('invalid LRCLIB evaluation probe options');
  }
  return async function probe(input) {
    if (!validProbeInput(input)) {
      return toLrclibEvaluationObservation(
        { status: 'error', reason: 'invalid-request', durationMs: 0 },
        {},
      );
    }
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(
        Object.assign(new Error('LRCLIB evaluation probe timed out'), {
          name: 'TimeoutError',
        }),
      );
    }, probeTimeoutMs);
    timeout.unref?.();
    let acquisition;
    try {
      const track = {
        title: input.reference.title,
        artist: input.reference.artist,
        album: input.reference.album,
        duration: input.reference.durationSeconds,
      };
      acquisition = searchCandidates
        ? await searchCandidates(track)
        : await searchLrclibCandidates(track, {
            fetch: fixedFetch,
            scheduler,
            signal: controller.signal,
          });
    } catch {
      return toLrclibEvaluationObservation(
        {
          status: 'error',
          reason: 'probe-error',
          durationMs: boundedDuration(now() - startedAt),
        },
        {},
      );
    } finally {
      clearTimeout(timeout);
    }
    const result = acquisitionResult(
      acquisition,
      boundedDuration(now() - startedAt),
    );
    try {
      return toLrclibEvaluationObservation(
        result,
        result.status === 'ok' ? { reviewVerdict: 'unreviewed' } : {},
      );
    } catch {
      return toLrclibEvaluationObservation(
        {
          status: 'error',
          reason: 'invalid-record',
          durationMs: result.durationMs,
        },
        {},
      );
    }
  };
}
