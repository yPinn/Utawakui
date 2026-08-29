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

const SHA256_RE = /^[a-f0-9]{64}$/u;
const TARGET_USABLE_CANDIDATES = 3;
const MAX_HYDRATION_BATCH_SIZE = 3;

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

function searchQueries(identity, mode, retainCached) {
  const queries = [];
  if (mode !== 'broaden' || !retainCached) {
    queries.push({
      trackName: identity.trackName,
      ...(identity.artistName ? { artistName: identity.artistName } : {}),
    });
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

function buildCandidateResult(track, records, invalidRecordCount) {
  const candidates = rankNeteaseCandidates(track, records).map((match) => ({
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
  };
}

function createNeteaseAcquisitionProvider(options = {}) {
  const client = options.client || createNeteaseClient();
  const persistRecord = options.persistRecord || saveNeteaseRecord;
  const cachedRecords = new Map();
  let cachedIdentityKey = null;

  async function searchCandidates(track, searchOptions = {}) {
    const plan = buildLrclibQueryPlan(track, searchOptions.query);
    if (!plan.identity.trackName) {
      return providerFailure(
        { status: 'unavailable', reason: 'missing-track-title' },
        { candidates: [], groups: null },
      );
    }
    const identityKey = identityCacheKey(plan.identity);
    const retainCached =
      searchOptions.mode === 'broaden' && cachedIdentityKey === identityKey;
    if (!retainCached) cachedRecords.clear();
    cachedIdentityKey = identityKey;

    const metadataById = new Map();
    let invalidRecordCount = 0;
    let firstFailure = null;
    for (const query of searchQueries(
      plan.identity,
      searchOptions.mode,
      retainCached,
    )) {
      const search = searchOptions.signal
        ? await client.search(query, { signal: searchOptions.signal })
        : await client.search(query);
      if (search.status !== 'ok') {
        firstFailure ||= search;
        continue;
      }
      invalidRecordCount += Number.isSafeInteger(search.invalidRecordCount)
        ? search.invalidRecordCount
        : 0;
      for (const metadata of search.records) {
        if (!cachedRecords.has(metadata.id))
          metadataById.set(metadata.id, metadata);
      }
    }
    const rankedMetadata = rankNeteaseMetadata(plan.identity, [
      ...metadataById.values(),
    ]);
    let usableCandidateCount = rankNeteaseCandidates(plan.identity, [
      ...cachedRecords.values(),
    ]).length;
    let nextMetadataIndex = 0;
    while (
      usableCandidateCount < TARGET_USABLE_CANDIDATES &&
      nextMetadataIndex < rankedMetadata.length
    ) {
      const batchSize = Math.min(
        MAX_HYDRATION_BATCH_SIZE,
        TARGET_USABLE_CANDIDATES - usableCandidateCount,
        rankedMetadata.length - nextMetadataIndex,
      );
      const batch = rankedMetadata.slice(
        nextMetadataIndex,
        nextMetadataIndex + batchSize,
      );
      nextMetadataIndex += batch.length;
      const hydrated = await Promise.all(
        batch.map(async ({ record: metadata }) => ({
          metadata,
          lyrics: searchOptions.signal
            ? await client.getLyrics(metadata.id, {
                signal: searchOptions.signal,
              })
            : await client.getLyrics(metadata.id),
        })),
      );
      for (const { metadata, lyrics } of hydrated) {
        if (lyrics.status !== 'ok') {
          firstFailure ||= lyrics;
          invalidRecordCount += 1;
          continue;
        }
        const record = { ...metadata, ...lyrics.record };
        cachedRecords.set(record.id, record);
      }
      usableCandidateCount = rankNeteaseCandidates(plan.identity, [
        ...cachedRecords.values(),
      ]).length;
    }
    const records = [...cachedRecords.values()];
    if (records.length === 0 && firstFailure) {
      return providerFailure(firstFailure, { candidates: [], groups: null });
    }
    return buildCandidateResult(plan.identity, records, invalidRecordCount);
  }

  async function saveCandidate({
    track,
    trackDir,
    candidateId,
    expectedFingerprint,
    query,
  }) {
    if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
      throw new Error('netease candidate id is invalid');
    }
    if (!SHA256_RE.test(expectedFingerprint)) {
      throw new Error('netease preview fingerprint is invalid');
    }
    const metadata = cachedRecords.get(candidateId);
    if (!metadata) {
      return {
        provider: 'netease',
        status: 'unavailable',
        reason: 'stale-search',
      };
    }
    const fetched = await client.getLyrics(candidateId);
    if (fetched.status !== 'ok') return providerFailure(fetched);
    const record = { ...metadata, ...fetched.record };
    const currentFingerprint = fingerprintNeteaseRecord(record);
    if (currentFingerprint !== expectedFingerprint) {
      const plan = buildLrclibQueryPlan(track, query);
      const [match] = rankNeteaseCandidates(plan.identity, [record]);
      if (!match) {
        return {
          provider: 'netease',
          status: 'unavailable',
          reason: 'record-mismatch',
        };
      }
      return {
        provider: 'netease',
        status: 'record-changed',
        candidate: summarizeNeteaseCandidate(match),
      };
    }
    const result = persistRecord(trackDir, record);
    return { provider: 'netease', ...result };
  }

  return { saveCandidate, searchCandidates };
}

module.exports = { createNeteaseAcquisitionProvider };
