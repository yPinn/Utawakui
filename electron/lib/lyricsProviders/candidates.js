'use strict';

const crypto = require('crypto');
const { normalizeForCompare } = require('../musicTitle.js');
const {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
  isAutomaticLyricsCandidate,
} = require('./recordingPolicy.js');

const BAND_ORDER = Object.freeze({ exact: 0, strong: 1, related: 2 });
const CAPABILITY_ORDER = Object.freeze({
  T2: 0,
  T1: 1,
  T0: 3,
  instrumental: 4,
  unsupported: 5,
});
const MAX_INVALID_RECORD_COUNT = 1_000;
const DURATION_MATCH_WINDOWS = Object.freeze({
  exact: 4,
  close: 15,
  strong: 45,
});
const UNIFIED_MATCH_RULES = Object.freeze({
  exact: {
    title: 1,
    artist: 1,
    duration: DURATION_MATCH_WINDOWS.exact,
    requiresArtist: true,
  },
  strong: { title: 0.82, artist: 0.8, duration: DURATION_MATCH_WINDOWS.strong },
});

function trackIdentity(track) {
  return {
    trackName: track?.title ?? track?.trackName ?? '',
    artistName: track?.artist ?? track?.artistName ?? '',
    albumName: track?.album ?? track?.albumName ?? '',
    duration: track?.duration,
  };
}

function unifiedMatch(track, candidate) {
  const identity = trackIdentity(track);
  const evidence = compareLyricsRecordingIdentity(identity, candidate);
  // Provider projections retain query/alias evidence computed in main, rather
  // than asking display metadata to prove a translated title a second time.
  const match = candidate.matchEvidence;
  const matchBand = classifyLyricsMatch(
    {
      ...evidence,
      scores: {
        ...evidence.scores,
        title: match?.titleScore ?? evidence.scores.title,
        artist: evidence.hasArtist
          ? (match?.artistScore ?? evidence.scores.artist)
          : 1,
      },
      duration: {
        ...evidence.duration,
        delta: match?.durationDelta ?? evidence.duration.delta,
      },
    },
    UNIFIED_MATCH_RULES,
  );
  return { matchBand, durationDelta: evidence.duration.delta };
}

function capabilityOrder(candidate) {
  const level = candidate.capability?.level;
  if (level === 'T2' && candidate.capability?.partial) return 2;
  return CAPABILITY_ORDER[level] ?? CAPABILITY_ORDER.unsupported;
}

function stableCandidateId(candidate) {
  return Number.isSafeInteger(candidate.id) ? candidate.id : 0;
}

function candidateDurationDelta(candidate) {
  return candidate.matchEvidence?.durationDelta ?? candidate.durationDelta;
}

function durationOrder(candidate) {
  // Tier determines animation quality within comparable duration evidence;
  // it must not promote a substantially less compatible recording.
  const delta = candidateDurationDelta(candidate);
  if (!Number.isFinite(delta)) return 4;
  if (delta <= DURATION_MATCH_WINDOWS.exact) return 0;
  if (delta <= DURATION_MATCH_WINDOWS.close) return 1;
  if (delta <= DURATION_MATCH_WINDOWS.strong) return 2;
  return 3;
}

function compareUnifiedLyricsCandidates(first, second) {
  return (
    (BAND_ORDER[first.matchBand] ?? BAND_ORDER.related) -
      (BAND_ORDER[second.matchBand] ?? BAND_ORDER.related) ||
    durationOrder(first) - durationOrder(second) ||
    capabilityOrder(first) - capabilityOrder(second) ||
    Number(Boolean(first.capability?.partial)) -
      Number(Boolean(second.capability?.partial)) ||
    (candidateDurationDelta(first) ?? Number.MAX_SAFE_INTEGER) -
      (candidateDurationDelta(second) ?? Number.MAX_SAFE_INTEGER) ||
    (first.warnings?.length ?? 0) - (second.warnings?.length ?? 0) ||
    String(first.providerId).localeCompare(String(second.providerId), 'en') ||
    stableCandidateId(first) - stableCandidateId(second)
  );
}

function selectAutomaticLyricsCandidate(candidates) {
  return (
    (Array.isArray(candidates) ? candidates : [])
      .filter(isAutomaticLyricsCandidate)
      .sort(compareUnifiedLyricsCandidates)[0] || null
  );
}

function sameRecording(first, second) {
  const evidence = compareLyricsRecordingIdentity(first, second);
  const reverseEvidence = compareLyricsRecordingIdentity(second, first);
  if (!evidence.title.exact) return false;
  if (evidence.scores.artist < 0.82) return false;
  if (evidence.versionMismatch || reverseEvidence.versionMismatch) {
    return false;
  }
  const delta = evidence.duration.delta;
  return delta === null || delta <= 4;
}

function recordingKey(candidate) {
  return `recording:${crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        normalizeForCompare(candidate.trackName),
        normalizeForCompare(candidate.artistName),
        Number.isFinite(candidate.duration)
          ? Math.round(candidate.duration)
          : null,
      ]),
    )
    .digest('hex')
    .slice(0, 16)}`;
}

function groupCandidates(candidates) {
  const recordingGroups = [];
  for (const candidate of candidates) {
    const existing = recordingGroups.find((group) =>
      sameRecording(group.candidates[0], candidate),
    );
    if (existing) {
      existing.candidates.push(candidate);
      existing.candidates.sort(compareUnifiedLyricsCandidates);
      existing.recommendedCandidateKey = existing.candidates[0].candidateKey;
      existing.matchBand = existing.candidates[0].matchBand;
      continue;
    }
    recordingGroups.push({
      recordingKey: recordingKey(candidate),
      matchBand: candidate.matchBand,
      recommendedCandidateKey: candidate.candidateKey,
      candidates: [candidate],
    });
  }
  recordingGroups.sort((first, second) =>
    compareUnifiedLyricsCandidates(first.candidates[0], second.candidates[0]),
  );
  return recordingGroups;
}

function boundedProviderStatus(result) {
  return {
    provider: result.provider,
    status: result.status,
    ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
  };
}

function aggregateStatus(results) {
  if (results.some((result) => result.status === 'ok')) {
    return { status: 'ok' };
  }
  if (
    results.length > 0 &&
    results.every((result) => result.status === 'unavailable')
  ) {
    return { status: 'unavailable', reason: 'all-providers-unavailable' };
  }
  return { status: 'error', reason: 'all-providers-failed' };
}

function aggregateLyricsProviderResults(track, providerResults) {
  const results = (
    Array.isArray(providerResults) ? providerResults : []
  ).filter(
    (result) =>
      result &&
      typeof result === 'object' &&
      typeof result.provider === 'string' &&
      typeof result.status === 'string',
  );
  const candidates = results
    .filter((result) => result.status === 'ok')
    .flatMap((result) =>
      (Array.isArray(result.candidates) ? result.candidates : []).map(
        (candidate) => ({
          ...candidate,
          providerId: result.provider,
          candidateKey: `${result.provider}:${candidate.id}`,
          ...unifiedMatch(track, candidate),
        }),
      ),
    )
    .sort(compareUnifiedLyricsCandidates);
  const grouped = groupCandidates(candidates);
  const flattened = grouped.flatMap((group) => group.candidates);
  const status = aggregateStatus(results);
  const partial =
    status.status === 'ok' && results.some((result) => result.status !== 'ok');
  const invalidRecordCount = Math.min(
    MAX_INVALID_RECORD_COUNT,
    results.reduce(
      (count, result) =>
        count +
        (Number.isSafeInteger(result.invalidRecordCount)
          ? Math.max(0, result.invalidRecordCount)
          : 0),
      0,
    ),
  );

  return {
    provider: 'all',
    ...status,
    partial,
    candidates: flattened,
    groups: {
      best: flattened.filter((candidate) => candidate.matchBand !== 'related'),
      related: flattened.filter(
        (candidate) => candidate.matchBand === 'related',
      ),
    },
    recordingGroups: {
      best: grouped.filter((group) => group.matchBand !== 'related'),
      related: grouped.filter((group) => group.matchBand === 'related'),
    },
    invalidRecordCount,
    providerStatuses: results.map(boundedProviderStatus),
  };
}

module.exports = {
  aggregateLyricsProviderResults,
  compareUnifiedLyricsCandidates,
  selectAutomaticLyricsCandidate,
};
