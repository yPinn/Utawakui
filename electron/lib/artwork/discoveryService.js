'use strict';

const { randomUUID } = require('crypto');
const { createCoverArtArchiveClient } = require('../coverArtArchive/client.js');
const { writeTrackArtworkBuffer } = require('../library/trackArtwork.js');
const { createMusicBrainzClient } = require('../musicbrainz/client.js');
const { buildIdentityProfile } = require('../musicIdentity/profiles.js');
const {
  buildIdentityQueryVariants,
} = require('../musicIdentity/queryVariants.js');
const { normalizeText } = require('../musicIdentity/text.js');
const { downloadValidatedArtwork } = require('./image.js');
const { rankArtworkCandidates } = require('./releasePolicy.js');

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 8;
const MAX_QUERY_CHARS = 200;
const MAX_QUERY_VARIANTS = 3;
const TARGET_CANDIDATE_COUNT = 4;
const MAX_RAW_PROPOSALS = 24;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_PIXELS = 4 * 1024 * 1024;

function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validEdit(value) {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.length <= MAX_QUERY_CHARS &&
      !containsControlCharacter(value))
  );
}

function normalizeQuery(track, edits = {}) {
  if (
    !track ||
    typeof track !== 'object' ||
    !validEdit(edits.title) ||
    !validEdit(edits.artist) ||
    !validEdit(edits.album)
  ) {
    return null;
  }
  const title = normalizeText(edits.title ?? track.title);
  if (!title) return null;
  return {
    id: track.id,
    title,
    artist: normalizeText(edits.artist ?? track.artist) || undefined,
    album: normalizeText(edits.album ?? track.album) || undefined,
    duration: Number.isFinite(track.duration) ? track.duration : undefined,
    isrc: track.isrc,
    releaseYear: Number.isInteger(track.releaseYear)
      ? track.releaseYear
      : undefined,
  };
}

function queryPlan(expected) {
  const profile = buildIdentityProfile({
    title: expected.title,
    artistCredit: expected.artist,
    album: expected.album,
    durationSeconds: expected.duration,
    isrc: expected.isrc,
    source: { provider: 'library', id: expected.id },
    confidence: { title: 'high', artist: 'high', album: 'medium' },
  });
  return buildIdentityQueryVariants(profile, {
    maxQueries: MAX_QUERY_VARIANTS,
    includeChineseScriptVariants: true,
    includeGeneratedScriptVariants: true,
    allowTitleOnly: false,
  });
}

function variantProjection(variant) {
  return {
    kind: variant.title.kind,
    source: variant.title.source,
    confidence: variant.confidence,
  };
}

function releaseGroupProposal(record, variant) {
  return {
    provider: 'musicbrainz',
    entityType: 'release-group',
    entityId: record.id,
    releaseGroupId: record.id,
    recordingTitle: record.title,
    releaseTitle: record.title,
    artistCredit: record.artistCredit,
    firstReleaseDate: record.firstReleaseDate,
    date: record.firstReleaseDate,
    primaryType: record.primaryType,
    secondaryTypes: record.secondaryTypes,
    searchScore: record.score,
    queryVariant: variantProjection(variant),
  };
}

function recordingProposals(record, variant) {
  const proposals = [];
  for (const release of record.releases || []) {
    proposals.push({
      provider: 'musicbrainz',
      entityType: 'release',
      entityId: release.id,
      releaseGroupId: release.releaseGroup?.id,
      recordingId: record.id,
      recordingTitle: record.title,
      releaseTitle: release.title,
      artistCredit: release.artistCredit || record.artistCredit,
      duration: record.duration,
      isrcs: record.isrcs,
      status: release.status,
      date: release.date,
      firstReleaseDate: release.releaseGroup?.firstReleaseDate,
      country: release.country,
      primaryType: release.releaseGroup?.primaryType,
      secondaryTypes: release.releaseGroup?.secondaryTypes || [],
      searchScore: record.score,
      queryVariant: variantProjection(variant),
    });
  }
  return proposals;
}

function publicCandidate(candidate) {
  return {
    id: candidate.candidateId,
    entityType: candidate.entityType,
    releaseTitle: candidate.releaseTitle,
    recordingTitle: candidate.recordingTitle,
    artistCredit: candidate.artistCredit,
    firstReleaseYear:
      Number.parseInt(candidate.firstReleaseDate || candidate.date, 10) ||
      undefined,
    primaryType: candidate.primaryType,
    secondaryTypes: candidate.secondaryTypes,
    status: candidate.status,
    country: candidate.country,
    confidence: candidate.confidence,
    reasons: candidate.reasons.slice(0, 16),
    matchKind: candidate.queryVariant?.kind || 'original',
    recommended: candidate.recommended,
    automatic: false,
    source: {
      provider: 'musicbrainz',
      artwork: 'cover-art-archive',
    },
  };
}

function createArtworkDiscoveryService(options = {}) {
  const musicBrainzClient =
    options.musicBrainzClient || createMusicBrainzClient();
  const coverArtClient =
    options.coverArtClient || createCoverArtArchiveClient();
  const downloadArtwork = options.downloadArtwork || downloadValidatedArtwork;
  const writeArtwork = options.writeArtwork || writeTrackArtworkBuffer;
  const now = options.now || Date.now;
  const randomId = options.randomId || randomUUID;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const sessions = new Map();

  function cleanSessions() {
    const currentTime = now();
    for (const [sessionId, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(sessionId);
    }
    while (sessions.size > MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
  }

  function resolveCandidate(trackId, candidateId) {
    cleanSessions();
    for (const session of sessions.values()) {
      if (session.trackId !== trackId) continue;
      const candidate = session.candidates.get(candidateId);
      if (candidate) return candidate;
    }
    return null;
  }

  async function hydrateFronts(proposals, signal) {
    const results = await Promise.all(
      proposals.map(async (proposal) => {
        try {
          const front = await coverArtClient.lookupFront(
            proposal.entityType,
            proposal.entityId,
            { signal },
          );
          return {
            proposal:
              front.status === 'ok'
                ? { ...proposal, front: front.front }
                : null,
            providerError: front.status === 'error',
          };
        } catch {
          return { proposal: null, providerError: true };
        }
      }),
    );
    return {
      proposals: results.map((result) => result.proposal).filter(Boolean),
      providerError: results.some((result) => result.providerError),
    };
  }

  async function search(track, edits = {}, requestOptions = {}) {
    const expected = normalizeQuery(track, edits);
    if (!expected) return { status: 'error', reason: 'invalid-query' };
    const variants = queryPlan(expected);
    const proposalKeys = new Set();
    const proposals = [];
    let sawProviderError = false;

    for (const variant of variants) {
      const query = {
        title: variant.title.value,
        artist: variant.artist?.value,
        album: expected.album,
      };
      const [releaseGroups, recordings] = await Promise.all([
        musicBrainzClient.searchReleaseGroups(query, requestOptions),
        musicBrainzClient.searchRecordings(query, requestOptions),
      ]);
      if (releaseGroups.status === 'error' || recordings.status === 'error') {
        sawProviderError = true;
      }
      if (releaseGroups.status === 'error' && recordings.status === 'error') {
        break;
      }
      const round = [
        ...(releaseGroups.status === 'ok'
          ? releaseGroups.records.map((record) =>
              releaseGroupProposal(record, variant),
            )
          : []),
        ...(recordings.status === 'ok'
          ? recordings.records.flatMap((record) =>
              recordingProposals(record, variant),
            )
          : []),
      ];
      const uniqueRound = [];
      for (const proposal of round) {
        const key = `${proposal.entityType}:${proposal.entityId}`;
        if (proposalKeys.has(key) || proposalKeys.size >= MAX_RAW_PROPOSALS) {
          continue;
        }
        proposalKeys.add(key);
        uniqueRound.push(proposal);
      }
      const hydrated = await hydrateFronts(uniqueRound, requestOptions.signal);
      proposals.push(...hydrated.proposals);
      sawProviderError ||= hydrated.providerError;
      if (
        proposals.length >= TARGET_CANDIDATE_COUNT ||
        proposalKeys.size >= MAX_RAW_PROPOSALS
      ) {
        break;
      }
    }

    const ranked = rankArtworkCandidates(expected, proposals);
    if (ranked.length === 0 && sawProviderError) {
      return { status: 'error', reason: 'provider-unavailable' };
    }

    cleanSessions();
    while (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
    const sessionId = randomId();
    const candidates = new Map();
    for (const [index, candidate] of ranked.entries()) {
      let candidateId = randomId();
      if (candidates.has(candidateId)) {
        candidateId = `${candidateId}-${index + 1}`;
      }
      candidates.set(candidateId, { ...candidate, candidateId });
    }
    sessions.set(sessionId, {
      trackId: track.id,
      expiresAt: now() + sessionTtlMs,
      candidates,
    });

    return {
      status: 'ok',
      candidates: [...candidates.values()].map(publicCandidate),
    };
  }

  async function loadPreview(trackId, candidateId, requestOptions = {}) {
    const candidate = resolveCandidate(trackId, candidateId);
    if (!candidate) {
      return { status: 'error', reason: 'candidate-expired' };
    }
    if (!candidate.previewImage) {
      const result = await downloadArtwork(candidate.front.previewUrl, {
        signal: requestOptions.signal,
        maxBytes: MAX_PREVIEW_BYTES,
        maxPixels: MAX_PREVIEW_PIXELS,
      });
      if (result.status === 'error') return result;
      candidate.previewImage = result.image;
    }
    return {
      status: 'ok',
      mimeType: candidate.previewImage.mimeType,
      bytes: Uint8Array.from(candidate.previewImage.buffer),
    };
  }

  async function apply(dir, trackId, candidateId, requestOptions = {}) {
    const candidate = resolveCandidate(trackId, candidateId);
    if (!candidate) {
      return { status: 'error', reason: 'candidate-expired' };
    }
    const result = await downloadArtwork(candidate.front.applyUrl, {
      signal: requestOptions.signal,
    });
    if (result.status === 'error') return result;
    const sourcePage = `https://musicbrainz.org/${candidate.entityType}/${candidate.entityId}`;
    const filename = writeArtwork(
      dir,
      trackId,
      result.image.buffer,
      result.image.extension,
      {
        schemaVersion: 1,
        source: 'cover-art-archive',
        provider: 'musicbrainz',
        recordingMbid: candidate.recordingId,
        releaseGroupMbid: candidate.releaseGroupId,
        releaseMbid:
          candidate.entityType === 'release' ? candidate.entityId : undefined,
        selectedAt: new Date(now()).toISOString(),
        sourcePage,
      },
    );
    return filename
      ? { status: 'ok', filename }
      : { status: 'error', reason: 'track-unavailable' };
  }

  function sourcePage(trackId, candidateId) {
    const candidate = resolveCandidate(trackId, candidateId);
    return candidate
      ? `https://musicbrainz.org/${candidate.entityType}/${candidate.entityId}`
      : null;
  }

  return { apply, loadPreview, search, sourcePage };
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  MAX_QUERY_VARIANTS,
  MAX_PREVIEW_PIXELS,
  MAX_SESSIONS,
  createArtworkDiscoveryService,
  normalizeQuery,
  queryPlan,
};
