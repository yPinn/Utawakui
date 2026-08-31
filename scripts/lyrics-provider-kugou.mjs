import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import OpenCCSimplified from 'opencc-js/t2cn';
import OpenCCTraditional from 'opencc-js/cn2t';
import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';

const require = createRequire(import.meta.url);
const { readBoundedText } = require('../electron/lib/lrclib/client.js');
const {
  durationDelta,
  textMatchScore,
  versionMismatchPenalty,
} = require('../electron/lib/lrclib/matching.js');
const {
  createLrclibRequestScheduler,
} = require('../electron/lib/lrclib/scheduler.js');

const MOBILE_ORIGIN = 'https://mobileservice.kugou.com';
const KRCS_ORIGIN = 'https://krcs.kugou.com';
const LYRICS_ORIGIN = 'https://lyrics.kugou.com';
const ALLOWED_ORIGINS = new Set([MOBILE_ORIGIN, KRCS_ORIGIN, LYRICS_ORIGIN]);
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_KRC_BYTES = 2 * 1024 * 1024;
const MAX_QUERY_CHARS = 256;
const MAX_RECORDS = 10;
const MAX_LYRIC_CANDIDATES = 64;
const MAX_LINES = 20_000;
const MAX_SEGMENTS = 100_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_OBSERVATION_DURATION_MS = 120_000;
const KRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/u;
const KRC_SEGMENT_RE = /<(\d+),(\d+),(\d+)>/gu;
const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce,
  0xd2, 0x6e, 0x69,
]);
const HASH_RE = /^[a-f0-9]{32}$/iu;
const CANDIDATE_ID_RE = /^[a-z0-9_-]{1,64}$/iu;
const ACCESS_KEY_RE = /^[a-z0-9+/=_-]{1,128}$/iu;
const BASE64_RE = /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu;
const VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const toSimplified = OpenCCSimplified.Converter({ from: 'tw', to: 'cn' });
const toTraditional = OpenCCTraditional.Converter({ from: 'cn', to: 'tw' });
const sharedKugouRequestScheduler = createLrclibRequestScheduler({
  intervalMs: 500,
});

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validText(value, required = true) {
  if (value === null && !required) return true;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_QUERY_CHARS &&
    !containsControlCharacter(value)
  );
}

function validReference(value) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 5 &&
    validText(value.title) &&
    validText(value.artist) &&
    validText(value.album, false) &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    value.durationSeconds <= 86_400 &&
    VERSIONS.has(value.version)
  );
}

function safeInteger(value, minimum = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function boundedDuration(value) {
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded)
    ? Math.min(MAX_OBSERVATION_DURATION_MS, Math.max(0, rounded))
    : 0;
}

export function decodeKugouKrc(value) {
  let input;
  try {
    input = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  } catch {
    return { status: 'error', reason: 'invalid-record' };
  }
  if (
    input.length <= 4 ||
    input.length > MAX_KRC_BYTES ||
    !new Set(['krc1', 'krc2']).has(input.toString('ascii', 0, 4))
  ) {
    return { status: 'error', reason: 'invalid-record' };
  }
  try {
    const encrypted = input.subarray(4);
    const compressed = Buffer.allocUnsafe(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) {
      compressed[index] = encrypted[index] ^ KRC_KEY[index % KRC_KEY.length];
    }
    const output = inflateSync(compressed, { maxOutputLength: MAX_KRC_BYTES });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(output);
    if (!text.trim()) return { status: 'error', reason: 'invalid-record' };
    return { status: 'ok', text };
  } catch {
    return { status: 'error', reason: 'invalid-record' };
  }
}

export function classifyKugouKrc(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_KRC_BYTES) {
    return { status: 'error', reason: 'invalid-record' };
  }
  const sourceLines = value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (sourceLines.length > MAX_LINES) {
    return { status: 'error', reason: 'response-too-large' };
  }
  let lineCount = 0;
  let segmentCount = 0;
  let previousLineStart = -1;
  for (const sourceLine of sourceLines) {
    if (/^\[[a-z][a-z0-9]*:/iu.test(sourceLine.trimStart())) continue;
    const header = KRC_LINE_RE.exec(sourceLine);
    if (!header) return { status: 'error', reason: 'invalid-record' };
    const lineStart = safeInteger(header[1]);
    const lineDuration = safeInteger(header[2], 1);
    const lineEnd =
      lineStart === null || lineDuration === null
        ? null
        : lineStart + lineDuration;
    if (
      lineStart === null ||
      lineDuration === null ||
      !Number.isSafeInteger(lineEnd) ||
      lineEnd > MAX_DURATION_MS ||
      lineStart < previousLineStart
    ) {
      return { status: 'error', reason: 'invalid-record' };
    }
    const body = header[3];
    const matches = [...body.matchAll(KRC_SEGMENT_RE)];
    if (matches.length === 0 || body.slice(0, matches[0].index).trim()) {
      return { status: 'error', reason: 'invalid-record' };
    }
    let previousOffsetEnd = 0;
    let text = '';
    for (const [index, match] of matches.entries()) {
      segmentCount += 1;
      if (segmentCount > MAX_SEGMENTS) {
        return { status: 'error', reason: 'response-too-large' };
      }
      const offset = safeInteger(match[1]);
      const duration = safeInteger(match[2], 1);
      const marker = safeInteger(match[3]);
      const offsetEnd =
        offset === null || duration === null ? null : offset + duration;
      const textStart = match.index + match[0].length;
      const textEnd = matches[index + 1]?.index ?? body.length;
      const segmentText = body.slice(textStart, textEnd);
      if (
        offset === null ||
        duration === null ||
        marker === null ||
        !Number.isSafeInteger(offsetEnd) ||
        offset < previousOffsetEnd ||
        offsetEnd > lineDuration ||
        segmentText.length === 0
      ) {
        return { status: 'error', reason: 'invalid-record' };
      }
      previousOffsetEnd = offsetEnd;
      text += segmentText;
    }
    if (!text.trim()) return { status: 'error', reason: 'invalid-record' };
    lineCount += 1;
    previousLineStart = lineStart;
  }
  if (lineCount === 0 || segmentCount === 0) {
    return { status: 'error', reason: 'invalid-record' };
  }
  return {
    status: 'ok',
    capability: 'T2',
    timingValidation: 'valid',
    lineCount,
    timedLineCount: lineCount,
    segmentCount,
    invalidLineCount: 0,
    invalidSegmentCount: 0,
  };
}

function responseFailure(response) {
  if (response.status === 429) return 'rate-limited';
  if ([500, 502, 503, 504].includes(response.status)) {
    return 'service-unavailable';
  }
  return 'http-error';
}

function createRequest(fetchFn, timeoutMs, scheduler) {
  return async function request(url) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    if (!ALLOWED_ORIGINS.has(url.origin) || url.protocol !== 'https:') {
      return { status: 'error', reason: 'invalid-request' };
    }
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await scheduler.schedule(
        () =>
          fetchFn(url, {
            method: 'GET',
            redirect: 'error',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'UtawakuiLyricsEvaluation/0.1',
            },
            signal,
          }),
        { signal },
      );
    } catch (error) {
      return {
        status: 'error',
        reason:
          error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'timeout'
            : 'offline',
      };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 'error', reason: responseFailure(response) };
    }
    const bounded = await readBoundedText(response, MAX_RESPONSE_BYTES, signal);
    if (bounded.status === 'error') return bounded;
    try {
      return { status: 'ok', value: JSON.parse(bounded.text) };
    } catch {
      return { status: 'error', reason: 'invalid-json' };
    }
  };
}

function normalizeSong(value) {
  if (!isPlainObject(value)) return null;
  const hash = value.hash;
  const title = value.songname_original ?? value.songname;
  const artist = value.singername;
  const rawDuration = Number(value.duration);
  const durationSeconds =
    rawDuration > 86_400 ? rawDuration / 1000 : rawDuration;
  if (
    typeof hash !== 'string' ||
    !HASH_RE.test(hash) ||
    !validText(title) ||
    !validText(artist) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 86_400
  ) {
    return null;
  }
  return {
    hash: hash.toLowerCase(),
    title: title.trim(),
    artist: artist.trim(),
    durationSeconds,
  };
}

function rankSongs(reference, songs) {
  return songs
    .map((song) => {
      const titleScore = Math.max(
        textMatchScore(reference.title, song.title),
        textMatchScore(toSimplified(reference.title), toSimplified(song.title)),
        textMatchScore(
          toTraditional(reference.title),
          toTraditional(song.title),
        ),
      );
      const artistScore = Math.max(
        textMatchScore(reference.artist, song.artist),
        textMatchScore(
          toSimplified(reference.artist),
          toSimplified(song.artist),
        ),
        textMatchScore(
          toTraditional(reference.artist),
          toTraditional(song.artist),
        ),
      );
      const delta = durationDelta(
        reference.durationSeconds,
        song.durationSeconds,
      );
      const versionPenalty = versionMismatchPenalty(reference.title, {
        trackName: song.title,
        albumName: '',
      });
      if (
        titleScore < 0.75 ||
        artistScore < 0.35 ||
        (delta !== null && delta > 90) ||
        versionPenalty > 0
      ) {
        return null;
      }
      const matchBand =
        titleScore === 1 && artistScore === 1 && delta !== null && delta <= 4
          ? 'exact'
          : titleScore >= 0.82 &&
              artistScore >= 0.8 &&
              delta !== null &&
              delta <= 15
            ? 'strong'
            : 'related';
      return {
        song,
        matchBand,
        score:
          titleScore * 0.55 +
          artistScore * 0.2 +
          (delta === null
            ? 0.05
            : delta <= 4
              ? 0.25
              : delta <= 15
                ? 0.15
                : 0.02),
        delta,
      };
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        second.score - first.score ||
        (first.delta ?? Number.MAX_SAFE_INTEGER) -
          (second.delta ?? Number.MAX_SAFE_INTEGER) ||
        first.song.hash.localeCompare(second.song.hash),
    );
}

function normalizeLyricCandidate(value) {
  if (!isPlainObject(value)) return null;
  const id = String(value.id ?? '');
  const accesskey = value.accesskey;
  const duration = Number(value.duration);
  if (
    !CANDIDATE_ID_RE.test(id) ||
    typeof accesskey !== 'string' ||
    !ACCESS_KEY_RE.test(accesskey) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_DURATION_MS
  ) {
    return null;
  }
  return {
    id,
    accesskey,
    duration,
    lrcid: Number.isSafeInteger(Number(value.lrcid)) ? Number(value.lrcid) : 0,
    official:
      value.productFrom === '官方推荐歌词' ||
      value.product_from === '官方推荐歌词',
  };
}

function selectLyricCandidate(candidates, durationSeconds) {
  return [...candidates].sort((first, second) => {
    const firstDelta = Math.abs(first.duration / 1000 - durationSeconds);
    const secondDelta = Math.abs(second.duration / 1000 - durationSeconds);
    return (
      firstDelta - secondDelta ||
      Number(second.official) - Number(first.official)
    );
  })[0];
}

function failureObservation(reason, durationMs) {
  return normalizeProbeOutcome({
    providerId: 'kugou',
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
    providerId: 'kugou',
    request: { status: 'ok', durationMs, failureCode: null },
    catalogStatus: 'miss',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  });
}

function matchObservation(durationMs, matchBand) {
  return normalizeProbeOutcome({
    providerId: 'kugou',
    request: { status: 'ok', durationMs, failureCode: null },
    catalogStatus: 'match',
    matchBand,
    reviewVerdict: 'unreviewed',
    capability: 'T2',
    timingValidation: 'valid',
  });
}

function candidatesFrom(value) {
  if (!isPlainObject(value) || !Array.isArray(value.candidates)) return null;
  if (value.candidates.length > MAX_LYRIC_CANDIDATES) return null;
  return value.candidates.map(normalizeLyricCandidate).filter(Boolean);
}

export function createKugouEvaluationProbe(options = {}) {
  if (
    !isPlainObject(options) ||
    Object.keys(options).some(
      (key) => !new Set(['fetch', 'timeoutMs', 'scheduler', 'now']).has(key),
    )
  ) {
    throw new TypeError('invalid Kugou evaluation probe options');
  }
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scheduler = options.scheduler ?? sharedKugouRequestScheduler;
  const now = options.now ?? (() => performance.now());
  if (
    (fetchFn !== undefined && typeof fetchFn !== 'function') ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_OBSERVATION_DURATION_MS ||
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    typeof now !== 'function'
  ) {
    throw new TypeError('invalid Kugou evaluation probe options');
  }
  const request = createRequest(fetchFn, timeoutMs, scheduler);

  return async function probe(input) {
    const validInput =
      isPlainObject(input) &&
      input.providerId === 'kugou' &&
      validReference(input.reference);
    if (!validInput) return failureObservation('invalid-request', 0);
    const startedAt = now();
    const elapsed = () => boundedDuration(now() - startedAt);
    try {
      const keywords =
        `${input.reference.artist} ${input.reference.title}`.trim();
      const mobileUrl = new URL('/api/v3/search/song', MOBILE_ORIGIN);
      mobileUrl.searchParams.set('keyword', keywords);
      mobileUrl.searchParams.set('page', '1');
      mobileUrl.searchParams.set('pagesize', String(MAX_RECORDS));
      const mobile = await request(mobileUrl);
      if (mobile.status !== 'ok')
        return failureObservation(mobile.reason, elapsed());
      const rawSongs = mobile.value?.data?.info;
      if (!Array.isArray(rawSongs) || rawSongs.length > MAX_RECORDS) {
        return failureObservation('invalid-record', elapsed());
      }
      const songs = rawSongs.map(normalizeSong).filter(Boolean);
      const selectedSong = rankSongs(input.reference, songs).find(
        (match) => match.matchBand !== 'related',
      );
      let candidates = [];
      let matchBand = 'related';
      if (selectedSong) {
        const krcsUrl = new URL('/search', KRCS_ORIGIN);
        krcsUrl.searchParams.set('ver', '1');
        krcsUrl.searchParams.set('man', 'yes');
        krcsUrl.searchParams.set('client', 'pc');
        krcsUrl.searchParams.set('hash', selectedSong.song.hash);
        krcsUrl.searchParams.set('album_audio_id', '0');
        const krcs = await request(krcsUrl);
        if (krcs.status !== 'ok')
          return failureObservation(krcs.reason, elapsed());
        candidates = candidatesFrom(krcs.value);
        if (candidates === null)
          return failureObservation('invalid-record', elapsed());
        matchBand = selectedSong.matchBand;
      }
      if (candidates.length === 0) {
        const searchUrl = new URL('/search', LYRICS_ORIGIN);
        searchUrl.searchParams.set('ver', '1');
        searchUrl.searchParams.set('man', 'yes');
        searchUrl.searchParams.set('client', 'pc');
        searchUrl.searchParams.set('keyword', keywords);
        searchUrl.searchParams.set(
          'duration',
          String(Math.round(input.reference.durationSeconds * 1000)),
        );
        const search = await request(searchUrl);
        if (search.status !== 'ok')
          return failureObservation(search.reason, elapsed());
        candidates = candidatesFrom(search.value);
        if (candidates === null)
          return failureObservation('invalid-record', elapsed());
      }
      if (candidates.length === 0) return missObservation(elapsed());
      const selected = selectLyricCandidate(
        candidates,
        input.reference.durationSeconds,
      );
      const downloadUrl = new URL('/download', LYRICS_ORIGIN);
      downloadUrl.searchParams.set('ver', '1');
      downloadUrl.searchParams.set('client', 'pc');
      downloadUrl.searchParams.set('id', selected.id);
      downloadUrl.searchParams.set('accesskey', selected.accesskey);
      downloadUrl.searchParams.set('fmt', 'krc');
      downloadUrl.searchParams.set('lrcid', String(selected.lrcid));
      const download = await request(downloadUrl);
      if (download.status !== 'ok')
        return failureObservation(download.reason, elapsed());
      const content = download.value?.content;
      if (
        typeof content !== 'string' ||
        content.length === 0 ||
        content.length > MAX_RESPONSE_BYTES ||
        !BASE64_RE.test(content)
      ) {
        return failureObservation('invalid-record', elapsed());
      }
      const decoded = decodeKugouKrc(Buffer.from(content, 'base64'));
      if (decoded.status !== 'ok')
        return failureObservation(decoded.reason, elapsed());
      const timing = classifyKugouKrc(decoded.text);
      if (timing.status !== 'ok')
        return failureObservation(timing.reason, elapsed());
      return matchObservation(elapsed(), matchBand);
    } catch {
      return failureObservation('probe-error', elapsed());
    }
  };
}

export const KUGOU_EVALUATION_PROFILE = Object.freeze({
  profileId: 'kugou-direct-krc-evaluation-v1',
  mode: 'isolated-research',
  accessMode: 'none',
  tokenRefresh: 'not-required',
  boundedPayload: true,
});
