'use strict';

const { getTrackLyricsState } = require('../lib/library');
const {
  createBetterLyricsAcquisitionProvider,
} = require('../lib/betterlyrics');
const {
  createLrclibClient,
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  saveLrclibCandidate,
  saveLrclibRecord,
  searchLrclibCandidates,
} = require('../lib/lrclib');
const { createNeteaseAcquisitionProvider } = require('../lib/netease');
const {
  aggregateLyricsProviderResults,
} = require('../lib/lyricsProviders/candidates.js');

const OPERATION_MESSAGES = Object.freeze({
  search: '[lyrics] LRCLIB search failed',
  save: '[lyrics] LRCLIB save failed',
  fetch: '[lyrics] LRCLIB fetch failed',
  'automatic-acquisition': '[lyrics] LRCLIB automatic acquisition failed',
  'betterlyrics-search': '[lyrics] Better Lyrics search failed',
  'betterlyrics-save': '[lyrics] Better Lyrics save failed',
  'netease-search': '[lyrics] NetEase search failed',
  'netease-save': '[lyrics] NetEase save failed',
});
const NON_RETRYABLE_REASONS = new Set([
  'invalid-json',
  'invalid-record',
  'invalid-request',
  'response-too-large',
]);
const SEARCH_PROVIDER_IDS = Object.freeze([
  'lrclib',
  'netease',
  'betterlyrics',
]);
const DEFAULT_CANDIDATE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_CANDIDATE_SEARCHES = 32;

function candidateSearchKey(providerId, track, options) {
  return JSON.stringify([
    providerId,
    track?.id ?? null,
    track?.title ?? track?.trackName ?? '',
    track?.artist ?? track?.artistName ?? '',
    track?.album ?? track?.albumName ?? '',
    Number.isFinite(track?.duration) ? track.duration : null,
    options?.query?.title ?? '',
    options?.query?.artist ?? '',
    options?.mode ?? 'structured',
  ]);
}

function isRetryableFailure(result) {
  if (NON_RETRYABLE_REASONS.has(result?.reason)) return false;
  if (result?.reason === 'http-error' && Number.isInteger(result.httpStatus)) {
    return result.httpStatus === 429 || result.httpStatus >= 500;
  }
  return true;
}

function providerFailureError(operation, result) {
  const provider = operation.startsWith('netease-')
    ? 'NetEase'
    : operation.startsWith('betterlyrics-')
      ? 'Better Lyrics'
      : 'LRCLIB';
  const operationName = operation.replace(/^(?:betterlyrics|netease)-/u, '');
  const httpStatus = Number.isInteger(result?.httpStatus)
    ? ` (HTTP ${result.httpStatus})`
    : '';
  return new Error(
    `${provider} ${operationName} failed: ${result?.reason || 'unknown'}${httpStatus}`,
  );
}

function createLyricsAcquisitionService({
  requireFeatureGate,
  featureId,
  client = createLrclibClient(),
  neteaseProvider = createNeteaseAcquisitionProvider(),
  betterLyricsProvider = createBetterLyricsAcquisitionProvider(),
  logger = console,
  candidateCacheTtlMs = DEFAULT_CANDIDATE_CACHE_TTL_MS,
  now = Date.now,
}) {
  const candidateSearchesInFlight = new Map();
  const activeCandidateSearches = new Map();
  const candidateSearchCache = new Map();
  let candidateSaveInFlight = null;

  function requireLyricsFlow() {
    requireFeatureGate(featureId);
  }

  function writeLog(level, operation, error, context) {
    try {
      logger?.[level]?.(OPERATION_MESSAGES[operation], error, context);
    } catch {
      // Observability must never become a second provider failure.
    }
  }

  async function observeProviderOperation(operation, start) {
    try {
      const result = await start();
      if (result?.status === 'error' && result.reason !== 'busy') {
        writeLog('warn', operation, providerFailureError(operation, result), {
          reason: result.reason || 'unknown',
          ...(Number.isInteger(result.httpStatus)
            ? { httpStatus: result.httpStatus }
            : {}),
          retryable: isRetryableFailure(result),
        });
      }
      return result;
    } catch (error) {
      writeLog(
        'error',
        operation,
        providerFailureError(operation, { reason: 'exception' }),
        {
          reason: 'exception',
          retryable: true,
        },
      );
      throw error;
    }
  }

  function writeSearchMetric(provider, metric) {
    try {
      logger?.debug?.('[lyrics] provider search timing', {
        provider,
        ...metric,
      });
    } catch {
      // Metrics must never affect provider acquisition.
    }
  }

  function readCachedSearch(key, providerId) {
    const cached = candidateSearchCache.get(key);
    if (!cached) return null;
    if (now() - cached.storedAt > candidateCacheTtlMs) {
      candidateSearchCache.delete(key);
      return null;
    }
    writeSearchMetric(providerId, {
      cacheHit: true,
      durationMs: 0,
      candidateCount: cached.result.candidates?.length ?? 0,
      status: cached.result.status,
    });
    return cached.result;
  }

  function cacheSearchResult(key, result) {
    if (result?.status !== 'ok' || candidateCacheTtlMs <= 0) return;
    if (
      candidateSearchCache.size >= MAX_CACHED_CANDIDATE_SEARCHES &&
      !candidateSearchCache.has(key)
    ) {
      candidateSearchCache.delete(candidateSearchCache.keys().next().value);
    }
    candidateSearchCache.set(key, { result, storedAt: now() });
  }

  function startProviderCandidateSearch(providerId, track, options, signal) {
    if (providerId === 'lrclib') {
      return observeProviderOperation('search', () =>
        searchLrclibCandidates(track, { ...options, client, signal }),
      );
    }
    if (providerId === 'betterlyrics') {
      return observeProviderOperation('betterlyrics-search', () =>
        betterLyricsProvider.searchCandidates(track, { ...options, signal }),
      );
    }
    return observeProviderOperation('netease-search', () =>
      neteaseProvider.searchCandidates(track, { ...options, signal }),
    );
  }

  function searchOneProvider(providerId, track, options = {}) {
    const key = candidateSearchKey(providerId, track, options);
    const cached = readCachedSearch(key, providerId);
    if (cached) return Promise.resolve(cached);
    const existing = candidateSearchesInFlight.get(key);
    if (existing) return existing;

    const previous = activeCandidateSearches.get(providerId);
    if (previous && previous.key !== key) previous.controller.abort();
    const controller = new AbortController();
    activeCandidateSearches.set(providerId, { key, controller });
    const startedAt = now();
    const operation = (async () => {
      try {
        const result = await startProviderCandidateSearch(
          providerId,
          track,
          options,
          controller.signal,
        );
        cacheSearchResult(key, result);
        writeSearchMetric(providerId, {
          cacheHit: false,
          durationMs: Math.max(0, now() - startedAt),
          candidateCount: result?.candidates?.length ?? 0,
          status: result?.status || 'error',
        });
        return result;
      } finally {
        candidateSearchesInFlight.delete(key);
        if (
          activeCandidateSearches.get(providerId)?.controller === controller
        ) {
          activeCandidateSearches.delete(providerId);
        }
      }
    })();
    candidateSearchesInFlight.set(key, operation);
    return operation;
  }

  async function searchCandidates(track, options = {}) {
    requireLyricsFlow();
    return searchOneProvider('lrclib', track, options);
  }

  async function searchProviderCandidates(providerId, track, options = {}) {
    if (providerId !== 'all' && !SEARCH_PROVIDER_IDS.includes(providerId)) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    if (providerId === 'all') {
      const results = await Promise.all(
        SEARCH_PROVIDER_IDS.map((id) => searchOneProvider(id, track, options)),
      );
      return aggregateLyricsProviderResults(track, results);
    }
    return searchOneProvider(providerId, track, options);
  }

  async function fetchRecord(recordId) {
    requireLyricsFlow();
    return observeProviderOperation('fetch', () =>
      fetchLrclibRecord(recordId, { client }),
    );
  }

  async function saveCandidate(options) {
    requireLyricsFlow();
    if (candidateSaveInFlight) {
      return { provider: 'lrclib', status: 'error', reason: 'busy' };
    }
    const operation = observeProviderOperation('save', () =>
      saveLrclibCandidate({
        ...options,
        fetchRecord: (recordId) => fetchLrclibRecord(recordId, { client }),
      }),
    );
    candidateSaveInFlight = operation;
    try {
      return await operation;
    } finally {
      if (candidateSaveInFlight === operation) candidateSaveInFlight = null;
    }
  }

  async function saveProviderCandidate(providerId, options) {
    if (providerId === 'lrclib') return saveCandidate(options);
    if (!['betterlyrics', 'netease'].includes(providerId)) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    if (candidateSaveInFlight) {
      return { provider: providerId, status: 'error', reason: 'busy' };
    }
    const provider =
      providerId === 'betterlyrics' ? betterLyricsProvider : neteaseProvider;
    const operation = observeProviderOperation(`${providerId}-save`, () =>
      provider.saveCandidate(options),
    );
    candidateSaveInFlight = operation;
    try {
      return await operation;
    } finally {
      if (candidateSaveInFlight === operation) candidateSaveInFlight = null;
    }
  }

  async function saveIfAbsent(track, trackDir) {
    const lyricsState = getTrackLyricsState(trackDir);
    if (lyricsState.sources.some((source) => source.kind === 'lrclib')) {
      return false;
    }

    requireLyricsFlow();
    const result = await observeProviderOperation('automatic-acquisition', () =>
      findLrclibSyncedLyrics(track, { client }),
    );
    if (result.status !== 'available') return false;
    return saveLrclibRecord(trackDir, result.record).status === 'saved';
  }

  return {
    fetchRecord,
    saveCandidate,
    saveIfAbsent,
    saveProviderCandidate,
    searchCandidates,
    searchProviderCandidates,
  };
}

module.exports = { createLyricsAcquisitionService };
