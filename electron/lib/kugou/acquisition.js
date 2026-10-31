'use strict';

const { createHash } = require('node:crypto');
const { buildLrclibQueryPlan } = require('../lrclib/query.js');
const { parseLrcLines } = require('../lrclib/lrc.js');
const {
  buildLyricsTimelineEvidence,
} = require('../lyricsProviders/timelineComparison.js');
const {
  createLyricsRequestBudget,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const {
  buildKugouLineQueryPlan,
  evaluateKugouLineIdentity,
  evaluateKugouLineLyricsIdentity,
} = require('./identity.js');
const { classifyKugouLrc } = require('./lrc.js');
const { createKugouClient } = require('./client.js');
const { saveKugouRecord } = require('./storage.js');
const { fingerprintKugouRecord } = require('./record.js');
const { lyricsIdentityKey } = require('../lyricsProviders/identityResolver.js');
function candidateId(hash, id) {
  return (
    Number.parseInt(
      createHash('sha256')
        .update(JSON.stringify([hash, id]))
        .digest('hex')
        .slice(0, 12),
      16,
    ) + 1
  );
}
function inputFor(track, query, aliasEvidence) {
  const { identity } = buildLrclibQueryPlan(track, query);
  return {
    reference: {
      title: identity.trackName,
      artist: identity.artistName,
      durationSeconds: identity.duration,
      version: 'studio',
    },
    ...(aliasEvidence?.identityKey === lyricsIdentityKey(identity) &&
    aliasEvidence?.evidence?.length
      ? { aliases: aliasEvidence.aliases, aliasEvidence }
      : {}),
  };
}
function identityKey(input) {
  return JSON.stringify(input.reference);
}
function sameContent(first, second) {
  return (
    first.trackName === second.trackName &&
    first.artistName === second.artistName &&
    first.duration === second.duration &&
    first.lrcLyrics === second.lrcLyrics
  );
}
function failed(result, extra = {}) {
  return {
    provider: 'kugou',
    status: result.status === 'unavailable' ? 'unavailable' : 'error',
    reason: result.reason,
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    ...(result.requestSource ? { requestSource: result.requestSource } : {}),
    ...extra,
  };
}
function summary(record) {
  const lines = parseLrcLines(record.lrcLyrics);
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: null,
    duration: record.duration,
    lineCount: lines.length,
    segmentCount: 0,
    previewLines: lines
      .slice(0, 5)
      .map(({ start, text }) => ({ start, text: text.slice(0, 500) })),
    capability: { level: 'T1', partial: false },
    compatibility: { t0: true, t1: true, t2: false },
    warnings: [],
    matchBand: record.matchBand,
    matchReasons: [],
    matchEvidence: {
      titleScore: 1,
      artistScore: 1,
      durationDelta: record.durationDelta,
    },
    durationDelta: record.durationDelta,
    durationDeltaSigned: record.durationDeltaSigned,
    previewFingerprint: fingerprintKugouRecord(record),
    saveState: 'unsaved',
    alreadySaved: false,
  };
}
function createKugouAcquisitionProvider(options = {}) {
  const now = options.now || Date.now;
  const client = options.client || createKugouClient();
  const persistRecord = options.persistRecord || saveKugouRecord;
  const identities = new Map();
  let revision = 0;
  function retain(key, value) {
    identities.delete(key);
    identities.set(key, value);
    const totalBytes = () =>
      [...identities.values()].reduce(
        (sum, state) =>
          sum +
          [...state.records.values()].reduce(
            (count, entry) => count + Buffer.byteLength(entry.record.lrcLyrics),
            0,
          ),
        0,
      );
    while (identities.size > 32 || totalBytes() > 8 * 1024 * 1024)
      identities.delete(identities.keys().next().value);
  }
  function result(records, invalidRecordCount, includeTimelineEvidence) {
    const values = [...records.values()];
    const candidates = values.map(({ record }) => summary(record));
    return {
      provider: 'kugou',
      status: 'ok',
      candidates,
      groups: { best: candidates, related: [] },
      invalidRecordCount,
      ...(includeTimelineEvidence
        ? {
            timelineEvidenceById: Object.fromEntries(
              values.map(({ record }) => [
                record.id,
                buildLyricsTimelineEvidence(parseLrcLines(record.lrcLyrics)),
              ]),
            ),
          }
        : {}),
    };
  }
  async function hydrate(input, song, lyric, requestOptions) {
    const downloaded = await client.download(lyric, requestOptions);
    if (downloaded.status !== 'ok') return downloaded;
    const assessment = classifyKugouLrc(downloaded.text, song.durationSeconds);
    if (
      assessment.status !== 'ok' ||
      assessment.offsetMs !== 0 ||
      !evaluateKugouLineLyricsIdentity(input, assessment.tags, song)
    )
      return { status: 'unavailable', reason: 'record-mismatch' };
    // Do not persist provider identifiers from descriptive export headers.
    const lrcLyrics = downloaded.text
      .split(/\r?\n/u)
      .filter((row) => !/^\s*\[(?:hash|sign|qq|total):/iu.test(row))
      .join('\n');
    const evidence = evaluateKugouLineIdentity(input, song);
    return {
      status: 'ok',
      record: {
        id: candidateId(song.hash, lyric.id),
        trackName: song.title,
        artistName: song.artist,
        duration: song.durationSeconds,
        lrcLyrics,
        matchBand: evidence.matchBand,
        durationDelta: evidence.durationDelta,
        durationDeltaSigned:
          song.durationSeconds - input.reference.durationSeconds,
        ...(input.aliasEvidence
          ? { identityEvidence: input.aliasEvidence }
          : {}),
      },
    };
  }
  async function searchCandidates(track, searchOptions = {}) {
    const input = inputFor(
      track,
      searchOptions.query,
      searchOptions.aliasEvidence,
    );
    let queries;
    try {
      queries = buildKugouLineQueryPlan(input);
    } catch {
      return failed(
        { status: 'unavailable', reason: 'missing-track-identity' },
        { candidates: [], groups: null },
      );
    }
    const budget =
      searchOptions.budget || createLyricsRequestBudget('kugou', searchOptions);
    const requestOptions = {
      budget,
      signal: AbortSignal.any([
        budget.signal,
        ...[searchOptions.signal].filter(Boolean),
      ]),
      ...(searchOptions.automatic ? { priority: 'background' } : {}),
    };
    const key = identityKey(input);
    const previous = identities.get(key);
    const startedRevision = revision;
    const records =
      searchOptions.mode === 'broaden'
        ? new Map(previous?.records || [])
        : new Map();
    const target = Math.min(20, records.size + 3);
    const seenSongs = new Set();
    let firstFailure = null;
    let invalidRecordCount = 0;
    try {
      for (const query of queries) {
        const previousCount = records.size;
        requestOptions.signal.throwIfAborted();
        const searched = await client.search(query, requestOptions);
        if (searched.status !== 'ok') {
          firstFailure = searched;
          break;
        }
        invalidRecordCount += searched.invalidRecordCount || 0;
        const songs = searched.records
          .filter((song) => evaluateKugouLineIdentity(input, song).accepted)
          .sort(
            (a, b) =>
              Math.abs(a.durationSeconds - input.reference.durationSeconds) -
              Math.abs(b.durationSeconds - input.reference.durationSeconds),
          );
        for (const song of songs) {
          if (seenSongs.has(song.hash)) continue;
          seenSongs.add(song.hash);
          const lyrics = await client.searchLyrics(song.hash, requestOptions);
          if (lyrics.status !== 'ok') {
            firstFailure = lyrics;
            break;
          }
          invalidRecordCount += lyrics.invalidRecordCount || 0;
          const matching = lyrics.records
            .filter(
              (lyric) =>
                Math.abs(lyric.duration / 1000 - song.durationSeconds) <= 4,
            )
            .sort(
              (a, b) =>
                Math.abs(a.duration / 1000 - song.durationSeconds) -
                Math.abs(b.duration / 1000 - song.durationSeconds),
            );
          for (const lyric of matching) {
            const id = candidateId(song.hash, lyric.id);
            if (records.has(id)) continue;
            const hydrated = await hydrate(input, song, lyric, requestOptions);
            if (hydrated.status === 'error') {
              firstFailure = hydrated;
              break;
            }
            if (hydrated.status !== 'ok') {
              invalidRecordCount += 1;
              continue;
            }
            if (
              [...records.values()].some(({ record }) =>
                sameContent(record, hydrated.record),
              )
            )
              continue;
            records.set(id, {
              record: hydrated.record,
              songHash: song.hash,
              lyricId: lyric.id,
              query,
              input: structuredClone(input),
            });
            if (records.size >= target) break;
          }
          if (firstFailure || records.size >= target) break;
        }
        // Query variations follow only a clean catalog miss; do not hammer a
        // provider after identity/format failures or once choices are available.
        if (
          firstFailure ||
          (songs.length > 0 &&
            (searchOptions.mode !== 'broaden' ||
              invalidRecordCount > 0 ||
              records.size > previousCount)) ||
          records.size >= target
        )
          break;
      }
    } catch (error) {
      firstFailure = requestFailure(error);
    } finally {
      if (!searchOptions.budget) budget.dispose();
    }
    if (firstFailure?.reason === 'cancelled')
      return failed(firstFailure, { candidates: [], groups: null });
    if (revision !== startedRevision) {
      for (const [id, entry] of identities.get(key)?.records || [])
        records.set(id, entry);
    }
    retain(key, { input, records });
    const output = result(
      records,
      invalidRecordCount,
      searchOptions.includeTimelineEvidence,
    );
    if (firstFailure && !records.size)
      return failed(firstFailure, {
        candidates: [],
        groups: null,
        invalidRecordCount,
      });
    return firstFailure
      ? { ...output, partial: true, reason: firstFailure.reason }
      : output;
  }
  async function saveCandidate({
    track,
    trackDir,
    candidateId: id,
    expectedFingerprint,
    query,
    validateCommit,
    budget: suppliedBudget,
    signal,
  }) {
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof expectedFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(expectedFingerprint)
    )
      throw new Error('invalid Kugou candidate selection');
    let input = inputFor(track, query);
    const key = identityKey(input);
    const cached = identities.get(key)?.records.get(id);
    if (!cached)
      return failed({ status: 'unavailable', reason: 'stale-search' });
    if (cached.input?.aliasEvidence?.expiresAt <= now())
      return failed({ status: 'unavailable', reason: 'stale-search' });
    input = cached.input || input;
    const budget =
      suppliedBudget ||
      createLyricsRequestBudget('kugou', { fresh: true, signal });
    const requestOptions = { fresh: true, budget, signal: budget.signal };
    let readyRecord;
    try {
      const searched = await client.search(cached.query, requestOptions);
      if (searched.status !== 'ok') return failed(searched);
      const song = searched.records.find(
        (value) =>
          value.hash === cached.songHash &&
          evaluateKugouLineIdentity(input, value).accepted,
      );
      if (!song)
        return failed({ status: 'unavailable', reason: 'record-mismatch' });
      const lyrics = await client.searchLyrics(song.hash, requestOptions);
      if (lyrics.status !== 'ok') return failed(lyrics);
      const lyric = lyrics.records.find(
        (value) =>
          value.id === cached.lyricId &&
          Math.abs(value.duration / 1000 - song.durationSeconds) <= 4,
      );
      if (!lyric)
        return failed({ status: 'unavailable', reason: 'record-mismatch' });
      const hydrated = await hydrate(input, song, lyric, requestOptions);
      if (hydrated.status !== 'ok') return failed(hydrated);
      const record = hydrated.record;
      if (fingerprintKugouRecord(record) !== expectedFingerprint) {
        revision += 1;
        // Replace maps so old searches cannot mutate this refreshed preview.
        for (const [identity, state] of identities) {
          if (!state.records.has(id)) continue;
          const records = new Map(state.records);
          records.set(id, { ...records.get(id), record });
          identities.set(identity, { ...state, records });
        }
        return {
          provider: 'kugou',
          status: 'record-changed',
          candidate: summary(record),
        };
      }
      budget.signal.throwIfAborted();
      const denial =
        typeof validateCommit === 'function' ? validateCommit() : null;
      if (denial) return failed({ status: 'unavailable', reason: denial });
      readyRecord = record;
    } catch (error) {
      return failed(requestFailure(error));
    } finally {
      if (!suppliedBudget) budget.dispose();
    }
    return { provider: 'kugou', ...persistRecord(trackDir, readyRecord) };
  }
  return {
    searchCandidates,
    saveCandidate,
    availability: () => client.availability?.() || { status: 'ok' },
  };
}
module.exports = { createKugouAcquisitionProvider, fingerprintKugouRecord };
