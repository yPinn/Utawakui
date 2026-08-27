import { createRequire } from 'node:module';
import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';

const require = createRequire(import.meta.url);
const { textMatchScore } = require('../electron/lib/lrclib/matching.js');

const MAX_TEXT_LENGTH = 256;
const MAX_DURATION_SECONDS = 86_400;
const MAX_EVALUATION_DURATION_MS = 120_000;
const DEFAULT_AMLL_PROBE_TIMEOUT_MS = 30_000;
const MAX_AMLL_PROBE_TIMEOUT_MS = 120_000;
const REFERENCE_VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const MATCH_BANDS = new Set(['exact', 'strong', 'related']);
const REVIEW_VERDICTS = new Set(['correct', 'incorrect', 'unreviewed']);
const BAND_ORDER = Object.freeze({ exact: 0, strong: 1, related: 2 });
const VERSION_MARKERS = Object.freeze({
  live: ['live', 'live版', '现场', '現場', '演唱会', '演唱會', 'ライブ'],
  remaster: ['remaster', 'remastered', '重制', '重製'],
  cover: ['cover', '翻唱', 'カバー'],
  remix: ['remix', 'mix版', 'リミックス'],
  acoustic: ['acoustic', 'unplugged', '不插电', '不插電', 'アコースティック'],
});

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

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
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
    value.length <= MAX_TEXT_LENGTH &&
    !containsControlCharacter(value)
  );
}

function validEvaluationReference(value) {
  return (
    hasExactKeys(value, [
      'title',
      'artist',
      'album',
      'durationSeconds',
      'version',
    ]) &&
    validText(value.title, { required: true }) &&
    validText(value.artist, { required: true }) &&
    validText(value.album) &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    value.durationSeconds <= MAX_DURATION_SECONDS &&
    REFERENCE_VERSIONS.has(value.version)
  );
}

function maximumTextScore(expected, values) {
  return Math.max(
    0,
    ...(Array.isArray(values)
      ? values.map((value) => textMatchScore(expected, value))
      : []),
  );
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function containsVersionMarker(metadata, marker) {
  if (!/^[a-z ]+$/u.test(marker)) return metadata.includes(marker);
  const phrase = escapeRegularExpression(marker).replace(/ /gu, '\\s+');
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${phrase}(?:$|[^\\p{L}\\p{N}])`,
    'u',
  ).test(metadata);
}

function detectedVersionTerms(record) {
  const metadata = [...(record.musicNames || []), ...(record.albumNames || [])]
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();
  return new Set(
    Object.entries(VERSION_MARKERS)
      .filter(([, markers]) =>
        markers.some((marker) => containsVersionMarker(metadata, marker)),
      )
      .map(([version]) => version),
  );
}

function hasVersionMismatch(reference, record) {
  const detected = detectedVersionTerms(record);
  if (reference.version === 'studio') return detected.size > 0;
  return !detected.has(reference.version) || detected.size > 1;
}

function evaluateAmllCandidate(reference, record) {
  const titleScore = maximumTextScore(reference.title, record.musicNames);
  const artistScore = maximumTextScore(reference.artist, record.artistNames);
  const albumScore = reference.album
    ? maximumTextScore(reference.album, record.albumNames)
    : 1;
  const versionMismatch = hasVersionMismatch(reference, record);
  const matchBand =
    titleScore === 1 &&
    artistScore === 1 &&
    albumScore === 1 &&
    !versionMismatch
      ? 'exact'
      : titleScore >= 0.82 && artistScore >= 0.8 && !versionMismatch
        ? 'strong'
        : 'related';
  return {
    record,
    matchBand,
    titleScore,
    artistScore,
    albumScore,
    versionMismatch,
  };
}

export function rankAmllEvaluationCandidates(reference, records) {
  if (!validEvaluationReference(reference) || !Array.isArray(records)) {
    throw new TypeError('invalid AMLL evaluation reference or records');
  }
  const byId = new Map();
  for (const record of records) {
    if (
      isPlainObject(record) &&
      Number.isSafeInteger(record.id) &&
      record.id > 0 &&
      !byId.has(record.id)
    ) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()]
    .map((record) => evaluateAmllCandidate(reference, record))
    .sort(
      (first, second) =>
        BAND_ORDER[first.matchBand] - BAND_ORDER[second.matchBand] ||
        second.titleScore - first.titleScore ||
        second.artistScore - first.artistScore ||
        second.albumScore - first.albumScore ||
        first.record.id - second.record.id,
    );
}

function validProbeInput(input) {
  const validShape =
    hasExactKeys(input, ['providerId', 'reference']) ||
    hasExactKeys(input, ['caseId', 'providerId', 'tags', 'reference']);
  return (
    validShape &&
    input.providerId === 'amll' &&
    validEvaluationReference(input.reference) &&
    (input.caseId === undefined || /^case-\d{3}$/u.test(input.caseId)) &&
    (input.tags === undefined ||
      (Array.isArray(input.tags) &&
        input.tags.every((tag) => typeof tag === 'string')))
  );
}

function boundedProbeDuration(value) {
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded)
    ? Math.min(MAX_EVALUATION_DURATION_MS, Math.max(0, rounded))
    : 0;
}

export function toAmllEvaluationObservation(result, options = {}) {
  const providerId = options.providerId || 'amll';
  if (!isPlainObject(result) || !Number.isSafeInteger(result.durationMs)) {
    throw new TypeError('invalid AMLL evaluation result');
  }
  if (result.status === 'error') {
    return normalizeProbeOutcome({
      providerId,
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
  if (
    result.status === 'ok' &&
    Array.isArray(result.records) &&
    result.records.length === 0 &&
    Number.isSafeInteger(result.invalidRecordCount) &&
    result.invalidRecordCount > 0
  ) {
    return normalizeProbeOutcome({
      providerId,
      request: {
        status: 'failed',
        durationMs: result.durationMs,
        failureCode: 'invalid-record',
      },
      catalogStatus: 'not-evaluated',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });
  }
  if (
    result.status === 'unavailable' ||
    (result.status === 'ok' &&
      Array.isArray(result.records) &&
      result.records.length === 0)
  ) {
    return normalizeProbeOutcome({
      providerId,
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
  if (
    result.status !== 'ok' ||
    !isPlainObject(result.record) ||
    !isPlainObject(result.timing) ||
    !MATCH_BANDS.has(options.matchBand) ||
    !REVIEW_VERDICTS.has(options.reviewVerdict)
  ) {
    throw new TypeError('invalid AMLL matched evaluation result');
  }
  return normalizeProbeOutcome({
    providerId,
    request: { status: 'ok', durationMs: result.durationMs, failureCode: null },
    catalogStatus: 'match',
    matchBand: options.matchBand,
    reviewVerdict: options.reviewVerdict,
    capability: result.timing.capability,
    timingValidation: result.timing.timingValidation,
  });
}

function probeFailure(reason, durationMs) {
  return toAmllEvaluationObservation(
    { status: 'error', reason, durationMs },
    { providerId: 'amll' },
  );
}

export function createAmllEvaluationProbeWithDependencies(
  dependencies,
  options = {},
) {
  if (
    !hasExactKeys(dependencies, ['createClient', 'sharedScheduler']) ||
    typeof dependencies.createClient !== 'function' ||
    !dependencies.sharedScheduler ||
    typeof dependencies.sharedScheduler.schedule !== 'function'
  ) {
    throw new TypeError('invalid AMLL evaluation probe dependencies');
  }
  const allowedOptions = new Set([
    'client',
    'fetch',
    'scheduler',
    'probeTimeoutMs',
    'now',
  ]);
  if (
    !hasOnlyKeys(options, allowedOptions) ||
    (Object.hasOwn(options, 'client') &&
      (Object.hasOwn(options, 'fetch') || Object.hasOwn(options, 'scheduler')))
  ) {
    throw new TypeError('invalid AMLL evaluation probe options');
  }
  const injectedClient = options.client;
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const scheduler = options.scheduler || dependencies.sharedScheduler;
  const probeTimeoutMs =
    options.probeTimeoutMs ?? DEFAULT_AMLL_PROBE_TIMEOUT_MS;
  const now = options.now || (() => performance.now());
  if (
    (injectedClient &&
      (typeof injectedClient.search !== 'function' ||
        typeof injectedClient.getById !== 'function')) ||
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    !Number.isSafeInteger(probeTimeoutMs) ||
    probeTimeoutMs < 1 ||
    probeTimeoutMs > MAX_AMLL_PROBE_TIMEOUT_MS ||
    typeof now !== 'function'
  ) {
    throw new TypeError('invalid AMLL evaluation probe options');
  }

  return async function probe(input) {
    if (!validProbeInput(input)) return probeFailure('invalid-request', 0);
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(
        Object.assign(new Error('AMLL evaluation probe timed out'), {
          name: 'TimeoutError',
        }),
      );
    }, probeTimeoutMs);
    timeout.unref?.();
    try {
      const client =
        injectedClient ||
        dependencies.createClient({
          fetch: fetchFn,
          scheduler,
          signal: controller.signal,
        });
      const search = await client.search({
        trackName: input.reference.title,
        artistName: input.reference.artist,
        albumName: input.reference.album,
        page: 1,
        pageSize: 10,
      });
      const durationMs = () => boundedProbeDuration(now() - startedAt);
      if (search.status === 'error') {
        return probeFailure(search.reason, durationMs());
      }
      if (
        search.status !== 'ok' ||
        !Array.isArray(search.records) ||
        !Number.isSafeInteger(search.invalidRecordCount)
      ) {
        return probeFailure('invalid-record', durationMs());
      }
      if (search.records.length === 0) {
        return toAmllEvaluationObservation(
          { ...search, durationMs: durationMs() },
          { providerId: 'amll' },
        );
      }
      const [selected] = rankAmllEvaluationCandidates(
        input.reference,
        search.records,
      );
      if (!selected) return probeFailure('invalid-record', durationMs());
      const fetched = await client.getById(selected.record.id);
      if (fetched.status !== 'ok') {
        return toAmllEvaluationObservation(
          { ...fetched, durationMs: durationMs() },
          { providerId: 'amll' },
        );
      }
      if (fetched.record?.id !== selected.record.id) {
        return probeFailure('invalid-record', durationMs());
      }
      return toAmllEvaluationObservation(
        { ...fetched, durationMs: durationMs() },
        {
          providerId: 'amll',
          matchBand: selected.matchBand,
          reviewVerdict: 'unreviewed',
        },
      );
    } catch {
      return probeFailure(
        'probe-error',
        boundedProbeDuration(now() - startedAt),
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
