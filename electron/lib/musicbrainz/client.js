'use strict';

const packageMetadata = require('../../../package.json');
const { readBoundedText } = require('../lrclib/client.js');
const {
  createProviderRequestScheduler,
} = require('../providerRequestScheduler.js');

const MUSICBRAINZ_API_BASE_URL = 'https://musicbrainz.org';
const MUSICBRAINZ_PROJECT_URL = 'https://github.com/yPinn/Utawakui';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REQUEST_INTERVAL_MS = 1_100;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_PROVIDER_RECORDS = 25;
const MAX_QUERY_CHARS = 200;
const MAX_CACHE_ENTRIES = 64;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LUCENE_SPECIAL_RE = /([+\-&|!(){}[\]^"~*?:\\/])/gu;

const sharedMusicBrainzScheduler = createProviderRequestScheduler({
  intervalMs: DEFAULT_REQUEST_INTERVAL_MS,
});

function buildMusicBrainzUserAgent() {
  return `Utawakui/${packageMetadata.version} (${MUSICBRAINZ_PROJECT_URL})`;
}

function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validText(value, required = false) {
  if (value === undefined || value === null) return !required;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_QUERY_CHARS &&
    !containsControlCharacter(value)
  );
}

function escapeLucene(value) {
  return value.trim().replace(LUCENE_SPECIAL_RE, '\\$1');
}

function buildMusicBrainzQuery(entityType, query = {}) {
  const field =
    entityType === 'release-group'
      ? 'releasegroup'
      : entityType === 'recording'
        ? 'recording'
        : null;
  if (
    !field ||
    !validText(query.title, true) ||
    !validText(query.artist) ||
    !validText(query.album)
  ) {
    return null;
  }
  const clauses = [`${field}:"${escapeLucene(query.title)}"`];
  if (query.artist?.trim()) {
    clauses.push(`artist:"${escapeLucene(query.artist)}"`);
  }
  if (entityType === 'recording' && query.album?.trim()) {
    clauses.push(`release:"${escapeLucene(query.album)}"`);
  }
  return clauses.join(' AND ');
}

function normalizeText(value, maxChars = 500) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= maxChars ? text : undefined;
}

function normalizeDate(value) {
  const text = normalizeText(value, 10);
  return text && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u.test(text) ? text : undefined;
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

function normalizeStringList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  const values = [];
  for (const item of value.slice(0, limit)) {
    const text = normalizeText(item, 100);
    if (text && !values.includes(text)) values.push(text);
  }
  return values;
}

function artistCreditText(value) {
  if (!Array.isArray(value) || value.length > 32) return undefined;
  let text = '';
  for (const credit of value) {
    const name = normalizeText(credit?.name ?? credit?.artist?.name, 200);
    if (!name) continue;
    text += name;
    const joinPhrase = credit?.joinphrase;
    if (
      typeof joinPhrase === 'string' &&
      joinPhrase.length <= 30 &&
      !containsControlCharacter(joinPhrase)
    ) {
      text += joinPhrase;
    }
  }
  return normalizeText(text, 500);
}

function normalizeReleaseGroup(value) {
  if (!value || typeof value !== 'object' || !MBID_RE.test(value.id)) {
    return null;
  }
  const title = normalizeText(value.title);
  if (!title) return null;
  return {
    entityType: 'release-group',
    id: value.id.toLowerCase(),
    title,
    artistCredit: artistCreditText(value['artist-credit']),
    firstReleaseDate: normalizeDate(value['first-release-date']),
    primaryType: normalizeText(value['primary-type'], 100),
    secondaryTypes: normalizeStringList(value['secondary-types']),
    score: normalizeScore(value.score),
  };
}

function normalizeRelease(value) {
  if (!value || typeof value !== 'object' || !MBID_RE.test(value.id)) {
    return null;
  }
  const title = normalizeText(value.title);
  if (!title) return null;
  const releaseGroup = value['release-group'];
  return {
    id: value.id.toLowerCase(),
    title,
    artistCredit: artistCreditText(value['artist-credit']),
    status: normalizeText(value.status, 100),
    date: normalizeDate(value.date),
    country: normalizeText(value.country, 10),
    releaseGroup:
      releaseGroup && MBID_RE.test(releaseGroup.id)
        ? {
            id: releaseGroup.id.toLowerCase(),
            title: normalizeText(releaseGroup.title),
            firstReleaseDate: normalizeDate(releaseGroup['first-release-date']),
            primaryType: normalizeText(releaseGroup['primary-type'], 100),
            secondaryTypes: normalizeStringList(
              releaseGroup['secondary-types'],
            ),
          }
        : undefined,
  };
}

function normalizeRecording(value) {
  if (!value || typeof value !== 'object' || !MBID_RE.test(value.id)) {
    return null;
  }
  const title = normalizeText(value.title);
  if (!title) return null;
  const duration = Number(value.length);
  const releases = Array.isArray(value.releases)
    ? value.releases.slice(0, 16).map(normalizeRelease).filter(Boolean)
    : [];
  return {
    entityType: 'recording',
    id: value.id.toLowerCase(),
    title,
    artistCredit: artistCreditText(value['artist-credit']),
    duration:
      Number.isFinite(duration) && duration >= 0
        ? Math.round(duration / 1000)
        : undefined,
    isrcs: normalizeStringList(value.isrcs, 12),
    releases,
    score: normalizeScore(value.score),
  };
}

function parseJson(text) {
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
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

function createMusicBrainzClient(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const scheduler = options.scheduler || sharedMusicBrainzScheduler;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const userAgent = options.userAgent || buildMusicBrainzUserAgent();
  const now = options.now || Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map();

  function cached(key) {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function remember(key, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { expiresAt: now() + cacheTtlMs, value });
  }

  async function request(entityType, query, requestOptions = {}) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    const luceneQuery = buildMusicBrainzQuery(entityType, query);
    if (!luceneQuery) return { status: 'error', reason: 'invalid-request' };
    const endpoint =
      entityType === 'release-group' ? 'release-group' : entityType;
    const url = new URL(`/ws/2/${endpoint}`, MUSICBRAINZ_API_BASE_URL);
    url.searchParams.set('query', luceneQuery);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', String(DEFAULT_SEARCH_LIMIT));
    const cacheKey = url.href;
    const hit = cached(cacheKey);
    if (hit) return hit;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      let signal;
      try {
        response = await scheduler.schedule(
          () => {
            const timeoutSignal = AbortSignal.timeout(timeoutMs);
            signal = requestOptions.signal
              ? AbortSignal.any([requestOptions.signal, timeoutSignal])
              : timeoutSignal;
            return fetchFn(url, {
              method: 'GET',
              redirect: 'error',
              headers: {
                Accept: 'application/json',
                'User-Agent': userAgent,
              },
              signal,
            });
          },
          { signal: requestOptions.signal },
        );
      } catch (error) {
        return classifyTransportFailure(error);
      }

      if (response.status === 503 && attempt === 0) {
        await response.body?.cancel().catch(() => undefined);
        scheduler.deferFor(DEFAULT_REQUEST_INTERVAL_MS);
        continue;
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
      const parsed = parseJson(bounded.text);
      if (parsed.status === 'error') return parsed;
      const listKey =
        entityType === 'release-group' ? 'release-groups' : 'recordings';
      const values = parsed.value?.[listKey];
      if (!Array.isArray(values)) {
        return { status: 'error', reason: 'invalid-json' };
      }
      if (values.length > MAX_PROVIDER_RECORDS) {
        return { status: 'error', reason: 'response-too-large' };
      }
      const normalize =
        entityType === 'release-group'
          ? normalizeReleaseGroup
          : normalizeRecording;
      const records = values
        .slice(0, DEFAULT_SEARCH_LIMIT)
        .map(normalize)
        .filter(Boolean);
      const result = {
        status: 'ok',
        records,
        invalidRecordCount: values.length - records.length,
      };
      remember(cacheKey, result);
      return result;
    }
    return { status: 'error', reason: 'service-unavailable' };
  }

  return {
    searchRecordings: (query, requestOptions) =>
      request('recording', query, requestOptions),
    searchReleaseGroups: (query, requestOptions) =>
      request('release-group', query, requestOptions),
  };
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MUSICBRAINZ_API_BASE_URL,
  buildMusicBrainzQuery,
  buildMusicBrainzUserAgent,
  createMusicBrainzClient,
  normalizeRecording,
  normalizeReleaseGroup,
};
