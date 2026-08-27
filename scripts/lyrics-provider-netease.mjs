import { createRequire } from 'node:module';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';

const require = createRequire(import.meta.url);
const { textMatchScore } = require('../electron/lib/lrclib/matching.js');

const NETEASE_PACKAGE_ID = '@neteasecloudmusicapienhanced/api';
const MAX_TEXT_LENGTH = 256;
const MAX_TEXT_VALUES = 16;
const MAX_DURATION_SECONDS = 86_400;
const MAX_DURATION_MS = MAX_DURATION_SECONDS * 1000;
const MAX_LYRIC_BYTES = 2 * 1024 * 1024;
const MAX_YRC_LINES = 20_000;
const MAX_YRC_SEGMENTS = 100_000;
const MAX_EVALUATION_DURATION_MS = 120_000;
const DEFAULT_NETEASE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_NETEASE_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_NETEASE_MINIMUM_INTERVAL_MS = 500;
const REFERENCE_VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const BAND_ORDER = Object.freeze({ exact: 0, strong: 1, related: 2 });
const VERSION_MARKERS = Object.freeze({
  live: ['live', 'live版', '现场', '現場', '演唱会', '演唱會', 'ライブ'],
  remaster: ['remaster', 'remastered', '重制', '重製'],
  cover: ['cover', '翻唱', 'カバー'],
  remix: ['remix', 'mix版', 'リミックス'],
  acoustic: ['acoustic', 'unplugged', '不插电', '不插電', 'アコースティック'],
});
const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/u;
const YRC_SEGMENT_RE = /\((\d+),(\d+),(\d+)\)/gu;
const LRC_TIME_RE = /^\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/u;

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

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
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

function normalizeTextArray(value) {
  if (!Array.isArray(value) || value.length > MAX_TEXT_VALUES) return null;
  const result = [];
  for (const item of value) {
    if (!validText(item, { required: true })) return null;
    result.push(item.trim());
  }
  return result;
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

function normalizeArtists(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  if (value.every((item) => typeof item === 'string')) {
    return normalizeTextArray(value);
  }
  const artists = [];
  for (const item of value) {
    if (!isPlainObject(item) || !validText(item.name, { required: true })) {
      return null;
    }
    artists.push(item.name.trim());
  }
  return artists;
}

function normalizeNeteaseSong(value) {
  if (!isPlainObject(value)) return null;
  const id = value.id;
  const title = value.title ?? value.name;
  const artists = normalizeArtists(value.artists ?? value.ar);
  const albumValue = value.album ?? value.al;
  const album =
    typeof albumValue === 'string'
      ? albumValue
      : isPlainObject(albumValue)
        ? albumValue.name
        : null;
  const durationValue = value.durationSeconds ?? value.dt ?? value.duration;
  const durationSeconds =
    value.durationSeconds === durationValue
      ? durationValue
      : durationValue / 1000;
  const aliases = normalizeTextArray(value.aliases ?? value.alia ?? []);
  const translatedTitles = normalizeTextArray(
    value.translatedTitles ?? value.tns ?? [],
  );
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !validText(title, { required: true }) ||
    !artists ||
    !validText(album) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_DURATION_SECONDS ||
    !aliases ||
    !translatedTitles
  ) {
    return null;
  }
  return {
    id,
    title: title.trim(),
    artists,
    album: album?.trim() || null,
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    aliases,
    translatedTitles,
  };
}

function maximumTextScore(expected, values) {
  return Math.max(0, ...values.map((value) => textMatchScore(expected, value)));
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
  const metadata = [
    record.title,
    record.album || '',
    ...record.aliases,
    ...record.translatedTitles,
  ]
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

function evaluateCandidate(reference, record) {
  const titleScore = maximumTextScore(reference.title, [
    record.title,
    ...record.aliases,
    ...record.translatedTitles,
  ]);
  const artistScore = maximumTextScore(reference.artist, record.artists);
  const albumScore = reference.album
    ? maximumTextScore(reference.album, record.album ? [record.album] : [])
    : 1;
  const durationDeltaSeconds = Math.abs(
    Math.round(reference.durationSeconds) - Math.round(record.durationSeconds),
  );
  const versionMismatch = hasVersionMismatch(reference, record);
  const matchBand =
    titleScore === 1 &&
    artistScore === 1 &&
    albumScore === 1 &&
    durationDeltaSeconds <= 4 &&
    !versionMismatch
      ? 'exact'
      : titleScore >= 0.82 &&
          artistScore >= 0.8 &&
          durationDeltaSeconds <= 15 &&
          !versionMismatch
        ? 'strong'
        : 'related';
  return {
    record,
    matchBand,
    titleScore,
    artistScore,
    albumScore,
    durationDeltaSeconds,
    versionMismatch,
  };
}

export function rankNeteaseEvaluationCandidates(reference, records) {
  if (!validEvaluationReference(reference) || !Array.isArray(records)) {
    throw new TypeError('invalid NetEase evaluation reference or records');
  }
  const byId = new Map();
  for (const value of records) {
    const record = normalizeNeteaseSong(value);
    if (record && !byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()]
    .map((record) => evaluateCandidate(reference, record))
    .sort(
      (first, second) =>
        BAND_ORDER[first.matchBand] - BAND_ORDER[second.matchBand] ||
        second.titleScore - first.titleScore ||
        second.artistScore - first.artistScore ||
        first.durationDeltaSeconds - second.durationDeltaSeconds ||
        second.albumScore - first.albumScore ||
        first.record.id - second.record.id,
    );
}

function safeInteger(value, minimum = 0, maximum = MAX_DURATION_MS) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function emptyTiming(capability, timingValidation) {
  return {
    status: 'ok',
    capability,
    timingValidation,
    lineCount: 0,
    timedLineCount: 0,
    segmentCount: 0,
    invalidLineCount: 0,
    invalidSegmentCount: 0,
  };
}

function payloadTooLarge(value) {
  return Buffer.byteLength(value, 'utf8') > MAX_LYRIC_BYTES;
}

function classifyYrc(value) {
  if (payloadTooLarge(value)) {
    return { status: 'error', reason: 'response-too-large' };
  }
  const lines = value.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length > MAX_YRC_LINES) {
    return { status: 'error', reason: 'response-too-large' };
  }
  let lineCount = 0;
  let timedLineCount = 0;
  let segmentCount = 0;
  let invalidLineCount = 0;
  let invalidSegmentCount = 0;
  for (const line of lines) {
    if (line.trimStart().startsWith('{')) {
      try {
        JSON.parse(line);
      } catch {
        return { status: 'error', reason: 'invalid-record' };
      }
      continue;
    }
    lineCount += 1;
    const header = YRC_LINE_RE.exec(line);
    if (!header) {
      invalidLineCount += 1;
      continue;
    }
    const lineStart = safeInteger(header[1]);
    const lineDuration = safeInteger(header[2], 1);
    if (lineStart === null || lineDuration === null) {
      invalidLineCount += 1;
      continue;
    }
    const lineEnd = lineStart + lineDuration;
    if (!Number.isSafeInteger(lineEnd) || lineEnd > MAX_DURATION_MS) {
      invalidLineCount += 1;
      continue;
    }
    const body = header[3];
    const matches = [...body.matchAll(YRC_SEGMENT_RE)];
    if (matches.length === 0 || body.slice(0, matches[0]?.index || 0).trim()) {
      invalidLineCount += 1;
      continue;
    }
    let previousEnd = lineStart;
    let lineInvalid = false;
    for (const [index, match] of matches.entries()) {
      segmentCount += 1;
      if (segmentCount > MAX_YRC_SEGMENTS) {
        return { status: 'error', reason: 'response-too-large' };
      }
      const start = safeInteger(match[1]);
      const duration = safeInteger(match[2], 1);
      const end = start === null || duration === null ? null : start + duration;
      const textStart = (match.index || 0) + match[0].length;
      const textEnd = matches[index + 1]?.index ?? body.length;
      const hasText = body.slice(textStart, textEnd).length > 0;
      const valid =
        start !== null &&
        duration !== null &&
        Number.isSafeInteger(end) &&
        start >= lineStart &&
        start >= previousEnd &&
        end <= lineEnd &&
        hasText;
      if (!valid) {
        invalidSegmentCount += 1;
        lineInvalid = true;
      }
      if (end !== null) previousEnd = Math.max(previousEnd, end);
    }
    if (lineInvalid) invalidLineCount += 1;
    else timedLineCount += 1;
  }
  if (lineCount === 0 || (timedLineCount === 0 && invalidLineCount > 0)) {
    if (lineCount === invalidLineCount && segmentCount === 0) {
      return { status: 'error', reason: 'invalid-record' };
    }
  }
  return {
    status: 'ok',
    capability: 'T2',
    timingValidation:
      invalidLineCount === 0 && invalidSegmentCount === 0 ? 'valid' : 'invalid',
    lineCount,
    timedLineCount,
    segmentCount,
    invalidLineCount,
    invalidSegmentCount,
  };
}

export function classifyNeteaseLyrics(value) {
  if (
    !hasExactKeys(value, ['yrc', 'lrc']) ||
    !(value.yrc === null || typeof value.yrc === 'string') ||
    !(value.lrc === null || typeof value.lrc === 'string')
  ) {
    return { status: 'error', reason: 'invalid-record' };
  }
  const yrc = value.yrc || '';
  const lrc = value.lrc || '';
  if (yrc) return classifyYrc(yrc);
  if (payloadTooLarge(lrc)) {
    return { status: 'error', reason: 'response-too-large' };
  }
  if (!lrc) return emptyTiming('T0', 'not-applicable');
  const timedLineCount = lrc
    .split(/\r?\n/u)
    .filter((line) => LRC_TIME_RE.test(line.trim())).length;
  if (timedLineCount === 0) {
    return {
      ...emptyTiming('T0', 'not-applicable'),
      lineCount: lrc.split(/\r?\n/u).filter((line) => line.trim()).length,
    };
  }
  return {
    ...emptyTiming('T1', 'not-applicable'),
    lineCount: timedLineCount,
    timedLineCount,
  };
}

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return Object.assign(new Error('operation aborted'), { name: 'AbortError' });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function defaultSleep(milliseconds, signal) {
  return signal
    ? sleepFor(milliseconds, undefined, { signal })
    : sleepFor(milliseconds);
}

export function createNeteaseEvaluationScheduler(options = {}) {
  const minimumIntervalMs =
    Number.isSafeInteger(options.minimumIntervalMs) &&
    options.minimumIntervalMs >= 1 &&
    options.minimumIntervalMs <= 10_000
      ? options.minimumIntervalMs
      : DEFAULT_NETEASE_MINIMUM_INTERVAL_MS;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep =
    typeof options.sleep === 'function' ? options.sleep : defaultSleep;
  let earliestStartMs = 0;
  let tail = Promise.resolve();
  function schedule(task, scheduleOptions = {}) {
    if (typeof task !== 'function') {
      return Promise.reject(new TypeError('NetEase scheduled task is invalid'));
    }
    const signal = scheduleOptions.signal;
    const run = tail.then(async () => {
      throwIfAborted(signal);
      const waitMs = Math.max(0, earliestStartMs - now());
      if (waitMs > 0) await sleep(waitMs, signal);
      throwIfAborted(signal);
      earliestStartMs = now() + minimumIntervalMs;
      return task();
    });
    tail = run.catch(() => undefined);
    return run;
  }
  return { schedule };
}

const sharedNeteaseEvaluationScheduler = createNeteaseEvaluationScheduler();

async function defaultLoadApi() {
  const imported = await import(NETEASE_PACKAGE_ID);
  return imported.default || imported;
}

function elapsed(now, startedAt) {
  const measured = Math.round(now() - startedAt);
  return Number.isSafeInteger(measured)
    ? Math.min(MAX_EVALUATION_DURATION_MS, Math.max(0, measured))
    : 0;
}

function mapProviderCode(code) {
  if (code === 200) return null;
  if (code === 429) return 'rate-limited';
  if (new Set([500, 502, 503]).has(code)) return 'service-unavailable';
  if (Number.isInteger(code)) return 'http-error';
  return 'invalid-record';
}

function responseBody(value) {
  return isPlainObject(value) && isPlainObject(value.body) ? value.body : null;
}

function normalizeSearchRequest(value) {
  if (
    !hasOnlyKeys(value, new Set(['trackName', 'artistName'])) ||
    !validText(value.trackName, { required: true }) ||
    !validText(value.artistName)
  ) {
    return null;
  }
  return {
    trackName: value.trackName.trim(),
    artistName: value.artistName?.trim() || null,
  };
}

function extractLyric(value) {
  if (value === undefined || value === null) return '';
  if (!isPlainObject(value) || typeof value.lyric !== 'string') return null;
  return value.lyric;
}

export function createNeteaseEvaluationClient(options = {}) {
  if (
    !hasOnlyKeys(
      options,
      new Set(['api', 'loadApi', 'now', 'scheduler', 'requestTimeoutMs']),
    ) ||
    (Object.hasOwn(options, 'api') && Object.hasOwn(options, 'loadApi'))
  ) {
    throw new TypeError('invalid NetEase evaluation client options');
  }
  const injectedApi = options.api;
  const loadApi = options.loadApi || defaultLoadApi;
  const now = options.now || (() => performance.now());
  const scheduler = options.scheduler || sharedNeteaseEvaluationScheduler;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_NETEASE_REQUEST_TIMEOUT_MS;
  if (
    (injectedApi &&
      (typeof injectedApi.cloudsearch !== 'function' ||
        typeof injectedApi.lyric_new !== 'function')) ||
    typeof loadApi !== 'function' ||
    typeof now !== 'function' ||
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > MAX_NETEASE_REQUEST_TIMEOUT_MS ||
    !scheduler ||
    typeof scheduler.schedule !== 'function'
  ) {
    throw new TypeError('invalid NetEase evaluation client options');
  }
  let loadedApi = injectedApi || null;

  async function call(method, parameters) {
    const startedAt = now();
    try {
      if (!loadedApi) {
        try {
          loadedApi = await loadApi();
        } catch {
          return {
            status: 'error',
            reason: 'fetch-unavailable',
            durationMs: elapsed(now, startedAt),
          };
        }
      }
      if (
        !loadedApi ||
        typeof loadedApi.cloudsearch !== 'function' ||
        typeof loadedApi.lyric_new !== 'function'
      ) {
        return {
          status: 'error',
          reason: 'invalid-record',
          durationMs: elapsed(now, startedAt),
        };
      }
      const value = await scheduler.schedule(() =>
        loadedApi[method](parameters),
      );
      return { status: 'ok', value, durationMs: elapsed(now, startedAt) };
    } catch (error) {
      const rejectedCode = Number(error?.body?.code ?? error?.status);
      const rejectedFailure = mapProviderCode(rejectedCode);
      return {
        status: 'error',
        reason:
          error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'timeout'
            : rejectedFailure && rejectedFailure !== 'invalid-record'
              ? rejectedFailure
              : 'provider-failure',
        durationMs: elapsed(now, startedAt),
      };
    }
  }

  async function search(value) {
    const query = normalizeSearchRequest(value);
    if (!query) {
      return { status: 'error', reason: 'invalid-request', durationMs: 0 };
    }
    const result = await call('cloudsearch', {
      keywords: [query.trackName, query.artistName].filter(Boolean).join(' '),
      type: 1,
      limit: 10,
      offset: 0,
      timeout: requestTimeoutMs,
    });
    if (result.status === 'error') return result;
    const body = responseBody(result.value);
    const failure = mapProviderCode(body?.code);
    if (failure) {
      return {
        status: 'error',
        reason: failure,
        durationMs: result.durationMs,
      };
    }
    const songs = body.result?.songs;
    if (!Array.isArray(songs) || songs.length > 10) {
      return {
        status: 'error',
        reason: 'invalid-record',
        durationMs: result.durationMs,
      };
    }
    const records = [];
    let invalidRecordCount = 0;
    for (const song of songs) {
      const record = normalizeNeteaseSong(song);
      if (record) records.push(record);
      else invalidRecordCount += 1;
    }
    return {
      status: 'ok',
      records,
      invalidRecordCount,
      durationMs: result.durationMs,
    };
  }

  async function getLyrics(recordId) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0) {
      return { status: 'error', reason: 'invalid-request', durationMs: 0 };
    }
    const result = await call('lyric_new', {
      id: recordId,
      timeout: requestTimeoutMs,
    });
    if (result.status === 'error') return result;
    const body = responseBody(result.value);
    const failure = mapProviderCode(body?.code);
    if (failure) {
      return {
        status: 'error',
        reason: failure,
        durationMs: result.durationMs,
      };
    }
    const yrc = extractLyric(body.yrc);
    const lrc = extractLyric(body.lrc);
    if (yrc === null || lrc === null) {
      return {
        status: 'error',
        reason: 'invalid-record',
        durationMs: result.durationMs,
      };
    }
    const timing = classifyNeteaseLyrics({ yrc, lrc });
    if (timing.status === 'error') {
      return { ...timing, durationMs: result.durationMs };
    }
    const timingSummary = {
      capability: timing.capability,
      timingValidation: timing.timingValidation,
      lineCount: timing.lineCount,
      timedLineCount: timing.timedLineCount,
      segmentCount: timing.segmentCount,
      invalidLineCount: timing.invalidLineCount,
      invalidSegmentCount: timing.invalidSegmentCount,
    };
    return {
      status: 'ok',
      timing: timingSummary,
      durationMs: result.durationMs,
    };
  }

  return { search, getLyrics };
}

function validProbeInput(input) {
  const validShape =
    hasExactKeys(input, ['providerId', 'reference']) ||
    hasExactKeys(input, ['caseId', 'providerId', 'tags', 'reference']);
  return (
    validShape &&
    input.providerId === 'netease' &&
    validEvaluationReference(input.reference) &&
    (input.caseId === undefined || /^case-\d{3}$/u.test(input.caseId)) &&
    (input.tags === undefined ||
      (Array.isArray(input.tags) &&
        input.tags.every((tag) => typeof tag === 'string')))
  );
}

function failureObservation(reason, durationMs) {
  return normalizeProbeOutcome({
    providerId: 'netease',
    request: { status: 'failed', durationMs, failureCode: reason },
    catalogStatus: 'not-evaluated',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  });
}

function missObservation(durationMs) {
  return normalizeProbeOutcome({
    providerId: 'netease',
    request: { status: 'ok', durationMs, failureCode: null },
    catalogStatus: 'miss',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  });
}

function matchObservation(durationMs, matchBand, timing) {
  return normalizeProbeOutcome({
    providerId: 'netease',
    request: { status: 'ok', durationMs, failureCode: null },
    catalogStatus: 'match',
    matchBand,
    reviewVerdict: 'unreviewed',
    capability: timing.capability,
    timingValidation: timing.timingValidation,
  });
}

function boundedDuration(now, startedAt) {
  return elapsed(now, startedAt);
}

export function createNeteaseEvaluationProbe(options = {}) {
  if (
    !hasOnlyKeys(
      options,
      new Set([
        'client',
        'api',
        'loadApi',
        'scheduler',
        'requestTimeoutMs',
        'now',
      ]),
    ) ||
    (Object.hasOwn(options, 'client') &&
      ['api', 'loadApi', 'scheduler', 'requestTimeoutMs'].some((key) =>
        Object.hasOwn(options, key),
      ))
  ) {
    throw new TypeError('invalid NetEase evaluation probe options');
  }
  const now = options.now || (() => performance.now());
  const client =
    options.client ||
    createNeteaseEvaluationClient({
      ...(Object.hasOwn(options, 'api') ? { api: options.api } : {}),
      ...(Object.hasOwn(options, 'loadApi')
        ? { loadApi: options.loadApi }
        : {}),
      ...(Object.hasOwn(options, 'scheduler')
        ? { scheduler: options.scheduler }
        : {}),
      ...(Object.hasOwn(options, 'requestTimeoutMs')
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {}),
      now,
    });
  if (
    typeof now !== 'function' ||
    !client ||
    typeof client.search !== 'function' ||
    typeof client.getLyrics !== 'function'
  ) {
    throw new TypeError('invalid NetEase evaluation probe options');
  }

  return async function probe(input) {
    if (!validProbeInput(input))
      return failureObservation('invalid-request', 0);
    const startedAt = now();
    const durationMs = () => boundedDuration(now, startedAt);
    try {
      const search = await client.search({
        trackName: input.reference.title,
        artistName: input.reference.artist,
      });
      if (search.status === 'error') {
        return failureObservation(search.reason, durationMs());
      }
      if (
        search.status !== 'ok' ||
        !Array.isArray(search.records) ||
        !Number.isSafeInteger(search.invalidRecordCount)
      ) {
        return failureObservation('invalid-record', durationMs());
      }
      if (search.records.length === 0) {
        return search.invalidRecordCount > 0
          ? failureObservation('invalid-record', durationMs())
          : missObservation(durationMs());
      }
      const selected = rankNeteaseEvaluationCandidates(
        input.reference,
        search.records,
      ).find(({ matchBand }) => matchBand !== 'related');
      if (!selected) return missObservation(durationMs());
      const lyrics = await client.getLyrics(selected.record.id);
      if (lyrics.status === 'error') {
        return failureObservation(lyrics.reason, durationMs());
      }
      if (lyrics.status !== 'ok' || !isPlainObject(lyrics.timing)) {
        return failureObservation('invalid-record', durationMs());
      }
      return matchObservation(durationMs(), selected.matchBand, lyrics.timing);
    } catch {
      return failureObservation('probe-error', durationMs());
    }
  };
}
