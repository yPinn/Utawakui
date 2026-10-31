'use strict';

const {
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
} = require('./candidate.js');
const { createLrclibClient } = require('./client.js');
const { buildLrclibQueryPlan } = require('./query.js');
const { createLrclibRequestScheduler } = require('./scheduler.js');
const {
  createLyricsRequestBudget,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const {
  buildLyricsTimelineEvidence,
} = require('../lyricsProviders/timelineComparison.js');

const LRCLIB_PROVIDER = 'lrclib';
const MAX_MANUAL_CANDIDATES = 20;
const PREVIEW_LINE_LIMIT = 5;

function clientForOptions(options) {
  if (options.client) return options.client;
  const clientOptions = { baseUrl: options.baseUrl };
  if (Object.prototype.hasOwnProperty.call(options, 'fetch')) {
    clientOptions.fetch = options.fetch;
    clientOptions.scheduler =
      options.scheduler || createLrclibRequestScheduler({ intervalMs: 0 });
  } else if (options.scheduler) {
    clientOptions.scheduler = options.scheduler;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'signal')) {
    clientOptions.signal = options.signal;
  }
  return createLrclibClient(clientOptions);
}

function providerFailure(result, extra = {}) {
  if (result.reason === 'fetch-unavailable') {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: result.reason,
      ...extra,
    };
  }
  return {
    provider: LRCLIB_PROVIDER,
    status: 'error',
    reason: result.reason,
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    ...(result.requestSource ? { requestSource: result.requestSource } : {}),
    ...extra,
  };
}

function unavailable(reason, extra = {}) {
  return {
    provider: LRCLIB_PROVIDER,
    status: 'unavailable',
    reason,
    ...extra,
  };
}

function canContinueAfterExact(result) {
  return (
    result.status === 'unavailable' ||
    (result.status === 'error' && result.reason === 'invalid-record')
  );
}

function buildAvailableResult(match) {
  const record = match.record;
  const label = record.albumName || record.artistName;
  return {
    provider: LRCLIB_PROVIDER,
    status: 'available',
    source: {
      filename: `lrclib-${record.id}.lrc`,
      language: 'und',
      kind: LRCLIB_PROVIDER,
      ...(label ? { label } : {}),
    },
    text: record.syncedLyrics,
    lineCount: match.lineCount,
    match: {
      confidence: match.band === 'exact' ? 'auto' : 'candidate',
      band: match.band,
      durationDelta: match.durationDelta,
      reasons: match.matchReasons,
    },
    record,
  };
}

function isCurrentAutoSaveCompatible(match) {
  return (
    match.autoUsable &&
    ((typeof match.record.lyricsfile === 'string' &&
      (match.compatibility.t2 || match.compatibility.t1)) ||
      (typeof match.record.syncedLyrics === 'string' &&
        match.record.syncedLyrics.trim().length > 0))
  );
}

function buildCandidateResult(
  identity,
  records,
  invalidRecordCount = 0,
  includeTimelineEvidence = false,
) {
  const matches = rankLrclibCandidateMatches(identity, records).slice(
    0,
    MAX_MANUAL_CANDIDATES,
  );
  const candidates = matches.map((match) =>
    summarizeLrclibCandidate(match, PREVIEW_LINE_LIMIT),
  );
  return {
    provider: LRCLIB_PROVIDER,
    status: 'ok',
    candidates,
    groups: {
      best: candidates.filter((candidate) => candidate.matchBand !== 'related'),
      related: candidates.filter(
        (candidate) => candidate.matchBand === 'related',
      ),
    },
    invalidRecordCount,
    ...(includeTimelineEvidence
      ? {
          timelineEvidenceById: Object.fromEntries(
            matches.map((match) => [
              match.record.id,
              buildLyricsTimelineEvidence(match.previewLines),
            ]),
          ),
        }
      : {}),
  };
}

async function runSyncedLookup(track, options) {
  const plan = buildLrclibQueryPlan(track, options.query);
  if (!plan.structured) return unavailable('missing-track-title');
  const client = clientForOptions(options);
  const requestOptions = {
    signal: AbortSignal.any([
      options.budget.signal,
      ...[options.signal].filter(Boolean),
    ]),
    budget: options.budget,
    priority: 'background',
  };

  if (plan.exact) {
    const exact = await client.getExact(plan.exact, requestOptions);
    if (exact.status === 'ok') {
      const [match] = rankLrclibCandidateMatches(plan.identity, [exact.record]);
      if (match && isCurrentAutoSaveCompatible(match)) {
        return buildAvailableResult(match);
      }
    } else if (!canContinueAfterExact(exact)) {
      return providerFailure(exact);
    }
  }

  const records = [];
  for (const query of plan.structuredQueries || [plan.structured]) {
    const page = await client.search(query, requestOptions);
    if (page.status === 'error') return providerFailure(page);
    records.push(...page.records);
    const best = rankLrclibCandidateMatches(plan.identity, records).find(
      isCurrentAutoSaveCompatible,
    );
    if (best) return buildAvailableResult(best);
  }
  const best = rankLrclibCandidateMatches(plan.identity, records).find(
    isCurrentAutoSaveCompatible,
  );
  return best
    ? buildAvailableResult(best)
    : unavailable('no-safe-synced-match');
}

async function findLrclibSyncedLyrics(track, options = {}) {
  const budget =
    options.budget ||
    createLyricsRequestBudget('lrclib', { ...options, automatic: true });
  try {
    return await runSyncedLookup(track, { ...options, budget });
  } finally {
    if (!options.budget) budget.dispose();
  }
}

async function runCandidateSearch(track, options) {
  const plan = buildLrclibQueryPlan(track, options.query);
  if (!plan.structured) {
    return unavailable('missing-track-title', { candidates: [], groups: null });
  }
  const client = clientForOptions(options);
  const requestOptions = {
    signal: AbortSignal.any([
      options.budget.signal,
      ...[options.signal].filter(Boolean),
    ]),
    budget: options.budget,
    allowRetry: options.allowRetry,
    ...(options.automatic ? { priority: 'background' } : {}),
  };

  const records = [];
  let invalidRecordCount = 0;
  function finish(failure) {
    // A superseded request cannot publish earlier successful records or refill cache.
    if (options.signal?.aborted) {
      return providerFailure(
        { reason: 'cancelled' },
        { candidates: [], groups: null },
      );
    }
    const result = buildCandidateResult(
      plan.identity,
      records,
      invalidRecordCount,
      options.includeTimelineEvidence,
    );
    if (!failure) return result;
    if (result.candidates.length === 0) {
      return providerFailure(failure, { candidates: [], groups: null });
    }
    return {
      ...result,
      partial: true,
      reason: failure.reason,
      ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {}),
      ...(failure.requestSource
        ? { requestSource: failure.requestSource }
        : {}),
    };
  }
  if (options.signal?.aborted) return finish();
  if (options.automatic && plan.exact) {
    const exact = await client.getExact(plan.exact, requestOptions);
    if (exact.status === 'ok') {
      records.push(exact.record);
      return finish();
    }
    if (exact.reason !== 'not-found') return finish(exact);
  }

  const broaden = options.mode === 'broaden';
  const queries = options.automatic
    ? [plan.structured]
    : broaden
      ? [
          ...plan.structuredQueries.slice(0, 3),
          ...plan.recoveryQueries.slice(0, 1),
        ]
      : plan.structuredQueries.slice(0, 2);
  for (const query of queries) {
    if (options.budget.signal.aborted)
      return finish(requestFailure(options.budget.signal.reason));
    const structured = await client.search(query, requestOptions);
    if (structured.status === 'error') {
      return finish(structured);
    }
    if (options.signal?.aborted) return finish();
    records.push(...structured.records);
    invalidRecordCount += structured.invalidRecordCount || 0;
    if (
      !broaden &&
      finish().groups?.best.filter(
        (candidate) =>
          candidate.compatibility?.t1 || candidate.compatibility?.t2,
      ).length >= 3
    )
      return finish();
  }
  return finish();
}

async function searchLrclibCandidates(track, options = {}) {
  const budget = options.budget || createLyricsRequestBudget('lrclib', options);
  try {
    return await runCandidateSearch(track, { ...options, budget });
  } finally {
    if (!options.budget) budget.dispose();
  }
}

async function fetchLrclibRecord(recordId, options = {}) {
  return clientForOptions(options).getById(recordId);
}

module.exports = {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
};
