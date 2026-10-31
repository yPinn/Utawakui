'use strict';

const { buildLrclibQueryPlan } = require('../lrclib/query.js');
const {
  fingerprintNeteaseRecord,
  rankNeteaseCandidates,
  rankNeteaseMetadata,
  summarizeNeteaseCandidate,
} = require('./candidate.js');
const { createNeteaseClient } = require('./client.js');
const { saveNeteaseRecord } = require('./storage.js');
const { parseLrcLines } = require('../lrclib/lrc.js');
const {
  createLyricsRequestBudget,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const {
  buildLyricsTimelineEvidence,
} = require('../lyricsProviders/timelineComparison.js');

const SHA256_RE = /^[a-f0-9]{64}$/u;
const TARGET_USABLE_CANDIDATES = 3;
const MAX_CACHED_IDENTITIES = 32;

function identityCacheKey(identity) {
  return JSON.stringify([
    identity.trackName,
    identity.artistName,
    identity.albumName,
    identity.duration,
  ]);
}

function broadenedTitle(value) {
  const title = String(value || '').trim();
  return (
    title.replace(
      /^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu,
      '',
    ) || title
  );
}

function searchQueries(plan, mode, retainCached) {
  const { identity } = plan;
  const queries = [];
  if (mode !== 'broaden' || !retainCached) {
    queries.push(
      ...plan.structuredQueries.slice(0, mode === 'broaden' ? 3 : 2),
    );
  }
  if (mode === 'broaden') {
    queries.push({ trackName: broadenedTitle(identity.trackName) });
  }
  return queries.filter(
    (query, index) =>
      queries.findIndex(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(query),
      ) === index,
  );
}

function providerFailure(result, extra = {}) {
  return {
    provider: 'netease',
    status: result.status === 'unavailable' ? 'unavailable' : 'error',
    reason: result.reason,
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    ...extra,
  };
}

function buildCandidateResult(
  track,
  records,
  invalidRecordCount,
  includeTimelineEvidence = false,
) {
  const matches = rankNeteaseCandidates(track, records);
  const candidates = matches.map((match) => ({
    ...summarizeNeteaseCandidate(match),
    saveState: 'unsaved',
    alreadySaved: false,
  }));
  return {
    provider: 'netease',
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
              buildLyricsTimelineEvidence(
                match.analysis.document?.lines ??
                  parseLrcLines(match.record.lrcLyrics),
              ),
            ]),
          ),
        }
      : {}),
  };
}

function createNeteaseAcquisitionProvider(options = {}) {
  const client = options.client || createNeteaseClient();
  const persistRecord = options.persistRecord || saveNeteaseRecord;
  const cachedRecordsByIdentity = new Map();

  function recordsForSearch(identityKey, retainCached) {
    let records = retainCached
      ? cachedRecordsByIdentity.get(identityKey)
      : null;
    if (!records) records = new Map();
    cachedRecordsByIdentity.delete(identityKey);
    cachedRecordsByIdentity.set(identityKey, records);
    while (cachedRecordsByIdentity.size > MAX_CACHED_IDENTITIES) {
      cachedRecordsByIdentity.delete(
        cachedRecordsByIdentity.keys().next().value,
      );
    }
    return records;
  }

  async function runSearch(track, searchOptions) {
    const plan = buildLrclibQueryPlan(track, searchOptions.query);
    if (!plan.identity.trackName) {
      return providerFailure(
        { status: 'unavailable', reason: 'missing-track-title' },
        { candidates: [], groups: null },
      );
    }
    const identityKey = identityCacheKey(plan.identity);
    const retainCached =
      searchOptions.mode === 'broaden' &&
      cachedRecordsByIdentity.has(identityKey);
    const cachedRecords = recordsForSearch(identityKey, retainCached);
    const targetCandidateCount = Math.min(
      20,
      TARGET_USABLE_CANDIDATES +
        (retainCached
          ? rankNeteaseCandidates(plan.identity, [...cachedRecords.values()])
              .length
          : 0),
    );

    const requestOptions = {
      signal: AbortSignal.any([
        searchOptions.budget.signal,
        ...[searchOptions.signal].filter(Boolean),
      ]),
      budget: searchOptions.budget,
      ...(searchOptions.automatic ? { priority: 'background' } : {}),
    };
    const seenMetadata = new Set();
    let hydrationAttempts = 0;
    const maxHydrations = searchOptions.mode === 'broaden' ? 7 : 5;
    let invalidRecordCount = 0;
    let firstFailure = null;
    for (const query of searchQueries(plan, searchOptions.mode, retainCached)) {
      if (requestOptions.signal.aborted) {
        firstFailure = requestFailure(requestOptions.signal.reason);
        break;
      }
      const search = await client.search(query, requestOptions);
      if (search.status !== 'ok') {
        if (search.status === 'error') firstFailure = search;
        break;
      }
      if (searchOptions.signal?.aborted) break;
      invalidRecordCount += Number.isSafeInteger(search.invalidRecordCount)
        ? search.invalidRecordCount
        : 0;
      const rankedMetadata = rankNeteaseMetadata(plan.identity, search.records);
      for (const { record: metadata } of rankedMetadata) {
        if (cachedRecords.has(metadata.id) || seenMetadata.has(metadata.id))
          continue;
        if (
          rankNeteaseCandidates(plan.identity, [...cachedRecords.values()])
            .length >= targetCandidateCount
        )
          break;
        if (hydrationAttempts >= maxHydrations) {
          firstFailure = {
            status: 'error',
            reason: 'request-budget-exhausted',
          };
          break;
        }
        if (requestOptions.signal.aborted) {
          firstFailure = requestFailure(requestOptions.signal.reason);
          break;
        }
        seenMetadata.add(metadata.id);
        hydrationAttempts += 1;
        const lyrics = await client.getLyrics(metadata.id, requestOptions);
        if (searchOptions.signal?.aborted) break;
        if (lyrics.status !== 'ok') {
          invalidRecordCount += 1;
          if (lyrics.status === 'error') {
            firstFailure = lyrics;
            break;
          }
          continue;
        }
        const record = { ...metadata, ...lyrics.record };
        cachedRecords.set(record.id, record);
      }
      const current = buildCandidateResult(
        plan.identity,
        [...cachedRecords.values()],
        invalidRecordCount,
      );
      if (firstFailure || searchOptions.signal?.aborted) break;
      if (
        searchOptions.mode !== 'broaden' &&
        current.groups.best.length >=
          (searchOptions.automatic ? 1 : TARGET_USABLE_CANDIDATES)
      )
        break;
    }
    if (searchOptions.signal?.aborted)
      return providerFailure(
        { status: 'error', reason: 'cancelled' },
        { candidates: [], groups: null },
      );
    const records = [...cachedRecords.values()];
    const result = buildCandidateResult(
      plan.identity,
      records,
      invalidRecordCount,
      searchOptions.includeTimelineEvidence,
    );
    if (result.candidates.length === 0 && firstFailure) {
      return providerFailure(firstFailure, { candidates: [], groups: null });
    }
    if (firstFailure && result.candidates.length > 0)
      return { ...result, partial: true, reason: firstFailure.reason };
    return result;
  }

  async function searchCandidates(track, options = {}) {
    const budget =
      options.budget || createLyricsRequestBudget('netease', options);
    try {
      return await runSearch(track, { ...options, budget });
    } finally {
      if (!options.budget) budget.dispose();
    }
  }

  async function saveCandidate({
    track,
    trackDir,
    candidateId,
    expectedFingerprint,
    query,
    validateCommit,
    budget,
    signal,
    automatic,
  }) {
    if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
      throw new Error('netease candidate id is invalid');
    }
    if (!SHA256_RE.test(expectedFingerprint)) {
      throw new Error('netease preview fingerprint is invalid');
    }
    const plan = buildLrclibQueryPlan(track, query);
    const identityKey = identityCacheKey(plan.identity);
    const cachedRecords = cachedRecordsByIdentity.get(identityKey);
    const metadata = cachedRecords?.get(candidateId);
    if (!metadata) {
      return {
        provider: 'netease',
        status: 'unavailable',
        reason: 'stale-search',
      };
    }
    const fetched = await client.getLyrics(candidateId, {
      fresh: true,
      budget,
      signal,
      ...(automatic ? { priority: 'background' } : {}),
    });
    if (fetched.status !== 'ok') return providerFailure(fetched);
    const record = { ...metadata, ...fetched.record };
    const currentFingerprint = fingerprintNeteaseRecord(record);
    if (currentFingerprint !== expectedFingerprint) {
      const [match] = rankNeteaseCandidates(plan.identity, [record]);
      if (!match) {
        return {
          provider: 'netease',
          status: 'unavailable',
          reason: 'record-mismatch',
        };
      }
      // Detach older hydration writers while retaining other candidate metadata
      // and the changed preview for an explicit confirm/save or broaden search.
      for (const [key, records] of cachedRecordsByIdentity) {
        if (key === identityKey || !records.has(candidateId)) continue;
        const updated = new Map(records);
        updated.set(candidateId, {
          ...records.get(candidateId),
          ...fetched.record,
        });
        cachedRecordsByIdentity.set(key, updated);
      }
      const refreshedRecords = new Map([
        ...cachedRecords,
        ...(cachedRecordsByIdentity.get(identityKey) || []),
        [candidateId, record],
      ]);
      const currentRecords = recordsForSearch(identityKey, false);
      for (const [id, current] of refreshedRecords)
        currentRecords.set(id, current);
      return {
        provider: 'netease',
        status: 'record-changed',
        candidate: summarizeNeteaseCandidate(match),
      };
    }
    const commitDenial =
      typeof validateCommit === 'function' ? validateCommit() : null;
    if (commitDenial) {
      return {
        provider: 'netease',
        status: 'unavailable',
        reason: commitDenial,
      };
    }
    const result = persistRecord(trackDir, record);
    return { provider: 'netease', ...result };
  }

  return { saveCandidate, searchCandidates };
}

module.exports = { createNeteaseAcquisitionProvider };
