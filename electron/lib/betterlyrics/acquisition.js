'use strict';

const { buildLrclibQueryPlan } = require('../lrclib/query.js');
const { looksLikeChannelArtist } = require('../musicTitle.js');
const { collectVersionTerms } = require('../musicIdentity/recordingSignals.js');
const {
  crossScriptTitleVariants,
} = require('../musicIdentity/queryVariants.js');
const {
  normalizeForCompare,
  normalizeText,
} = require('../musicIdentity/text.js');
const {
  assessBetterLyricsCandidate,
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

function canonicalArtistCredit(value) {
  // Replace only an explicit cross-script parenthetical alias. Keep every
  // collaborator and delimiter; slashes/ampersands may belong to band names.
  return normalizeText(value)
    .split(/([,，、;；])/u)
    .map((part) => {
      if (!/^.+?\s*[(（][^()（）]+[)）]\s*$/u.test(part)) return part;
      const variants = crossScriptTitleVariants(part);
      const latin = variants.find(
        ({ value }) =>
          /\p{Script=Latin}/u.test(value) &&
          !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
            value,
          ),
      );
      return latin &&
        !looksLikeChannelArtist(latin.value) &&
        collectVersionTerms(latin.value).size === 0
        ? part.replace(part.trim(), latin.value)
        : part;
    })
    .join('');
}

function canonicalQueryNames(identity) {
  const artistName = canonicalArtistCredit(identity.artistName);
  const credited = artistName.split(/[,，、;；]/u).map(normalizeForCompare);
  const trackName = normalizeText(identity.trackName)
    .replace(
      /\s*[(（](?:feat\.?|ft\.?|featuring)\s+([^()（）]+)[)）]/giu,
      (original, guest) =>
        credited.includes(normalizeForCompare(guest)) ? '' : original,
    )
    .trim();
  return {
    trackName: trackName || normalizeText(identity.trackName),
    artistName,
  };
}

function queryFromIdentity(identity, track, searchOptions) {
  const names = canonicalQueryNames(identity);
  const manual =
    searchOptions.query &&
    (Object.hasOwn(searchOptions.query, 'title') ||
      Object.hasOwn(searchOptions.query, 'artist'));
  const original = canonicalQueryNames({
    trackName: track?.title,
    artistName: track?.artist,
  });
  // An edited identity can legitimately target another song; its old library
  // album is not evidence for the new request. Do not guess replacement albums.
  const sameIdentity =
    !manual ||
    (normalizeForCompare(names.trackName) ===
      normalizeForCompare(original.trackName) &&
      normalizeForCompare(names.artistName) ===
        normalizeForCompare(original.artistName));
  return {
    ...names,
    ...(identity.albumName && sameIdentity
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
    const query = queryFromIdentity(plan.identity, track, searchOptions);
    const result = await client.getLyrics(query, {
      signal: searchOptions.signal,
      budget: searchOptions.budget,
    });
    if (result.status !== 'ok') {
      return providerFailure(result, { candidates: [], groups: null });
    }
    const assessment = assessBetterLyricsCandidate(
      plan.identity,
      result.record,
    );
    if (assessment.status !== 'ok') {
      if (assessment.status === 'error') client.invalidateDiscovery?.();
      return providerFailure(assessment, {
        candidates: [],
        groups: null,
        ...(assessment.status === 'error' ? { invalidRecordCount: 1 } : {}),
      });
    }
    const { match } = assessment;
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
    budget,
    signal,
    validateCommit,
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
    const fetched = await client.getLyrics(authorization.query, {
      fresh: true,
      budget,
      signal,
    });
    if (fetched.status !== 'ok') return providerFailure(fetched);
    const assessment = assessBetterLyricsCandidate(
      authorization.query,
      fetched.record,
    );
    if (assessment.status === 'error') return providerFailure(assessment);
    if (assessment.status !== 'ok') {
      return {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'record-mismatch',
      };
    }
    const { match } = assessment;
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
    const denial = validateCommit?.();
    if (denial)
      return {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: denial,
      };
    return {
      provider: 'betterlyrics',
      ...persistRecord(trackDir, fetched.record),
    };
  }

  return { saveCandidate, searchCandidates };
}

module.exports = { createBetterLyricsAcquisitionProvider };
