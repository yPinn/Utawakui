'use strict';

const path = require('path');
const { setTimeout: waitFor } = require('node:timers/promises');
const { buildLrclibQueryPlan } = require('../lib/lrclib/query.js');
const {
  createLyricsQuerySession,
} = require('../lib/lyricsProviders/querySession.js');
const {
  createLyricsRequestBudget,
} = require('../lib/lyricsProviders/requestPolicy.js');
const {
  createLyricsIdentityResolver,
} = require('../lib/lyricsProviders/identityResolver.js');

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
  createKugouAcquisitionProvider,
} = require('../lib/kugou/acquisition.js');
const {
  projectLyricsCandidateResult,
} = require('../lib/lyricsProviders/timelineComparison.js');
const {
  aggregateLyricsProviderResults,
  mergeLyricsProviderSearchResults,
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
  'kugou-search': '[lyrics] Kugou search failed',
  'kugou-save': '[lyrics] Kugou save failed',
});
const NON_RETRYABLE_REASONS = new Set([
  'invalid-ttml',
  'cancelled',
  'invalid-json',
  'invalid-record',
  'invalid-request',
  'response-too-large',
]);
const DEFAULT_CANDIDATE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_CANDIDATE_SEARCHES = 32;
const DEFAULT_AUTOMATIC_CONCURRENCY = 1;
const AUTOMATIC_ATTEMPT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_RECENT_AUTOMATIC_ATTEMPTS = 256;
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
    options?.automatic === true,
    options?.aliasEvidence?.evidence ?? [],
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
        : operation.startsWith('kugou-')
          ? 'Kugou'
          : operation.startsWith('betterlyrics-')
            ? 'Better Lyrics'
            : 'LRCLIB';
  const operationName = operation.replace(
    /^(?:betterlyrics|netease|kugou)-/u,
    '',
  );
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
  kugouProvider = createKugouAcquisitionProvider(),
  identityResolver = createLyricsIdentityResolver(),
  logger = console,
  candidateCacheTtlMs = DEFAULT_CANDIDATE_CACHE_TTL_MS,
  automaticConcurrency = DEFAULT_AUTOMATIC_CONCURRENCY,
  automaticIntervalMs = 30000,
  automaticWait = waitFor,
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
  const recentAutomaticAttempts = new Map();
  const automaticConcurrencyLimit =
    Number.isSafeInteger(automaticConcurrency) && automaticConcurrency > 0
      ? Math.min(automaticConcurrency, MAX_AUTOMATIC_CONCURRENCY)
      : DEFAULT_AUTOMATIC_CONCURRENCY;
  let automaticActiveCount = 0;
  let lastAutomaticStart = null;
  let automaticStartTail = Promise.resolve();
  let aggregateIntentKey = null;
  let aggregateGeneration = 0;
  const aggregateSessions = new Set();

  function drainAutomaticQueue() {
    while (
      automaticActiveCount < automaticConcurrencyLimit &&
      automaticQueue.length > 0
    ) {
      const task = automaticQueue.shift();
      automaticActiveCount += 1;
      const admitted = automaticStartTail.then(async () => {
        const delay =
          lastAutomaticStart === null
            ? 0
            : Math.max(0, lastAutomaticStart + automaticIntervalMs - now());
        if (delay > 0) await automaticWait(delay);
        lastAutomaticStart = now();
      });
      automaticStartTail = admitted.catch(() => {});
      admitted
        .then(task.start)
        .then(task.resolve, task.reject)
        .finally(() => {
          automaticActiveCount -= 1;
          drainAutomaticQueue();
        });
    }
  }

  function enqueueAutomatic(start) {
    if (automaticQueue.length >= 32)
      return Promise.resolve({
        status: 'skipped',
        reason: 'background-queue-full',
      });
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

  async function observeProviderOperation(operation, start, options = {}) {
    try {
      const result = await start();
      if (
        (result?.status === 'error' || result?.partial === true) &&
        !['busy', 'cancelled', 'request-budget-exhausted'].includes(
          result.reason,
        )
      ) {
        writeLog('warn', operation, providerFailureError(operation, result), {
          reason: result.reason || 'unknown',
          ...(Number.isInteger(result.httpStatus)
            ? { httpStatus: result.httpStatus }
            : {}),
          retryable: isRetryableFailure(result),
          status: options.automatic ? 'background' : 'interactive',
          ...(['network', 'cooldown'].includes(result.requestSource)
            ? { stage: result.requestSource }
            : {}),
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
          status: options.automatic ? 'background' : 'interactive',
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

  function readRetainedSearch(key) {
    const cached = candidateSearchCache.get(key);
    if (!cached) return null;
    const ttl = cached.result?.candidates?.length
      ? candidateCacheTtlMs
      : Math.min(candidateCacheTtlMs, 30000);
    if (now() - cached.storedAt > ttl) {
      candidateSearchCache.delete(key);
      return null;
    }
    return cached.result;
  }

  function readCachedSearch(key, providerId) {
    const result = readRetainedSearch(key);
    if (!result || result.partial === true) return null;
    writeSearchMetric(providerId, {
      cacheHit: true,
      durationMs: 0,
      candidateCount: result.candidates?.length ?? 0,
      status: result.status,
    });
    return result;
  }

  function invalidateChangedCandidateSearches(providerId, track) {
    const identityKey = candidateSearchKey(providerId, track, {});
    for (const [key, cached] of candidateSearchCache) {
      if (
        cached.identityKey === identityKey ||
        cached.providerId === providerId
      )
        candidateSearchCache.delete(key);
    }
    for (const [key, search] of candidateSearchesInFlight) {
      if (
        search.identityKey !== identityKey &&
        search.providerId !== providerId
      )
        continue;
      search.invalidated = true;
      candidateSearchesInFlight.delete(key);
    }
  }

  function cacheSearchResult(key, result, track, providerId) {
    if (result?.status !== 'ok' || candidateCacheTtlMs <= 0) return;
    if (
      candidateSearchCache.size >= MAX_CACHED_CANDIDATE_SEARCHES &&
      !candidateSearchCache.has(key)
    ) {
      candidateSearchCache.delete(candidateSearchCache.keys().next().value);
    }
    candidateSearchCache.set(key, {
      providerId,
      result,
      storedAt: now(),
      trackId: boundedTrackKey(track?.id),
      identityKey: candidateSearchKey(providerId, track, {}),
    });
  }

  function startProviderCandidateSearch(providerId, track, options, signal) {
    if (providerId === 'kugou') {
      return observeProviderOperation(
        'kugou-search',
        () =>
          kugouProvider.searchCandidates(track, {
            ...options,
            signal,
            includeTimelineEvidence: true,
          }),
        options,
      );
    }
    if (providerId === 'lrclib') {
      return observeProviderOperation(
        'search',
        () =>
          searchLrclibCandidates(track, {
            ...options,
            client,
            signal,
            includeTimelineEvidence: true,
          }),
        options,
      );
    }
    if (providerId === 'betterlyrics') {
      return observeProviderOperation(
        'betterlyrics-search',
        () =>
          betterLyricsProvider.searchCandidates(track, { ...options, signal }),
        options,
      );
    }
    return observeProviderOperation(
      'netease-search',
      () =>
        neteaseProvider.searchCandidates(track, {
          ...options,
          signal,
          includeTimelineEvidence: true,
        }),
      options,
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
    if (existing) return existing.operation;
    const retained =
      options.mode === 'broaden'
        ? readRetainedSearch(key) ||
          readRetainedSearch(
            candidateSearchKey(providerId, track, {
              ...options,
              mode: 'structured',
            }),
          )
        : null;

    const cancelSuperseded = searchControl.cancelSuperseded !== false;
    const previous = activeCandidateSearches.get(providerId);
    if (cancelSuperseded && previous && previous.key !== key) {
      // Attach the new request's endpoint subscriber before retiring the old
      // intent, so equivalent HTTP work can survive a track/query transition.
      queueMicrotask(() => previous.controller.abort());
    }
    const controller = new AbortController();
    if (cancelSuperseded) {
      activeCandidateSearches.set(providerId, { key, controller });
    }
    const startedAt = now();
    const search = {
      providerId,
      identityKey: candidateSearchKey(providerId, track, {}),
      invalidated: false,
      operation: null,
    };
    const operation = (async () => {
      try {
        const current = await startProviderCandidateSearch(
          providerId,
          track,
          options,
          controller.signal,
        );
        const result =
          retained && !search.invalidated && !controller.signal.aborted
            ? mergeLyricsProviderSearchResults(retained, current)
            : current;
        if (!search.invalidated && !controller.signal.aborted) {
          cacheSearchResult(key, result, track, providerId);
        }
        writeSearchMetric(providerId, {
          cacheHit: false,
          durationMs: Math.max(0, now() - startedAt),
          candidateCount: result?.candidates?.length ?? 0,
          status: result?.status || 'error',
        });
        // A late pre-change result must not restore known-stale timeline evidence.
        return search.invalidated
          ? projectLyricsCandidateResult(result)
          : result;
      } finally {
        if (candidateSearchesInFlight.get(key) === search) {
          candidateSearchesInFlight.delete(key);
        }
        if (
          cancelSuperseded &&
          activeCandidateSearches.get(providerId)?.controller === controller
        ) {
          activeCandidateSearches.delete(providerId);
        }
      }
    })();
    search.operation = operation;
    candidateSearchesInFlight.set(key, search);
    return operation;
  }

  async function searchCandidates(track, options = {}) {
    requireLyricsFlow();
    return projectLyricsCandidateResult(
      await searchOneProvider('lrclib', track, options),
    );
  }

  async function searchProviderSet(providerIds, track, options, searchControl) {
    return Promise.all(
      providerIds.map(async (providerId) => {
        try {
          return await searchOneProvider(
            providerId,
            track,
            {
              ...options,
              ...(options.sourceBudgets?.[providerId]
                ? { budget: options.sourceBudgets[providerId] }
                : {}),
            },
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
      (!MANUAL_LYRICS_PROVIDER_IDS.includes(providerId) ||
        lyricsProviderPolicy(providerId)?.fallbackOnly)
    ) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    if (providerId === 'all') {
      const intentKey = candidateSearchKey('all', track, options);
      if (aggregateIntentKey !== intentKey) {
        aggregateIntentKey = intentKey;
        aggregateGeneration += 1;
        activeCandidateSearches.get('kugou')?.controller.abort();
        for (const session of aggregateSessions) session.cancel();
      }
      const generation = aggregateGeneration;
      const root = createLyricsQuerySession({
        maxAttempts: options.mode === 'broaden' ? 8 : 12,
        timeoutMs: options.mode === 'broaden' ? 15000 : 20000,
      });
      aggregateSessions.add(root);
      const queryStartedAt = now();
      const disposables = [root];
      function budgetsFor(ids, parent, limits = {}) {
        return Object.fromEntries(
          ids.map((id) => {
            const budget = createLyricsRequestBudget(id, {
              ...options,
              parent,
              ...(limits[id] ? { maxAttempts: limits[id] } : {}),
            });
            disposables.push(budget);
            return [id, budget];
          }),
        );
      }
      try {
        const primaryIds = MANUAL_LYRICS_PROVIDER_IDS.filter(
          (id) => !lyricsProviderPolicy(id)?.fallbackOnly,
        );
        const phase = root.stage({
          maxAttempts: options.mode === 'broaden' ? 3 : 4,
          timeoutMs: 6000,
        });
        disposables.push(phase);
        const primaryOptions = {
          ...options,
          allowRetry: false,
          sourceBudgets: budgetsFor(primaryIds, phase, {
            lrclib: 1,
            netease: 2,
            betterlyrics: 1,
          }),
        };
        // Broaden must fund metadata + hydration before repeating Better's
        // unchanged cache lookup. Cached results remain free; unused primary
        // capacity can still reach Better without borrowing fallback capacity.
        const results =
          options.mode === 'broaden'
            ? [
                ...(await searchProviderSet(
                  primaryIds.filter((id) => id !== 'betterlyrics'),
                  track,
                  primaryOptions,
                )),
                ...(await searchProviderSet(
                  ['betterlyrics'],
                  track,
                  primaryOptions,
                )),
              ]
            : await searchProviderSet(primaryIds, track, primaryOptions);
        const primary = aggregateLyricsProviderResults(
          buildLrclibQueryPlan(track, options.query).identity,
          results,
        );
        const usable = primary.candidates.some(
          (candidate) =>
            candidate.matchBand !== 'related' &&
            candidate.instrumental !== true &&
            (candidate.compatibility?.t1 === true ||
              candidate.compatibility?.t2 === true),
        );
        if (
          !usable &&
          generation === aggregateGeneration &&
          !results.some((result) => result.reason === 'cancelled')
        ) {
          requireLyricsFlow();
          const unavailable = kugouProvider.availability?.();
          if (unavailable?.status === 'error')
            return aggregateLyricsProviderResults(
              buildLrclibQueryPlan(track, options.query).identity,
              [
                ...results,
                {
                  ...unavailable,
                  provider: 'kugou',
                  candidates: [],
                  groups: null,
                },
              ],
            );
          let aliasEvidence;
          const aliasPhase = root.stage({ maxAttempts: 2, timeoutMs: 6000 });
          disposables.push(aliasPhase);
          const aliasBudget = createLyricsRequestBudget('itunes-metadata', {
            parent: aliasPhase,
          });
          disposables.push(aliasBudget);
          try {
            aliasEvidence = await identityResolver.resolve(track, {
              query: options.query,
              budget: aliasBudget,
            });
          } catch {
            /* Optional identity evidence cannot discard primary candidates. */
          }
          if (generation === aggregateGeneration && !root.signal.aborted) {
            requireLyricsFlow();
            const fallback = root.stage({ maxAttempts: 5, timeoutMs: 8000 });
            disposables.push(fallback);
            results.push(
              ...(await searchProviderSet(['kugou'], track, {
                ...options,
                aliasEvidence,
                sourceBudgets: budgetsFor(['kugou'], fallback),
              })),
            );
          }
        }
        return aggregateLyricsProviderResults(
          buildLrclibQueryPlan(track, options.query).identity,
          results,
        );
      } finally {
        aggregateSessions.delete(root);
        for (const disposable of disposables) disposable.dispose();
        try {
          logger?.debug?.('[lyrics] query timing', {
            httpAttempts: root.attempts,
            durationMs: Math.max(0, now() - queryStartedAt),
          });
        } catch {
          /* Metrics do not affect results. */
        }
      }
    }
    return projectLyricsCandidateResult(
      await searchOneProvider(providerId, track, options),
    );
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
    const root =
      options.session ||
      createLyricsQuerySession({ maxAttempts: 3, timeoutMs: 12000 });
    const budget = createLyricsRequestBudget('lrclib', {
      fresh: true,
      parent: root,
      automatic: options.automatic,
    });
    const operation = observeProviderOperation(
      'save',
      () =>
        saveLrclibCandidate({
          ...options,
          fetchRecord: (recordId) =>
            client.getById(recordId, {
              fresh: true,
              budget,
              signal: budget.signal,
              ...(options.automatic ? { priority: 'background' } : {}),
            }),
        }),
      options,
    );
    candidateSavesInFlight.set(saveKey, operation);
    try {
      const result = await operation;
      if (result?.status === 'record-changed') {
        invalidateChangedCandidateSearches('lrclib', options?.track);
      }
      return result;
    } finally {
      budget.dispose();
      if (!options.session) root.dispose();
      if (candidateSavesInFlight.get(saveKey) === operation) {
        candidateSavesInFlight.delete(saveKey);
      }
    }
  }

  async function saveProviderCandidate(providerId, options) {
    if (providerId === 'lrclib') return saveCandidate(options);
    if (!['betterlyrics', 'netease', 'kugou'].includes(providerId)) {
      throw new Error('lyrics provider is invalid');
    }
    requireLyricsFlow();
    const saveKey = String(options?.trackDir || options?.track?.id || '');
    if (candidateSavesInFlight.has(saveKey)) {
      return { provider: providerId, status: 'error', reason: 'busy' };
    }
    const provider =
      providerId === 'betterlyrics'
        ? betterLyricsProvider
        : providerId === 'kugou'
          ? kugouProvider
          : neteaseProvider;
    const root =
      options.session ||
      createLyricsQuerySession({ maxAttempts: 3, timeoutMs: 12000 });
    const budget = createLyricsRequestBudget(providerId, {
      fresh: true,
      parent: root,
      automatic: options.automatic,
    });
    const operation = observeProviderOperation(
      `${providerId}-save`,
      () =>
        provider.saveCandidate({ ...options, budget, signal: budget.signal }),
      options,
    );
    candidateSavesInFlight.set(saveKey, operation);
    try {
      const result = await operation;
      if (result?.status === 'record-changed') {
        invalidateChangedCandidateSearches(providerId, options?.track);
      }
      return result;
    } finally {
      budget.dispose();
      if (!options.session) root.dispose();
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
    const session = createLyricsQuerySession({
      maxAttempts: 7,
      timeoutMs: 30000,
    });
    const sourceBudgets = {
      lrclib: createLyricsRequestBudget('lrclib', {
        automatic: true,
        parent: session,
        maxAttempts: 2,
      }),
      netease: createLyricsRequestBudget('netease', {
        automatic: true,
        parent: session,
        maxAttempts: 3,
      }),
    };
    const startedAt = now();
    try {
      const providerResults = await searchProviderSet(
        AUTOMATIC_LYRICS_PROVIDER_IDS,
        track,
        { automatic: true, sourceBudgets, allowRetry: false },
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
        automatic: true,
        session,
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
    } finally {
      for (const budget of Object.values(sourceBudgets)) budget.dispose();
      session.dispose();
      try {
        logger?.debug?.('[lyrics] background acquisition timing', {
          httpAttempts: session.attempts,
          durationMs: Math.max(0, now() - startedAt),
        });
      } catch {
        /* Metrics do not affect acquisition. */
      }
    }
  }

  function acquireBestIfNeeded(track, trackDir) {
    const key = automaticTrackKey(track, trackDir);
    if (!key) {
      return Promise.resolve({ status: 'skipped', reason: 'stale-track' });
    }
    const generation = automaticGeneration(key);
    const existing = automaticAcquisitionsInFlight.get(key);
    if (existing?.generation === generation) return existing.operation;
    const attemptKey = JSON.stringify([
      trackDir,
      candidateSearchKey('all', track, {}),
    ]);
    const recent = recentAutomaticAttempts.get(attemptKey);
    if (recent && now() - recent.at < AUTOMATIC_ATTEMPT_COOLDOWN_MS) {
      return Promise.resolve({ status: 'skipped', reason: 'recent-attempt' });
    }
    automaticAcquisitionCounts.set(
      key,
      (automaticAcquisitionCounts.get(key) || 0) + 1,
    );
    const operation = enqueueAutomatic(() =>
      runAutomaticAcquisition(track, trackDir, key, generation),
    )
      .then((result) => {
        if (
          automaticGeneration(key) === generation &&
          result?.reason !== 'stale-track'
        ) {
          if (recentAutomaticAttempts.size >= MAX_RECENT_AUTOMATIC_ATTEMPTS) {
            recentAutomaticAttempts.delete(
              recentAutomaticAttempts.keys().next().value,
            );
          }
          recentAutomaticAttempts.set(attemptKey, { at: now(), trackId: key });
        }
        return result;
      })
      .finally(() => {
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
    for (const [attemptKey, attempt] of recentAutomaticAttempts) {
      if (attempt.trackId === key) recentAutomaticAttempts.delete(attemptKey);
    }
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
