'use strict';

const path = require('path');

const {
  getTrackLyricsState,
  hasCurrentFullT2Lyrics,
  setLyricsSourcePreference,
} = require('../lib/library');
const {
  createBetterLyricsAcquisitionProvider,
} = require('../lib/betterlyrics');
const {
  createLrclibClient,
  fetchLrclibRecord,
  saveLrclibCandidate,
  searchLrclibCandidates,
} = require('../lib/lrclib');
const { createNeteaseAcquisitionProvider } = require('../lib/netease');
const {
  aggregateLyricsProviderResults,
  selectAutomaticLyricsCandidate,
} = require('../lib/lyricsProviders/candidates.js');
const {
  AUTOMATIC_LYRICS_PROVIDER_IDS,
  MANUAL_LYRICS_PROVIDER_IDS,
  lyricsProviderPolicy,
} = require('../lib/lyricsProviders/policy.js');
const {
  findStructuredAudioFilename,
  isSafeTrackId,
} = require('../lib/library/paths.js');

const OPERATION_MESSAGES = Object.freeze({
  search: '[lyrics] LRCLIB search failed',
  save: '[lyrics] LRCLIB save failed',
  fetch: '[lyrics] LRCLIB fetch failed',
  'automatic-acquisition': '[lyrics] automatic acquisition failed',
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
const DEFAULT_CANDIDATE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_CANDIDATE_SEARCHES = 32;
const DEFAULT_AUTOMATIC_CONCURRENCY = 2;
const MAX_AUTOMATIC_CONCURRENCY = 4;
const MAX_AUTOMATIC_TRACK_KEY_LENGTH = 128;

function boundedTrackKey(value) {
  return typeof value === 'string' &&
    value.length <= MAX_AUTOMATIC_TRACK_KEY_LENGTH &&
    isSafeTrackId(value)
    ? value
    : null;
}

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
  const provider =
    operation === 'automatic-acquisition'
      ? 'Automatic lyrics'
      : operation.startsWith('netease-')
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
  automaticConcurrency = DEFAULT_AUTOMATIC_CONCURRENCY,
  isTrackCurrent = (_track, trackDir) =>
    Boolean(findStructuredAudioFilename(trackDir)),
  setAutomaticPreference = setLyricsSourcePreference,
  now = Date.now,
}) {
  const candidateSearchesInFlight = new Map();
  const activeCandidateSearches = new Map();
  const candidateSearchCache = new Map();
  const candidateSavesInFlight = new Map();
  const automaticAcquisitionsInFlight = new Map();
  const automaticAcquisitionCounts = new Map();
  const automaticGenerationByTrackKey = new Map();
  const automaticQueue = [];
  const automaticConcurrencyLimit =
    Number.isSafeInteger(automaticConcurrency) && automaticConcurrency > 0
      ? Math.min(automaticConcurrency, MAX_AUTOMATIC_CONCURRENCY)
      : DEFAULT_AUTOMATIC_CONCURRENCY;
  let automaticActiveCount = 0;

  function drainAutomaticQueue() {
    while (
      automaticActiveCount < automaticConcurrencyLimit &&
      automaticQueue.length > 0
    ) {
      const task = automaticQueue.shift();
      automaticActiveCount += 1;
      Promise.resolve()
        .then(task.start)
        .then(task.resolve, task.reject)
        .finally(() => {
          automaticActiveCount -= 1;
          drainAutomaticQueue();
        });
    }
  }

  function enqueueAutomatic(start) {
    return new Promise((resolve, reject) => {
      automaticQueue.push({ start, resolve, reject });
      drainAutomaticQueue();
    });
  }

  function automaticTrackKey(track, trackDir) {
    const explicitTrackId = boundedTrackKey(track?.id);
    if (explicitTrackId) return explicitTrackId;
    if (typeof trackDir !== 'string' || trackDir.length === 0) return '';
    return boundedTrackKey(path.basename(trackDir)) || '';
  }

  function automaticGeneration(key) {
    return automaticGenerationByTrackKey.get(key) || 0;
  }

  function automaticTrackIsCurrent(key, generation, track, trackDir) {
    if (automaticGeneration(key) !== generation) return false;
    try {
      return isTrackCurrent(track, trackDir) === true;
    } catch {
      return false;
    }
  }

  function automaticCommitDenial(key, generation, track, trackDir, candidate) {
    if (!automaticTrackIsCurrent(key, generation, track, trackDir)) {
      return 'stale-track';
    }
    if (hasCurrentFullT2Lyrics(trackDir)) return 'current-t2';
    const state = getTrackLyricsState(trackDir);
    if (state.sources.length > 0 && !isFullT2Candidate(candidate)) {
      return 'not-an-upgrade';
    }
    return null;
  }

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

  function cacheSearchResult(key, result, trackId) {
    if (result?.status !== 'ok' || candidateCacheTtlMs <= 0) return;
    if (
      candidateSearchCache.size >= MAX_CACHED_CANDIDATE_SEARCHES &&
      !candidateSearchCache.has(key)
    ) {
      candidateSearchCache.delete(candidateSearchCache.keys().next().value);
    }
    candidateSearchCache.set(key, {
      result,
      storedAt: now(),
      trackId: boundedTrackKey(trackId),
    });
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

  function searchOneProvider(
    providerId,
    track,
    options = {},
    searchControl = {},
  ) {
    const key = candidateSearchKey(providerId, track, options);
    const cached = readCachedSearch(key, providerId);
    if (cached) return Promise.resolve(cached);
    const existing = candidateSearchesInFlight.get(key);
    if (existing) return existing;

    const cancelSuperseded = searchControl.cancelSuperseded !== false;
    const previous = activeCandidateSearches.get(providerId);
    if (cancelSuperseded && previous && previous.key !== key) {
      previous.controller.abort();
    }
    const controller = new AbortController();
    if (cancelSuperseded) {
      activeCandidateSearches.set(providerId, { key, controller });
    }
    const startedAt = now();
    const operation = (async () => {
      try {
        const result = await startProviderCandidateSearch(
          providerId,
          track,
          options,
          controller.signal,
        );
        cacheSearchResult(key, result, track?.id);
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
          cancelSuperseded &&
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

  async function searchProviderSet(providerIds, track, options, searchControl) {
    return Promise.all(
      providerIds.map(async (providerId) => {
        try {
          return await searchOneProvider(
            providerId,
            track,
            options,
            searchControl,
          );
        } catch {
          return {
            provider: providerId,
            status: 'error',
            reason: 'service-unavailable',
            candidates: [],
            groups: null,
          };
        }
      }),
    );
  }

  async function searchProviderCandidates(providerId, track, options = {}) {
    if (
      providerId !== 'all' &&
      !MANUAL_LYRICS_PROVIDER_IDS.includes(providerId)
    ) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    if (providerId === 'all') {
      const results = await searchProviderSet(
        MANUAL_LYRICS_PROVIDER_IDS,
        track,
        options,
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
    const saveKey = String(options?.trackDir || options?.track?.id || '');
    if (candidateSavesInFlight.has(saveKey)) {
      return { provider: 'lrclib', status: 'error', reason: 'busy' };
    }
    const operation = observeProviderOperation('save', () =>
      saveLrclibCandidate({
        ...options,
        fetchRecord: (recordId) => fetchLrclibRecord(recordId, { client }),
      }),
    );
    candidateSavesInFlight.set(saveKey, operation);
    try {
      return await operation;
    } finally {
      if (candidateSavesInFlight.get(saveKey) === operation) {
        candidateSavesInFlight.delete(saveKey);
      }
    }
  }

  async function saveProviderCandidate(providerId, options) {
    if (providerId === 'lrclib') return saveCandidate(options);
    if (!['betterlyrics', 'netease'].includes(providerId)) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    const saveKey = String(options?.trackDir || options?.track?.id || '');
    if (candidateSavesInFlight.has(saveKey)) {
      return { provider: providerId, status: 'error', reason: 'busy' };
    }
    const provider =
      providerId === 'betterlyrics' ? betterLyricsProvider : neteaseProvider;
    const operation = observeProviderOperation(`${providerId}-save`, () =>
      provider.saveCandidate(options),
    );
    candidateSavesInFlight.set(saveKey, operation);
    try {
      return await operation;
    } finally {
      if (candidateSavesInFlight.get(saveKey) === operation) {
        candidateSavesInFlight.delete(saveKey);
      }
    }
  }

  function isFullT2Candidate(candidate) {
    return (
      candidate?.capability?.level === 'T2' &&
      candidate.capability.partial !== true &&
      candidate?.compatibility?.t2 === true
    );
  }

  async function runAutomaticAcquisition(track, trackDir, key, generation) {
    if (!automaticTrackIsCurrent(key, generation, track, trackDir)) {
      return { status: 'skipped', reason: 'stale-track' };
    }
    if (hasCurrentFullT2Lyrics(trackDir)) {
      return { status: 'skipped', reason: 'current-t2' };
    }
    const initialState = getTrackLyricsState(trackDir);
    requireLyricsFlow();
    const providerResults = await searchProviderSet(
      AUTOMATIC_LYRICS_PROVIDER_IDS,
      track,
      {},
      { cancelSuperseded: false },
    );
    const aggregate = aggregateLyricsProviderResults(track, providerResults);
    const candidate = selectAutomaticLyricsCandidate(aggregate.candidates);
    if (!candidate) {
      return { status: 'skipped', reason: 'no-exact-candidate' };
    }
    const policy = lyricsProviderPolicy(candidate.providerId);
    if (!policy?.automaticSave) {
      return { status: 'skipped', reason: 'provider-manual-only' };
    }
    if (initialState.sources.length > 0 && !isFullT2Candidate(candidate)) {
      return { status: 'skipped', reason: 'not-an-upgrade' };
    }

    if (hasCurrentFullT2Lyrics(trackDir)) {
      return { status: 'skipped', reason: 'current-t2' };
    }
    const commitState = getTrackLyricsState(trackDir);
    if (commitState.sources.length > 0 && !isFullT2Candidate(candidate)) {
      return { status: 'skipped', reason: 'not-an-upgrade' };
    }

    const saved = await saveProviderCandidate(candidate.providerId, {
      track,
      trackDir,
      candidateId: candidate.id,
      expectedFingerprint: candidate.previewFingerprint,
      validateCommit: () =>
        automaticCommitDenial(key, generation, track, trackDir, candidate),
    });
    if (saved?.status !== 'saved' || !saved.source?.filename) {
      return {
        status: 'skipped',
        reason: saved?.reason || saved?.status || 'save-failed',
      };
    }
    try {
      setAutomaticPreference(trackDir, saved.source.filename, 'automatic', {
        preserveUser: true,
      });
    } catch {
      writeLog(
        'warn',
        'automatic-acquisition',
        providerFailureError('automatic-acquisition', {
          reason: 'preference-write-failed',
        }),
        { reason: 'preference-write-failed', retryable: true },
      );
    }
    return { provider: candidate.providerId, ...saved };
  }

  function acquireBestIfNeeded(track, trackDir) {
    const key = automaticTrackKey(track, trackDir);
    if (!key) {
      return Promise.resolve({ status: 'skipped', reason: 'stale-track' });
    }
    const generation = automaticGeneration(key);
    const existing = automaticAcquisitionsInFlight.get(key);
    if (existing?.generation === generation) return existing.operation;
    automaticAcquisitionCounts.set(
      key,
      (automaticAcquisitionCounts.get(key) || 0) + 1,
    );
    const operation = enqueueAutomatic(() =>
      runAutomaticAcquisition(track, trackDir, key, generation),
    ).finally(() => {
      if (automaticAcquisitionsInFlight.get(key)?.operation === operation) {
        automaticAcquisitionsInFlight.delete(key);
      }
      const remaining = (automaticAcquisitionCounts.get(key) || 1) - 1;
      if (remaining > 0) {
        automaticAcquisitionCounts.set(key, remaining);
      } else {
        automaticAcquisitionCounts.delete(key);
        automaticGenerationByTrackKey.delete(key);
      }
    });
    automaticAcquisitionsInFlight.set(key, { generation, operation });
    return operation;
  }

  function invalidateAutomaticAcquisition(trackId) {
    const key = boundedTrackKey(trackId);
    if (!key) return false;
    if ((automaticAcquisitionCounts.get(key) || 0) > 0) {
      automaticGenerationByTrackKey.set(key, automaticGeneration(key) + 1);
    }
    for (const [cacheKey, cached] of candidateSearchCache) {
      if (cached.trackId === key) candidateSearchCache.delete(cacheKey);
    }
    return true;
  }

  function scheduleAutomaticAcquisition(track, trackDir, options = {}) {
    return Promise.resolve()
      .then(() => acquireBestIfNeeded(track, trackDir))
      .then((result) => {
        if (result?.status === 'saved') {
          try {
            options.onSaved?.();
          } catch {
            // A UI refresh callback cannot invalidate a committed source.
          }
        }
        return result;
      })
      .catch(() => ({ status: 'skipped', reason: 'acquisition-failed' }));
  }

  return {
    acquireBestIfNeeded,
    fetchRecord,
    invalidateAutomaticAcquisition,
    saveCandidate,
    saveProviderCandidate,
    scheduleAutomaticAcquisition,
    searchCandidates,
    searchProviderCandidates,
  };
}

module.exports = { createLyricsAcquisitionService };
