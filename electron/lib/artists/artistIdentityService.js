'use strict';

const crypto = require('node:crypto');
const { normalizeForCompare } = require('../musicIdentity/text');
const { createMusicBrainzClient } = require('../musicbrainz/client');
const { createArtistIndexCache } = require('./artistIndex');

const MAX_QUERY_FORMS = 3;
const MAX_CANDIDATES = 5;
const MAX_SEARCH_RECORDS = 24;
const MAX_CORROBORATION_TRACKS = 2;
const MAX_SESSIONS = 16;
const MAX_AUTO_ATTEMPTS = 64;
const DURATION_TOLERANCE_SECONDS = 5;

function defaultCandidateId() {
  return `candidate_${crypto.randomBytes(18).toString('base64url')}`;
}

function uniqueTexts(values, limit) {
  const result = [];
  const keys = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    const key = normalizeForCompare(text);
    if (!text || !key || keys.has(key)) continue;
    keys.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function candidateForms(record) {
  return uniqueTexts(
    [
      record.name,
      record.sortName,
      ...(record.aliases ?? []).map((alias) => alias.name),
    ],
    40,
  );
}

function exactFormMatch(record, queryForms) {
  const forms = new Set(candidateForms(record).map(normalizeForCompare));
  return queryForms.filter((form) => forms.has(normalizeForCompare(form)));
}

function durationMatches(trackDuration, recordingDuration) {
  if (!Number.isFinite(trackDuration) || !Number.isFinite(recordingDuration)) {
    return true;
  }
  return (
    Math.abs(trackDuration - recordingDuration) <= DURATION_TOLERANCE_SECONDS
  );
}

function catalogFromRecord(record, fetchedAt) {
  return {
    mbid: record.id,
    name: record.name,
    ...(record.sortName ? { sortName: record.sortName } : {}),
    ...(record.type ? { type: record.type } : {}),
    ...(record.disambiguation ? { disambiguation: record.disambiguation } : {}),
    aliases: (record.aliases ?? []).map((alias) => ({
      name: alias.name,
      ...(alias.sortName ? { sortName: alias.sortName } : {}),
      ...(alias.locale ? { locale: alias.locale } : {}),
      primary: alias.primary === true,
      ...(alias.type ? { type: alias.type } : {}),
    })),
    fetchedAt,
  };
}

function projectCandidate(candidate) {
  return {
    candidateId: candidate.candidateId,
    name: candidate.record.name,
    ...(candidate.record.sortName
      ? { sortName: candidate.record.sortName }
      : {}),
    ...(candidate.record.type ? { type: candidate.record.type } : {}),
    ...(candidate.record.disambiguation
      ? { disambiguation: candidate.record.disambiguation }
      : {}),
    aliases: uniqueTexts(
      (candidate.record.aliases ?? []).map((alias) => alias.name),
      12,
    ),
    evidence: candidate.evidence,
    canAutoLink: candidate.canAutoLink,
  };
}

function createArtistIdentityService(options = {}) {
  const artistIndexCache = options.artistIndexCache ?? createArtistIndexCache();
  const musicBrainzClient =
    options.musicBrainzClient ?? createMusicBrainzClient();
  const createCandidateId = options.createCandidateId ?? defaultCandidateId;
  const now = options.now ?? (() => new Date());
  const sessions = new Map();
  const searches = new Map();
  let activeReconciliation = null;

  async function corroborate(record, artist, tracksById, form, signal) {
    const tracks = artist.trackIds
      .map((trackId) => tracksById.get(trackId))
      .filter((track) => track?.title)
      .slice(0, MAX_CORROBORATION_TRACKS);
    for (const track of tracks) {
      const result = await musicBrainzClient.searchRecordings(
        { title: track.title, artist: form },
        { signal },
      );
      if (result.status !== 'ok') continue;
      const titleKey = normalizeForCompare(track.title);
      if (
        result.records.some(
          (recording) =>
            normalizeForCompare(recording.title) === titleKey &&
            durationMatches(track.duration, recording.duration) &&
            recording.artistCredits?.some((credit) => credit.id === record.id),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function rememberSession(artistId, session) {
    if (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
    sessions.set(artistId, session);
  }

  async function search(directory, tracks, artistId) {
    searches.get(artistId)?.abort();
    sessions.delete(artistId);
    const controller = new AbortController();
    searches.set(artistId, controller);
    try {
      const index = await artistIndexCache.getIndex(directory, tracks);
      const artist = index.artists.find((entry) => entry.id === artistId);
      if (!artist) {
        return {
          status: 'error',
          reason: 'artist-unavailable',
          candidates: [],
        };
      }
      const queryForms = uniqueTexts(
        [...(artist.credits ?? []).map((credit) => credit.name), artist.name],
        MAX_QUERY_FORMS,
      );
      const recordsById = new Map();
      let lastFailure = null;
      for (const form of queryForms) {
        const result = await musicBrainzClient.searchArtists(
          { artist: form },
          { signal: controller.signal },
        );
        if (result.status !== 'ok') {
          lastFailure = result.reason ?? 'provider-unavailable';
          continue;
        }
        for (const record of result.records) {
          const existing = recordsById.get(record.id);
          if (!existing && recordsById.size >= MAX_SEARCH_RECORDS) continue;
          const matchedForms = exactFormMatch(record, queryForms);
          recordsById.set(record.id, {
            record,
            matchedForms: uniqueTexts(
              [...(existing?.matchedForms ?? []), ...matchedForms],
              MAX_QUERY_FORMS,
            ),
          });
        }
      }
      if (recordsById.size === 0 && lastFailure) {
        return { status: 'unavailable', reason: lastFailure, candidates: [] };
      }

      const records = [...recordsById.values()];
      const exact = records.filter(
        (candidate) => candidate.matchedForms.length,
      );
      let corroboratedId = null;
      if (exact.length === 1) {
        const candidate = exact[0];
        const tracksById = new Map(tracks.map((track) => [track.id, track]));
        if (
          await corroborate(
            candidate.record,
            artist,
            tracksById,
            candidate.matchedForms[0],
            controller.signal,
          )
        ) {
          corroboratedId = candidate.record.id;
        }
      }

      const fetchedAt = now().toISOString();
      const candidates = records
        .sort(
          (left, right) =>
            Number(Boolean(right.matchedForms.length)) -
              Number(Boolean(left.matchedForms.length)) ||
            (right.record.score ?? 0) - (left.record.score ?? 0),
        )
        .slice(0, MAX_CANDIDATES)
        .map((candidate) => {
          const canAutoLink = candidate.record.id === corroboratedId;
          return {
            candidateId: createCandidateId(),
            record: candidate.record,
            catalog: catalogFromRecord(candidate.record, fetchedAt),
            evidence: canAutoLink
              ? 'exact-recording'
              : candidate.matchedForms.length
                ? 'exact'
                : 'weak',
            canAutoLink,
          };
        });
      if (controller.signal.aborted || searches.get(artistId) !== controller) {
        return { status: 'error', reason: 'cancelled', candidates: [] };
      }
      rememberSession(artistId, {
        directory,
        candidates: new Map(
          candidates.map((candidate) => [candidate.candidateId, candidate]),
        ),
      });
      return {
        status: 'ok',
        artistId,
        candidates: candidates.map(projectCandidate),
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { status: 'error', reason: 'cancelled', candidates: [] };
      }
      throw error;
    } finally {
      if (searches.get(artistId) === controller) searches.delete(artistId);
    }
  }

  async function apply(
    directory,
    tracks,
    artistId,
    candidateId,
    expectedRevision,
    options = {},
  ) {
    const session = sessions.get(artistId);
    const candidate = session?.candidates.get(candidateId);
    if (!session || session.directory !== directory || !candidate) {
      return { status: 'error', reason: 'candidate-unavailable' };
    }
    const result = await artistIndexCache.applyCatalog(
      directory,
      tracks,
      artistId,
      candidate.catalog,
      {
        expectedRevision,
        ...(options.automatic === true ? { automatic: true } : {}),
      },
    );
    if (result?.status === 'ok') sessions.delete(artistId);
    return result;
  }

  function cancel(artistId) {
    const controller = searches.get(artistId);
    controller?.abort();
    sessions.delete(artistId);
    return Boolean(controller);
  }

  function reconciliationKey(directory, tracks) {
    return `${directory}\u0000${tracks
      .map(
        (track) =>
          `${track.id}:${track.title}:${track.artist}:${track.duration}`,
      )
      .join('\u0000')}`;
  }

  function artistAttemptKey(artist) {
    const creditIds = (artist.credits ?? [])
      .map((credit) => credit.id)
      .filter(Boolean)
      .sort();
    return creditIds.length ? creditIds.join('|') : artist.id;
  }

  async function runReconciliation(initialJob) {
    let job = initialJob;
    let attempted = new Set();
    let attemptedCount = 0;
    let changedCount = 0;
    while (attemptedCount < MAX_AUTO_ATTEMPTS) {
      if (activeReconciliation?.pending) {
        job = activeReconciliation.pending;
        activeReconciliation.pending = null;
        activeReconciliation.key = job.key;
        attempted = new Set();
      }
      const index = await artistIndexCache.getIndex(job.directory, job.tracks);
      const artist = index.artists.find((entry) => {
        if (entry.identityResolved === true) return false;
        return !attempted.has(artistAttemptKey(entry));
      });
      if (!artist) {
        if (activeReconciliation?.pending) continue;
        return {
          status: 'ok',
          attempted: attemptedCount,
          changed: changedCount,
        };
      }

      const attemptKey = artistAttemptKey(artist);
      attempted.add(attemptKey);
      attemptedCount += 1;
      const searchResult = await search(job.directory, job.tracks, artist.id);
      if (searchResult.status === 'unavailable') {
        return {
          status: 'unavailable',
          reason: searchResult.reason,
          attempted: attemptedCount,
          changed: changedCount,
        };
      }
      if (searchResult.status !== 'ok') continue;
      const candidate = searchResult.candidates.find(
        (entry) => entry.canAutoLink === true,
      );
      if (!candidate) continue;

      const result = await apply(
        job.directory,
        job.tracks,
        artist.id,
        candidate.candidateId,
        index.organizationRevision,
        { automatic: true },
      );
      if (result?.status === 'conflict') {
        attempted.delete(attemptKey);
        continue;
      }
      if (result?.status === 'ok' && result.changed) {
        changedCount += 1;
        await job.options.onApplied?.(result);
      }
    }
    return {
      status: 'bounded',
      attempted: attemptedCount,
      changed: changedCount,
    };
  }

  function reconcile(directory, tracks, options = {}) {
    const job = {
      directory,
      tracks,
      options,
      key: reconciliationKey(directory, tracks),
    };
    if (activeReconciliation) {
      if (activeReconciliation.key !== job.key) {
        activeReconciliation.pending = job;
      }
      return Promise.resolve({ status: 'running' });
    }
    activeReconciliation = { key: job.key, pending: null, promise: null };
    const promise = runReconciliation(job).finally(() => {
      activeReconciliation = null;
    });
    activeReconciliation.promise = promise;
    return promise;
  }

  return { apply, cancel, reconcile, search };
}

module.exports = {
  createArtistIdentityService,
  durationMatches,
};
