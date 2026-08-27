import schedulerModule from '../electron/lib/lrclib/scheduler.js';
import { LYRICS_CORPUS_STRATA_BY_ID } from './lyrics-provider-corpus-strata.mjs';

const { createLrclibRequestScheduler } = schedulerModule;

const MUSICBRAINZ_ORIGIN = 'https://musicbrainz.org';
const LISTENBRAINZ_POPULARITY_URL =
  'https://api.listenbrainz.org/1/popularity/recording';
const USER_AGENT =
  'UtawakuiLyricsEvaluation/0.1 (https://github.com/llazyPilot/Utawakui)';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MUSICBRAINZ_INTERVAL_MS = 1_100;
const LISTENBRAINZ_INTERVAL_MS = 250;
const MUSICBRAINZ_PAGE_SIZE = 100;
const MUSICBRAINZ_MAX_ATTEMPTS = 3;
const MUSICBRAINZ_MAX_RETRY_AFTER_MS = 60_000;
const DEFAULT_LISTENBRAINZ_BATCH_SIZE = 250;
const MAX_LISTENBRAINZ_INPUTS = 10_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WIKIDATA_ITEM_RE = /^Q[1-9]\d*$/u;
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u;

const sharedMusicBrainzScheduler = createLrclibRequestScheduler({
  intervalMs: MUSICBRAINZ_INTERVAL_MS,
});
const sharedListenBrainzScheduler = createLrclibRequestScheduler({
  intervalMs: LISTENBRAINZ_INTERVAL_MS,
});

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function requiredText(value, label, maximum = 500) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximum
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function validUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // Best-effort resource cleanup; the public failure remains categorical.
  }
}

async function readBoundedText(response, source) {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > MAX_RESPONSE_BYTES)
  ) {
    await cancelResponseBody(response);
    throw new TypeError(`${source} response is too large`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        throw sourceFailure(`${source} response stream failed`, {
          cause: error,
          retryable: true,
        });
      }
      const { done, value } = result;
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new TypeError(`${source} response is too large`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function sourceFailure(message, options = {}) {
  const error = new TypeError(message, { cause: options.cause });
  Object.defineProperty(error, 'retryable', {
    value: options.retryable === true,
  });
  return error;
}

function httpFailure(source, status) {
  if (status === 401) return sourceFailure(`${source} auth required`);
  if (status === 429) {
    return sourceFailure(`${source} rate limited`, { retryable: true });
  }
  if ([500, 502, 503, 504].includes(status)) {
    return sourceFailure(`${source} service unavailable`, { retryable: true });
  }
  return sourceFailure(`${source} request failed`);
}

function parseRetryAfterMs(value) {
  if (typeof value !== 'string' || value.trim().length < 1) return null;
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) {
    return Math.min(
      Math.ceil(Number(normalized) * 1_000),
      MUSICBRAINZ_MAX_RETRY_AFTER_MS,
    );
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(
    Math.max(0, timestamp - Date.now()),
    MUSICBRAINZ_MAX_RETRY_AFTER_MS,
  );
}

async function fetchBoundedJson(url, requestOptions, options) {
  const { fetchFn, scheduler, source, onResponse } = options;
  const request = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      try {
        response = await fetchFn(url, {
          ...requestOptions,
          signal: controller.signal,
        });
      } catch (error) {
        throw sourceFailure(
          controller.signal.aborted
            ? `${source} request timed out`
            : `${source} request failed`,
          { cause: error, retryable: !controller.signal.aborted },
        );
      }
      if (onResponse) {
        try {
          onResponse(response);
        } catch (error) {
          await cancelResponseBody(response);
          throw error;
        }
      }
      if (!response?.ok) {
        await cancelResponseBody(response);
        throw httpFailure(source, response?.status);
      }
      let text;
      try {
        text = await readBoundedText(response, source);
      } catch (error) {
        if (controller.signal.aborted) {
          throw sourceFailure(`${source} request timed out`, {
            cause: error,
          });
        }
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new TypeError(`${source} returned invalid JSON`);
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    return scheduler ? await scheduler.schedule(request) : await request();
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError(`${source} request failed`, { cause: error });
  }
}

function applyListenBrainzRateLimit(response, scheduler) {
  const remainingHeader = response?.headers?.get('x-ratelimit-remaining');
  const resetHeader = response?.headers?.get('x-ratelimit-reset-in');
  if (remainingHeader === null && resetHeader === null) return;
  if (
    !/^\d+$/u.test(remainingHeader || '') ||
    !/^\d+(?:\.\d+)?$/u.test(resetHeader || '')
  ) {
    throw new TypeError('ListenBrainz rate limit response is invalid');
  }
  const remaining = Number(remainingHeader);
  const resetMs = Math.ceil(Number(resetHeader) * 1_000);
  if (
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    !Number.isSafeInteger(resetMs) ||
    resetMs < 0 ||
    resetMs > 3_600_000
  ) {
    throw new TypeError('ListenBrainz rate limit response is invalid');
  }
  if (remaining === 0 && resetMs > 0) scheduler.deferFor(resetMs);
}

function validateSeed(seed) {
  if (
    !isPlainObject(seed) ||
    Object.keys(seed).length !== 4 ||
    !LYRICS_CORPUS_STRATA_BY_ID.has(seed.stratum) ||
    !['artist', 'work'].includes(seed.seedType) ||
    !WIKIDATA_ITEM_RE.test(seed.wikidataId || '') ||
    !validUuid(seed.musicbrainzId)
  ) {
    throw new TypeError('MusicBrainz seed is invalid');
  }
  return seed;
}

function parseArtistCredit(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50)
    return null;
  const parts = [];
  let primaryArtistMbid = null;
  for (const [index, credit] of value.entries()) {
    if (
      !isPlainObject(credit) ||
      typeof credit.name !== 'string' ||
      credit.name.length < 1 ||
      credit.name.length > 500 ||
      typeof credit.joinphrase !== 'string' ||
      credit.joinphrase.length > 100 ||
      !isPlainObject(credit.artist) ||
      !validUuid(credit.artist.id)
    ) {
      return null;
    }
    if (index === 0) primaryArtistMbid = credit.artist.id.toLowerCase();
    parts.push(`${credit.name}${credit.joinphrase}`);
  }
  const artist = parts.join('');
  return artist.length <= 500 ? { artist, primaryArtistMbid } : null;
}

function normalizeFirstReleaseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && DATE_RE.test(value) ? value : null;
}

function normalizeRecording(value, seed) {
  if (!isPlainObject(value) || !validUuid(value.id)) {
    throw new TypeError('MusicBrainz recording is invalid');
  }
  if (value.video === true) return null;
  if (
    !Number.isSafeInteger(value.length) ||
    value.length < 1_000 ||
    value.length > 86_400_000
  ) {
    return null;
  }
  const credit = parseArtistCredit(value['artist-credit']);
  if (!credit) return null;
  const title = requiredText(value.title, 'MusicBrainz recording title');
  const stratum = LYRICS_CORPUS_STRATA_BY_ID.get(seed.stratum);
  return {
    stratum: seed.stratum,
    languageTag: stratum.languageTag,
    recordingMbid: value.id.toLowerCase(),
    primaryArtistMbid: credit.primaryArtistMbid,
    workQid: seed.seedType === 'work' ? seed.wikidataId : null,
    workMbid:
      seed.seedType === 'work' ? seed.musicbrainzId.toLowerCase() : null,
    title,
    artist: credit.artist,
    album: null,
    durationMs: value.length,
    firstReleaseDate: normalizeFirstReleaseDate(value['first-release-date']),
  };
}

function parseMusicBrainzPage(value, seed, requestedOffset) {
  if (
    !isPlainObject(value) ||
    !Number.isSafeInteger(value['recording-offset']) ||
    value['recording-offset'] < 0 ||
    !Number.isSafeInteger(value['recording-count']) ||
    value['recording-count'] < 0 ||
    !Array.isArray(value.recordings) ||
    value.recordings.length > MUSICBRAINZ_PAGE_SIZE ||
    value['recording-offset'] !== requestedOffset ||
    value['recording-offset'] + value.recordings.length >
      value['recording-count']
  ) {
    throw new TypeError('MusicBrainz pagination response is invalid');
  }
  return {
    offset: value['recording-offset'],
    total: value['recording-count'],
    returnedCount: value.recordings.length,
    recordings: value.recordings
      .map((recording) => normalizeRecording(recording, seed))
      .filter(Boolean),
  };
}

export function createMusicBrainzRequestScheduler(options = {}) {
  return createLrclibRequestScheduler({
    ...options,
    intervalMs: MUSICBRAINZ_INTERVAL_MS,
  });
}

export function createListenBrainzRequestScheduler(options = {}) {
  return createLrclibRequestScheduler({
    ...options,
    intervalMs: options.intervalMs ?? LISTENBRAINZ_INTERVAL_MS,
  });
}

export async function fetchMusicBrainzRecordingPage(seedInput, options = {}) {
  const seed = validateSeed(seedInput);
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new TypeError('MusicBrainz offset is invalid');
  }
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== 'function')
    throw new TypeError('fetch is unavailable');
  const scheduler = options.scheduler ?? sharedMusicBrainzScheduler;
  if (
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    typeof scheduler.deferFor !== 'function'
  ) {
    throw new TypeError('MusicBrainz scheduler is invalid');
  }
  const url = new URL('/ws/2/recording', MUSICBRAINZ_ORIGIN);
  url.searchParams.set(seed.seedType, seed.musicbrainzId);
  url.searchParams.set('limit', String(MUSICBRAINZ_PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('inc', 'artist-credits+isrcs');
  url.searchParams.set('fmt', 'json');
  for (let attempt = 0; attempt < MUSICBRAINZ_MAX_ATTEMPTS; attempt += 1) {
    let retryAfterMs = null;
    let responseStatus = null;
    try {
      const value = await fetchBoundedJson(
        url.toString(),
        {
          method: 'GET',
          redirect: 'error',
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        },
        {
          fetchFn,
          scheduler,
          source: 'MusicBrainz',
          onResponse(response) {
            responseStatus = response?.status ?? null;
            retryAfterMs = parseRetryAfterMs(
              response?.headers?.get('retry-after'),
            );
          },
        },
      );
      return parseMusicBrainzPage(value, seed, offset);
    } catch (error) {
      if (responseStatus === 404) {
        return { offset, total: 0, returnedCount: 0, recordings: [] };
      }
      if (
        error?.retryable !== true ||
        attempt === MUSICBRAINZ_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
      const fallbackMs = 1_000 * 2 ** attempt;
      scheduler.deferFor(retryAfterMs ?? fallbackMs);
    }
  }
  throw new TypeError('MusicBrainz request failed');
}

export async function collectMusicBrainzRecordingCandidates(
  seeds,
  options = {},
) {
  if (!Array.isArray(seeds) || seeds.length < 1 || seeds.length > 500) {
    throw new TypeError('MusicBrainz seeds are invalid');
  }
  const maxPagesPerSeed = options.maxPagesPerSeed ?? 1;
  if (
    !Number.isSafeInteger(maxPagesPerSeed) ||
    maxPagesPerSeed < 1 ||
    maxPagesPerSeed > 10
  ) {
    throw new TypeError('MusicBrainz page limit is invalid');
  }
  const recordings = [];
  const seen = new Set();
  for (const seed of seeds) {
    let offset = 0;
    for (let pageIndex = 0; pageIndex < maxPagesPerSeed; pageIndex += 1) {
      const page = await fetchMusicBrainzRecordingPage(seed, {
        ...options,
        offset,
      });
      for (const recording of page.recordings) {
        const key = `${recording.stratum}\0${recording.recordingMbid}`;
        if (!seen.has(key)) {
          seen.add(key);
          recordings.push(recording);
        }
      }
      if (
        page.returnedCount === 0 ||
        page.offset + page.returnedCount >= page.total
      ) {
        break;
      }
      offset = page.offset + page.returnedCount;
    }
  }
  return recordings;
}

function normalizePopularityCount(value, label) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`ListenBrainz ${label} is invalid`);
  }
  return value;
}

function parsePopularityBatch(value, expectedMbids) {
  if (!Array.isArray(value) || value.length !== expectedMbids.length) {
    throw new TypeError('ListenBrainz response length is invalid');
  }
  return value.map((item, index) => {
    if (
      !isPlainObject(item) ||
      !validUuid(item.recording_mbid) ||
      item.recording_mbid.toLowerCase() !== expectedMbids[index]
    ) {
      throw new TypeError('ListenBrainz response order is invalid');
    }
    return {
      recordingMbid: expectedMbids[index],
      listenCount: normalizePopularityCount(
        item.total_listen_count,
        'listen count',
      ),
      userCount: normalizePopularityCount(item.total_user_count, 'user count'),
    };
  });
}

export async function fetchListenBrainzRecordingPopularity(
  recordingMbids,
  options = {},
) {
  if (
    !Array.isArray(recordingMbids) ||
    recordingMbids.length < 1 ||
    recordingMbids.length > MAX_LISTENBRAINZ_INPUTS ||
    recordingMbids.some((value) => !validUuid(value))
  ) {
    throw new TypeError('ListenBrainz recording MBIDs are invalid');
  }
  const batchSize = options.batchSize ?? DEFAULT_LISTENBRAINZ_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 250) {
    throw new TypeError('ListenBrainz batch size is invalid');
  }
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== 'function')
    throw new TypeError('fetch is unavailable');
  const scheduler = options.scheduler ?? sharedListenBrainzScheduler;
  if (
    !scheduler ||
    typeof scheduler.schedule !== 'function' ||
    typeof scheduler.deferFor !== 'function'
  ) {
    throw new TypeError('ListenBrainz scheduler is invalid');
  }
  const uniqueMbids = [
    ...new Set(recordingMbids.map((value) => value.toLowerCase())),
  ];
  const results = [];
  for (let index = 0; index < uniqueMbids.length; index += batchSize) {
    const batch = uniqueMbids.slice(index, index + batchSize);
    const value = await fetchBoundedJson(
      LISTENBRAINZ_POPULARITY_URL,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({ recording_mbids: batch }),
      },
      {
        fetchFn,
        scheduler,
        source: 'ListenBrainz',
        onResponse: (response) =>
          applyListenBrainzRateLimit(response, scheduler),
      },
    );
    results.push(...parsePopularityBatch(value, batch));
  }
  return results;
}

export function mergeRecordingPopularity(recordings, popularity) {
  if (!Array.isArray(recordings) || !Array.isArray(popularity)) {
    throw new TypeError('recording popularity merge input is invalid');
  }
  const popularityByMbid = new Map();
  for (const item of popularity) {
    if (
      !isPlainObject(item) ||
      !validUuid(item.recordingMbid) ||
      popularityByMbid.has(item.recordingMbid.toLowerCase())
    ) {
      throw new TypeError('recording popularity merge input is invalid');
    }
    popularityByMbid.set(item.recordingMbid.toLowerCase(), item);
  }
  const merged = [];
  for (const recording of recordings) {
    const item = popularityByMbid.get(recording.recordingMbid?.toLowerCase());
    if (!item) throw new TypeError('recording popularity is missing');
    if (item.listenCount === null || item.userCount === null) continue;
    merged.push({
      stratum: recording.stratum,
      languageTag: recording.languageTag,
      recordingMbid: recording.recordingMbid,
      primaryArtistMbid: recording.primaryArtistMbid,
      workQid: recording.workQid,
      workMbid: recording.workMbid,
      title: recording.title,
      artist: recording.artist,
      album: recording.album,
      durationMs: recording.durationMs,
      firstReleaseDate: recording.firstReleaseDate,
      listenCount: item.listenCount,
      userCount: item.userCount,
    });
  }
  return merged;
}
