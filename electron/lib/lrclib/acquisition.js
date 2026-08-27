'use strict';

const {
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
} = require('./candidate.js');
const { createLrclibClient } = require('./client.js');
const { buildLrclibQueryPlan } = require('./query.js');
const { createLrclibRequestScheduler } = require('./scheduler.js');

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

function buildCandidateResult(identity, records, invalidRecordCount = 0) {
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
  };
}

async function findLrclibSyncedLyrics(track, options = {}) {
  const plan = buildLrclibQueryPlan(track, options.query);
  if (!plan.structured) return unavailable('missing-track-title');
  const client = clientForOptions(options);

  if (plan.exact) {
    const exact = await client.getExact(plan.exact);
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
    const page = await client.search(query);
    if (page.status === 'error') return providerFailure(page);
    records.push(...page.records);
  }
  const best = rankLrclibCandidateMatches(plan.identity, records).find(
    isCurrentAutoSaveCompatible,
  );
  return best
    ? buildAvailableResult(best)
    : unavailable('no-safe-synced-match');
}

async function searchLrclibCandidates(track, options = {}) {
  const plan = buildLrclibQueryPlan(track, options.query);
  if (!plan.structured) {
    return unavailable('missing-track-title', { candidates: [], groups: null });
  }
  const client = clientForOptions(options);

  const records = [];
  let invalidRecordCount = 0;
  if (plan.exact) {
    const exact = await client.getExact(plan.exact);
    if (exact.status === 'ok') records.push(exact.record);
    else if (exact.reason === 'invalid-record') invalidRecordCount += 1;
    else if (!canContinueAfterExact(exact)) {
      return providerFailure(exact, { candidates: [], groups: null });
    }
  }

  for (const query of plan.structuredQueries || [plan.structured]) {
    const structured = await client.search(query);
    if (structured.status === 'error') {
      return providerFailure(structured, { candidates: [], groups: null });
    }
    records.push(...structured.records);
    invalidRecordCount += structured.invalidRecordCount;
  }

  const constrained = buildCandidateResult(
    plan.identity,
    records,
    invalidRecordCount,
  );
  if (constrained.groups.best.length === 0) {
    for (const query of plan.recoveryQueries || []) {
      const recovered = await client.search(query);
      if (recovered.status === 'error') {
        return providerFailure(recovered, { candidates: [], groups: null });
      }
      records.push(...recovered.records);
      invalidRecordCount += recovered.invalidRecordCount;
    }
  }
  return buildCandidateResult(plan.identity, records, invalidRecordCount);
}

async function fetchLrclibRecord(recordId, options = {}) {
  return clientForOptions(options).getById(recordId);
}

module.exports = {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
};
