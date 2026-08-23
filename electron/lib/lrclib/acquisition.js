'use strict';

const { normalizeForCompare } = require('../musicTitle.js');
const { createLrclibClient } = require('./client.js');
const { parseLrcLines } = require('./lrc.js');
const {
  durationDelta,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  signedDurationDelta,
} = require('./matching.js');
const { buildLrclibSearchQueries } = require('./query.js');
const { createLrclibRequestScheduler } = require('./scheduler.js');

const LRCLIB_PROVIDER = 'lrclib';
const MAX_MANUAL_CANDIDATES = 20;
const PREVIEW_LINE_LIMIT = 5;

function clientForOptions(options) {
  if (options.client) return options.client;
  const clientOptions = {
    baseUrl: options.baseUrl,
  };
  if (Object.prototype.hasOwnProperty.call(options, 'fetch')) {
    clientOptions.fetch = options.fetch;
    clientOptions.scheduler =
      options.scheduler || createLrclibRequestScheduler({ intervalMs: 0 });
  } else if (options.scheduler) {
    clientOptions.scheduler = options.scheduler;
  }
  return createLrclibClient(clientOptions);
}

async function fetchLrclibQueryCandidates(query, client) {
  const result = await client.search({
    trackName: query.params.track_name,
    artistName: query.params.artist_name,
  });
  if (result.status === 'error') return result;
  return { status: 'ok', candidates: result.records };
}

function mergeLrclibCandidatesByKey(map, candidates) {
  candidates.forEach((candidate, index) => {
    const key =
      candidate?.id ??
      `${normalizeForCompare(candidate?.trackName)}|${normalizeForCompare(
        candidate?.artistName,
      )}|${candidate?.duration ?? ''}|${index}`;
    if (!map.has(key)) map.set(key, candidate);
  });
}

function buildAvailableResult(best) {
  const label = best.candidate.albumName || best.candidate.artistName;
  return {
    provider: LRCLIB_PROVIDER,
    status: 'available',
    source: {
      filename: `lrclib-${best.candidate.id}.lrc`,
      language: 'und',
      kind: LRCLIB_PROVIDER,
      ...(label ? { label } : {}),
    },
    text: best.candidate.syncedLyrics,
    lineCount: best.lineCount,
    match: {
      confidence: best.confidence,
      score: best.score,
      durationDelta: best.durationDelta,
      querySource: best.query?.source,
    },
    record: best.candidate,
  };
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

async function findLrclibSyncedLyrics(track, options = {}) {
  const queries = buildLrclibSearchQueries(track);
  if (queries.length === 0) {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'missing-track-title',
    };
  }

  const client = clientForOptions(options);
  const candidatesByKey = new Map();
  for (const query of queries) {
    const page = await fetchLrclibQueryCandidates(query, client);
    if (page.status === 'error') return providerFailure(page);
    mergeLrclibCandidatesByKey(candidatesByKey, page.candidates);

    const bestSoFar = pickBestSyncedCandidate(
      track,
      [...candidatesByKey.values()],
      queries,
    );
    if (bestSoFar) return buildAvailableResult(bestSoFar);
  }

  const best = pickBestSyncedCandidate(
    track,
    [...candidatesByKey.values()],
    queries,
  );
  if (!best) {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'no-safe-synced-match',
    };
  }
  return buildAvailableResult(best);
}

function toCandidateSummary(scored) {
  const candidate = scored.candidate;
  return {
    id: candidate.id,
    trackName: candidate.trackName,
    artistName: candidate.artistName,
    albumName: candidate.albumName,
    duration: candidate.duration,
    lineCount: scored.lineCount,
    previewLines: parseLrcLines(candidate.syncedLyrics).slice(
      0,
      PREVIEW_LINE_LIMIT,
    ),
    confidence: scored.confidence,
    score: scored.score,
    durationDelta: scored.durationDelta,
    durationDeltaSigned: scored.durationDeltaSigned,
    titleScore: scored.titleScore,
    artistScore: scored.artistScore,
    querySource: scored.query?.source ?? null,
  };
}

async function searchLrclibCandidates(track, options = {}) {
  const queries = buildLrclibSearchQueries(track);
  if (queries.length === 0) {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'missing-track-title',
      candidates: [],
    };
  }

  const client = clientForOptions(options);
  const pages = await Promise.all(
    queries.map((query) => fetchLrclibQueryCandidates(query, client)),
  );
  const firstError = pages.find((page) => page.status === 'error');
  if (firstError) return providerFailure(firstError, { candidates: [] });

  const candidatesByKey = new Map();
  pages.forEach((page) =>
    mergeLrclibCandidatesByKey(candidatesByKey, page.candidates),
  );
  const pool = [...candidatesByKey.values()].filter(
    (candidate) =>
      !candidate.instrumental &&
      typeof candidate.syncedLyrics === 'string' &&
      candidate.syncedLyrics.trim().length > 0,
  );
  const ranked = rankSyncedCandidates(track, pool, queries);
  const seenKeys = new Set();
  const scoredCandidateRefs = new Set();
  const deduped = [];
  for (const scored of ranked) {
    scoredCandidateRefs.add(scored.candidate);
    const dedupeKey = scored.candidate.id ?? scored.candidate;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    deduped.push(scored);
  }

  const unscored = pool
    .filter((candidate) => !scoredCandidateRefs.has(candidate))
    .map((candidate) => ({
      candidate,
      confidence: 'unscored',
      score: null,
      lineCount: parseLrcLines(candidate.syncedLyrics).length,
      durationDelta: durationDelta(track?.duration, candidate.duration),
      durationDeltaSigned: signedDurationDelta(
        track?.duration,
        candidate.duration,
      ),
      titleScore: null,
      artistScore: null,
      query: null,
    }));

  const candidates = [...deduped, ...unscored]
    .slice(0, MAX_MANUAL_CANDIDATES)
    .map(toCandidateSummary);
  return { provider: LRCLIB_PROVIDER, status: 'ok', candidates };
}

async function fetchLrclibRecord(recordId, options = {}) {
  return clientForOptions(options).getById(recordId);
}

module.exports = {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
};
