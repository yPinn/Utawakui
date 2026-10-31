'use strict';

const { appUserAgent } = require('../userAgent.js');
const { readBoundedText } = require('../lrclib/client.js');
const {
  getLyricsRequestPolicy,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const { createProviderRequestGuard } = require('../providerServiceCooldown.js');

const NETEASE_API_BASE_URL = 'https://interface.music.163.com';
const NETEASE_SEARCH_PATH = '/api/cloudsearch/pc';
const NETEASE_LYRICS_PATH = '/api/song/lyric/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_QUERY_CHARS = 256;
const MAX_SEARCH_RECORDS = 10;

function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validQueryText(value, required = false) {
  if (value === undefined || value === null) return !required;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_QUERY_CHARS &&
    !containsControlCharacter(value)
  );
}

function normalizeTextArray(value) {
  if (!Array.isArray(value) || value.length > 16) return null;
  const result = [];
  for (const item of value) {
    if (!validQueryText(item, true)) return null;
    result.push(item.trim());
  }
  return result;
}

function normalizeArtists(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  const names = [];
  for (const item of value) {
    const name = typeof item === 'string' ? item : item?.name;
    if (!validQueryText(name, true)) return null;
    names.push(name.trim());
  }
  return names;
}

function normalizeNeteaseSong(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = value.id;
  const trackName = value.trackName ?? value.name;
  const artists = normalizeArtists(value.artists ?? value.ar);
  const albumValue = value.albumName ?? value.album ?? value.al;
  const albumName =
    typeof albumValue === 'string' ? albumValue : albumValue?.name;
  const rawDuration = value.duration ?? value.durationSeconds ?? value.dt;
  const duration =
    value.duration === rawDuration || value.durationSeconds === rawDuration
      ? rawDuration
      : rawDuration / 1000;
  const aliases = normalizeTextArray(value.aliases ?? value.alia ?? []);
  const translatedTitles = normalizeTextArray(
    value.translatedTitles ?? value.tns ?? [],
  );
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !validQueryText(trackName, true) ||
    !artists ||
    !validQueryText(albumName) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 86_400 ||
    !aliases ||
    !translatedTitles
  ) {
    return null;
  }
  return {
    id,
    trackName: trackName.trim(),
    artistName: artists.join(', '),
    artists,
    albumName: albumName?.trim() || null,
    duration: Math.round(duration * 1000) / 1000,
    aliases,
    translatedTitles,
  };
}

function parseJson(text) {
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
}

function responseFailure(response) {
  if (response.status === 429)
    return { status: 'error', reason: 'rate-limited' };
  if (response.status === 503) {
    return { status: 'error', reason: 'service-unavailable' };
  }
  return {
    status: 'error',
    reason: 'http-error',
    httpStatus: response.status,
  };
}

function providerFailure(code) {
  if (code === 200) return null;
  if (code === 404) return { status: 'unavailable', reason: 'not-found' };
  if (code === 429) return { status: 'error', reason: 'rate-limited' };
  if (code === 503) return { status: 'error', reason: 'service-unavailable' };
  return { status: 'error', reason: 'provider-failure' };
}

function extractLyric(value) {
  if (value === undefined || value === null) return '';
  if (!value || typeof value !== 'object' || typeof value.lyric !== 'string') {
    return null;
  }
  return value.lyric;
}

function createNeteaseClient(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const requestGuard = createProviderRequestGuard(fetchFn, options);
  const policy = getLyricsRequestPolicy('netease', fetchFn, options);
  const scheduler = policy.scheduler;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  async function request(pathname, fields, requestOptions = {}) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    let response;
    let signal;
    try {
      response = await scheduler.schedule(
        () => {
          const timeoutSignal = AbortSignal.timeout(timeoutMs);
          signal = requestOptions.signal
            ? AbortSignal.any([requestOptions.signal, timeoutSignal])
            : timeoutSignal;
          return requestGuard.fetch(
            new URL(pathname, NETEASE_API_BASE_URL),
            {
              method: 'POST',
              redirect: 'error',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: 'https://music.163.com/',
                'User-Agent': appUserAgent(),
              },
              body: new URLSearchParams(fields),
              signal,
            },
            requestOptions.charge,
          );
        },
        { signal: requestOptions.signal, priority: requestOptions.priority },
      );
    } catch (error) {
      return requestFailure(error);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return responseFailure(response);
    }
    const bounded = await readBoundedText(response, maxResponseBytes, signal);
    if (bounded.status === 'error') return bounded;
    const parsed = parseJson(bounded.text);
    if (parsed.status === 'ok') {
      requestGuard.recordFailure(
        new URL(pathname, NETEASE_API_BASE_URL),
        parsed.value?.code,
        response.headers.get('retry-after'),
      );
    }
    return parsed;
  }

  async function readSearch(query, requestOptions) {
    if (
      !query ||
      typeof query !== 'object' ||
      Array.isArray(query) ||
      !validQueryText(query.trackName, true) ||
      !validQueryText(query.artistName)
    ) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const keywords = [query.trackName.trim(), query.artistName?.trim()]
      .filter(Boolean)
      .join(' ');
    const result = await request(
      NETEASE_SEARCH_PATH,
      {
        s: keywords,
        type: '1',
        limit: String(MAX_SEARCH_RECORDS),
        offset: '0',
        total: 'true',
      },
      requestOptions,
    );
    if (result.status === 'error') return result;
    const failure = providerFailure(result.value?.code);
    if (failure) return failure;
    const songs = result.value?.result?.songs;
    if (!Array.isArray(songs)) {
      return { status: 'error', reason: 'invalid-record' };
    }
    if (songs.length > MAX_SEARCH_RECORDS) {
      return { status: 'error', reason: 'response-too-large' };
    }
    const records = [];
    let invalidRecordCount = 0;
    for (const song of songs) {
      const normalized = normalizeNeteaseSong(song);
      if (normalized) records.push(normalized);
      else invalidRecordCount += 1;
    }
    return { status: 'ok', records, invalidRecordCount };
  }

  async function readLyrics(recordId, requestOptions) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0) {
      return { status: 'error', reason: 'invalid-request' };
    }
    const result = await request(
      NETEASE_LYRICS_PATH,
      {
        id: String(recordId),
        cp: 'false',
        tv: '0',
        lv: '0',
        rv: '0',
        kv: '0',
        yv: '0',
        ytv: '0',
        yrv: '0',
      },
      requestOptions,
    );
    if (result.status === 'error') return result;
    const failure = providerFailure(result.value?.code);
    if (failure) return failure;
    const yrcLyrics = extractLyric(result.value?.yrc);
    const lrcLyrics = extractLyric(result.value?.lrc);
    if (yrcLyrics === null || lrcLyrics === null) {
      return { status: 'error', reason: 'invalid-record' };
    }
    return { status: 'ok', record: { id: recordId, yrcLyrics, lrcLyrics } };
  }

  async function run(identity, read, requestOptions = {}) {
    try {
      return await policy.run(
        [identity, maxResponseBytes],
        (context) => read({ ...requestOptions, ...context }),
        requestOptions,
      );
    } catch (error) {
      return requestFailure(error);
    }
  }
  function search(query, requestOptions) {
    if (
      !query ||
      typeof query !== 'object' ||
      Array.isArray(query) ||
      !validQueryText(query.trackName, true) ||
      !validQueryText(query.artistName)
    )
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    const keywords = [query.trackName.trim(), query.artistName?.trim()]
      .filter(Boolean)
      .join(' ');
    const snapshot = {
      trackName: query.trackName.trim(),
      artistName: query.artistName?.trim(),
    };
    return run(
      [NETEASE_SEARCH_PATH, keywords],
      (context) => readSearch(snapshot, context),
      requestOptions,
    );
  }
  function getLyrics(recordId, requestOptions) {
    if (!Number.isSafeInteger(recordId) || recordId <= 0)
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    return run(
      [NETEASE_LYRICS_PATH, recordId],
      (context) => readLyrics(recordId, context),
      requestOptions,
    );
  }
  return { search, getLyrics, invalidateDiscovery: policy.invalidate };
}

module.exports = {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  NETEASE_API_BASE_URL,
  createNeteaseClient,
  normalizeNeteaseSong,
};
