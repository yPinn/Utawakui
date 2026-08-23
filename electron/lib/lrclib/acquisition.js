'use strict';

const { rankLrclibCandidateMatches } = require('./candidate.js');
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
    typeof match.record.syncedLyrics === 'string' &&
    match.record.syncedLyrics.trim().length > 0
  );
}

function candidateSummary(match) {
  const record = match.record;
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName,
    duration: record.duration,
    instrumental: record.instrumental,
    lineCount: match.lineCount,
    segmentCount: match.segmentCount,
    previewLines: match.previewLines.slice(0, PREVIEW_LINE_LIMIT),
    capability: match.capability,
    compatibility: match.compatibility,
    warnings: match.warnings,
    matchBand: match.band,
    matchReasons: match.matchReasons,
    durationDelta: match.durationDelta,
    durationDeltaSigned: match.durationDeltaSigned,
  };
}

function buildCandidateResult(identity, records, invalidRecordCount = 0) {
  const matches = rankLrclibCandidateMatches(identity, records).slice(
    0,
    MAX_MANUAL_CANDIDATES,
  );
  const candidates = matches.map(candidateSummary);
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

  const page = await client.search(plan.structured);
  if (page.status === 'error') return providerFailure(page);
  const best = rankLrclibCandidateMatches(plan.identity, page.records).find(
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

  if (options.mode === 'broaden') {
    if (!plan.broaden) {
      return unavailable('missing-track-title', {
        candidates: [],
        groups: null,
      });
    }
    const broadened = await client.searchBroad(plan.broaden);
    if (broadened.status === 'error') {
      return providerFailure(broadened, { candidates: [], groups: null });
    }
    return buildCandidateResult(
      plan.identity,
      broadened.records,
      broadened.invalidRecordCount,
    );
  }

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

  const structured = await client.search(plan.structured);
  if (structured.status === 'error') {
    return providerFailure(structured, { candidates: [], groups: null });
  }
  records.push(...structured.records);
  invalidRecordCount += structured.invalidRecordCount;
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
