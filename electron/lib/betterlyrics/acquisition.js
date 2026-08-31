'use strict';

const { buildLrclibQueryPlan } = require('../lrclib/query.js');
const {
  MINIMUM_MATCH_SCORE,
  evaluateBetterLyricsCandidate,
  fingerprintBetterLyricsRecord,
  summarizeBetterLyricsCandidate,
} = require('./candidate.js');
const { createBetterLyricsClient } = require('./client.js');
const { saveBetterLyricsRecord } = require('./storage.js');

const SHA256_RE = /^[a-f0-9]{64}$/u;
const MAX_AUTHORIZED_CANDIDATES = 96;

function trackAuthorizationKey(track) {
  if (typeof track?.id === 'string' && track.id.length > 0) {
    return `id:${track.id}`;
  }
  return `identity:${JSON.stringify([
    track?.title ?? track?.trackName ?? '',
    track?.artist ?? track?.artistName ?? '',
    track?.album ?? track?.albumName ?? '',
    Number.isFinite(track?.duration) ? Math.round(track.duration) : null,
  ])}`;
}

function authorizationKey(track, candidateId) {
  return `${trackAuthorizationKey(track)}\u0000${candidateId}`;
}

function providerFailure(result, extra = {}) {
  return {
    provider: 'betterlyrics',
    status: result.status === 'unavailable' ? 'unavailable' : 'error',
    reason: result.reason,
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    ...extra,
  };
}

function queryFromIdentity(identity, mode) {
  return {
    trackName: identity.trackName,
    artistName: identity.artistName,
    ...(identity.albumName && mode !== 'broaden'
      ? { albumName: identity.albumName }
      : {}),
    duration: identity.duration,
  };
}

function createBetterLyricsAcquisitionProvider(options = {}) {
  const client = options.client || createBetterLyricsClient();
  const persistRecord = options.persistRecord || saveBetterLyricsRecord;
  const authorizations = new Map();

  function authorize(track, candidate, query) {
    const key = authorizationKey(track, candidate.id);
    authorizations.delete(key);
    authorizations.set(key, {
      query,
      fingerprint: candidate.previewFingerprint,
    });
    while (authorizations.size > MAX_AUTHORIZED_CANDIDATES) {
      authorizations.delete(authorizations.keys().next().value);
    }
  }

  async function searchCandidates(track, searchOptions = {}) {
    const plan = buildLrclibQueryPlan(track, searchOptions.query);
    if (
      !plan.identity.trackName ||
      !plan.identity.artistName ||
      !Number.isFinite(plan.identity.duration) ||
      plan.identity.duration <= 0
    ) {
      return providerFailure(
        { status: 'unavailable', reason: 'missing-track-identity' },
        { candidates: [], groups: null },
      );
    }
    const query = queryFromIdentity(plan.identity, searchOptions.mode);
    const result = await client.getLyrics(query, {
      signal: searchOptions.signal,
    });
    if (result.status !== 'ok') {
      return providerFailure(result, { candidates: [], groups: null });
    }
    if (
      Number.isFinite(result.record.score) &&
      result.record.score < MINIMUM_MATCH_SCORE
    ) {
      return providerFailure(
        { status: 'unavailable', reason: 'low-confidence-match' },
        { candidates: [], groups: null },
      );
    }
    const match = evaluateBetterLyricsCandidate(plan.identity, result.record);
    if (!match) {
      return providerFailure(
        { status: 'error', reason: 'invalid-ttml' },
        { candidates: [], groups: null, invalidRecordCount: 1 },
      );
    }
    const candidate = {
      ...summarizeBetterLyricsCandidate(match),
      saveState: 'unsaved',
      alreadySaved: false,
    };
    authorize(track, candidate, query);
    return {
      provider: 'betterlyrics',
      status: 'ok',
      candidates: [candidate],
      groups: { best: [candidate], related: [] },
      invalidRecordCount: 0,
    };
  }

  async function saveCandidate({
    track,
    trackDir,
    candidateId,
    expectedFingerprint,
  }) {
    if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
      throw new Error('better lyrics candidate id is invalid');
    }
    if (!SHA256_RE.test(expectedFingerprint)) {
      throw new Error('better lyrics preview fingerprint is invalid');
    }
    const authorization = authorizations.get(
      authorizationKey(track, candidateId),
    );
    if (!authorization || authorization.fingerprint !== expectedFingerprint) {
      return {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'stale-search',
      };
    }
    const fetched = await client.getLyrics(authorization.query);
    if (fetched.status !== 'ok') return providerFailure(fetched);
    const match = evaluateBetterLyricsCandidate(
      authorization.query,
      fetched.record,
    );
    if (!match) {
      return {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'record-mismatch',
      };
    }
    const currentFingerprint = fingerprintBetterLyricsRecord(fetched.record);
    if (currentFingerprint !== expectedFingerprint) {
      const candidate = summarizeBetterLyricsCandidate(match);
      authorize(track, candidate, authorization.query);
      return {
        provider: 'betterlyrics',
        status: 'record-changed',
        candidate,
      };
    }
    return {
      provider: 'betterlyrics',
      ...persistRecord(trackDir, fetched.record),
    };
  }

  return { saveCandidate, searchCandidates };
}

module.exports = { createBetterLyricsAcquisitionProvider };
