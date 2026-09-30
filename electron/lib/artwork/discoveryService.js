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
const {
  rankArtworkCandidates,
  rankArtworkProposals,
} = require('./releasePolicy.js');

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 8;
const MAX_QUERY_CHARS = 200;
const MAX_QUERY_VARIANTS = 3;
const TARGET_CANDIDATE_COUNT = 4;
const MAX_RAW_PROPOSALS = 24;
const MAX_PROPOSALS_PER_STAGE = 8;
const COVER_LOOKUP_CONCURRENCY = 2;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_PIXELS = 4 * 1024 * 1024;
const PROVIDER_FAILURE_REASONS = new Set([
  'fetch-unavailable',
  'http-error',
  'invalid-json',
  'invalid-redirect',
  'invalid-request',
  'offline',
  'rate-limited',
  'redirect-not-allowed',
  'response-too-large',
  'service-unavailable',
  'timeout',
  'too-many-redirects',
  'unexpected-error',
]);

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

function proposalIdentity(candidate) {
  return `${candidate?.entityType || ''}:${candidate?.entityId || ''}`;
}

function releaseGroupIdentity(candidate) {
  return candidate?.releaseGroupId || proposalIdentity(candidate);
}

function diverseProposalOrder(expected, proposals) {
  const groups = new Map();
  for (const candidate of rankArtworkProposals(expected, proposals)) {
    const key = releaseGroupIdentity(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const ordered = [];
  while (groups.size > 0) {
    for (const [key, candidates] of groups) {
      ordered.push(candidates.shift());
      if (candidates.length === 0) groups.delete(key);
    }
  }
  return ordered;
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
  const onProviderFailure =
    typeof options.onProviderFailure === 'function'
      ? options.onProviderFailure
      : null;
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

  async function search(track, edits = {}, requestOptions = {}) {
    const expected = normalizeQuery(track, edits);
    if (!expected) return { status: 'error', reason: 'invalid-query' };
    const variants = queryPlan(expected);
    const proposalKeys = new Set();
    const proposals = [];
    let coverLookupCount = 0;
    let sawProviderError = false;
    let firstProviderFailure = null;
    let providerFailureCount = 0;

    function noteProviderFailure(stage, result) {
      sawProviderError = true;
      providerFailureCount = Math.min(
        MAX_RAW_PROPOSALS + 2,
        providerFailureCount + 1,
      );
      if (firstProviderFailure) return;
      const reason = PROVIDER_FAILURE_REASONS.has(result?.reason)
        ? result.reason
        : 'unexpected-error';
      const httpStatus = Number(result?.httpStatus);
      firstProviderFailure = {
        stage,
        reason,
        ...(Number.isInteger(httpStatus) &&
        httpStatus >= 100 &&
        httpStatus <= 599
          ? { httpStatus }
          : {}),
      };
    }

    function notifyProviderFailure() {
      if (!onProviderFailure || !firstProviderFailure) return;
      try {
        onProviderFailure({
          ...firstProviderFailure,
          failureCount: providerFailureCount,
        });
      } catch {
        // Diagnostics are fail-open and must not replace the user operation.
      }
    }

    function rankedCandidates() {
      return rankArtworkCandidates(expected, proposals, {
        limit: TARGET_CANDIDATE_COUNT,
      });
    }

    function targetReached() {
      return rankedCandidates().length >= TARGET_CANDIDATE_COUNT;
    }

    async function hydrateStage(stageProposals) {
      const queue = [];
      for (const proposal of diverseProposalOrder(expected, stageProposals)) {
        const key = proposalIdentity(proposal);
        if (proposalKeys.has(key)) continue;
        proposalKeys.add(key);
        queue.push(proposal);
        if (queue.length >= MAX_PROPOSALS_PER_STAGE) break;
      }
      let nextIndex = 0;
      async function worker() {
        while (
          nextIndex < queue.length &&
          coverLookupCount < MAX_RAW_PROPOSALS &&
          !targetReached()
        ) {
          const proposal = queue[nextIndex];
          nextIndex += 1;
          coverLookupCount += 1;
          try {
            const front = await coverArtClient.lookupFront(
              proposal.entityType,
              proposal.entityId,
              { signal: requestOptions.signal },
            );
            if (front.status === 'ok') {
              proposals.push({ ...proposal, front: front.front });
            } else if (front.status === 'error') {
              noteProviderFailure('cover-art-lookup', front);
            }
          } catch {
            noteProviderFailure('cover-art-lookup', {
              reason: 'unexpected-error',
            });
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(COVER_LOOKUP_CONCURRENCY, queue.length) },
          () => worker(),
        ),
      );
    }

    variantLoop: for (const variant of variants) {
      const query = {
        title: variant.title.value,
        artist: variant.artist?.value,
        album: expected.album,
      };
      let endpointErrors = 0;
      const stages = [
        {
          failureStage: 'musicbrainz-recording-search',
          search: () =>
            musicBrainzClient.searchRecordings(query, requestOptions),
          proposals: (records) =>
            records.flatMap((record) => recordingProposals(record, variant)),
        },
        {
          failureStage: 'musicbrainz-release-group-search',
          search: () =>
            musicBrainzClient.searchReleaseGroups(query, requestOptions),
          proposals: (records) =>
            records.map((record) => releaseGroupProposal(record, variant)),
        },
      ];
      for (const stage of stages) {
        if (targetReached() || coverLookupCount >= MAX_RAW_PROPOSALS) {
          break variantLoop;
        }
        const result = await stage.search();
        if (result.status === 'error') {
          noteProviderFailure(stage.failureStage, result);
          endpointErrors += 1;
          if (endpointErrors === stages.length) break variantLoop;
          continue;
        }
        await hydrateStage(stage.proposals(result.records));
      }
      if (rankedCandidates().length > 0) break variantLoop;
    }

    const ranked = rankedCandidates();
    if (ranked.length === 0 && sawProviderError) {
      notifyProviderFailure();
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
