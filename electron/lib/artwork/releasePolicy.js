'use strict';

const {
  compareRecordingIdentity,
} = require('../musicIdentity/recordingEvidence.js');
const {
  buildObservedTrack,
  normalizeIsrc,
} = require('../musicIdentity/observedTrack.js');

const DISFAVORED_STATUSES = new Set([
  'bootleg',
  'promotion',
  'pseudo-release',
  'withdrawn',
]);

function textScore(evidence, exact, contains, overlap) {
  if (evidence.exact) return exact;
  if (evidence.contains) return contains;
  return Math.round(evidence.tokenOverlap * overlap);
}

function appendTextReason(reasons, field, evidence) {
  if (evidence.exact) reasons.push(`${field}-exact`);
  else if (evidence.contains) reasons.push(`${field}-contains`);
  else if (evidence.tokenOverlap > 0) reasons.push(`${field}-token-overlap`);
}

function normalizeType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function yearFrom(value) {
  const match = /^(\d{4})/u.exec(String(value || ''));
  return match ? Number(match[1]) : undefined;
}

function expectedObservation(value = {}) {
  return (
    buildObservedTrack({
      title: value.title,
      artistCredit: value.artistCredit ?? value.artist,
      album: value.album,
      durationSeconds: value.duration,
      isrc: value.isrc,
      source: { provider: 'library', id: value.id },
      confidence: { title: 'high', artist: 'high', album: 'medium' },
    }) || {}
  );
}

function candidateIsrc(expectedIsrc, value = {}) {
  const normalizedExpected = normalizeIsrc(expectedIsrc);
  const candidates = [value.isrc, ...(value.isrcs || [])]
    .map(normalizeIsrc)
    .filter(Boolean);
  return (
    candidates.find((candidate) => candidate === normalizedExpected) ||
    candidates[0]
  );
}

function candidateObservation(value = {}, expectedIsrc) {
  return (
    buildObservedTrack({
      title: value.recordingTitle || value.releaseTitle,
      artistCredit: value.artistCredit,
      album: value.releaseTitle,
      durationSeconds: value.duration,
      isrc: candidateIsrc(expectedIsrc, value),
      source: {
        provider: value.provider,
        type: value.entityType,
        id: value.entityId,
      },
      confidence: { title: 'high', artist: 'high', album: 'high' },
    }) || {}
  );
}

function statusEvidence(status, reasons) {
  const normalized = normalizeType(status);
  if (normalized === 'official') {
    reasons.push('official-release');
    return 10;
  }
  if (normalized === 'pseudo-release') {
    reasons.push('pseudo-release');
    return -18;
  }
  if (normalized === 'bootleg') {
    reasons.push('bootleg');
    return -30;
  }
  if (normalized === 'promotion') {
    reasons.push('promotion');
    return -20;
  }
  if (normalized) reasons.push('release-status-other');
  return 0;
}

function typeEvidence(candidate, evidence, reasons) {
  let score = 0;
  const primaryType = normalizeType(candidate.primaryType);
  if (primaryType === 'single') {
    score += 7;
    reasons.push('type-single');
  } else if (primaryType === 'ep') {
    score += 5;
    reasons.push('type-ep');
  } else if (primaryType === 'album') {
    score += 3;
    reasons.push('type-album');
  }

  const sourceTerms = new Set(evidence.version.sourceTerms);
  for (const type of candidate.secondaryTypes || []) {
    const normalized = normalizeType(type);
    if (normalized === 'compilation') {
      score -= 16;
      reasons.push('compilation');
    } else if (normalized === 'live' && !sourceTerms.has('live')) {
      score -= 12;
      reasons.push('live-release');
    } else if (normalized === 'remix' && !sourceTerms.has('remix')) {
      score -= 12;
      reasons.push('remix-release');
    }
  }
  return score;
}

function durationEvidence(delta, reasons) {
  if (delta === null) return 0;
  reasons.push('duration-known');
  if (delta <= 4) return 10;
  if (delta <= 15) return 6;
  if (delta <= 45) return 2;
  reasons.push('duration-conflict');
  return -12;
}

function yearEvidence(expectedYear, candidateDate, reasons) {
  if (!Number.isInteger(expectedYear)) return 0;
  const candidateYear = yearFrom(candidateDate);
  if (!candidateYear) return 0;
  const delta = Math.abs(expectedYear - candidateYear);
  if (delta <= 1) {
    reasons.push('year-close');
    return 6;
  }
  if (delta <= 3) {
    reasons.push('year-near');
    return 3;
  }
  if (delta > 10) {
    reasons.push('year-conflict');
    return -6;
  }
  return 0;
}

function confidenceFor(evidence, candidate) {
  const status = normalizeType(candidate.status);
  const titleStrong = evidence.title.exact || evidence.title.contains;
  const artistStrong = evidence.artist.exact || evidence.artist.contains;
  if (
    evidence.title.exact &&
    evidence.artist.exact &&
    !evidence.version.candidateIntroduces &&
    !DISFAVORED_STATUSES.has(status)
  ) {
    return 'high';
  }
  if (
    titleStrong &&
    artistStrong &&
    !evidence.version.candidateIntroduces &&
    !DISFAVORED_STATUSES.has(status)
  ) {
    return 'medium';
  }
  return 'low';
}

function evaluateArtworkCandidate(expected, candidate) {
  const expectedTrack = expectedObservation(expected);
  const evidence = compareRecordingIdentity(
    expectedTrack,
    candidateObservation(candidate, expectedTrack.isrc),
  );
  const reasons = [];
  appendTextReason(reasons, 'title', evidence.title);
  appendTextReason(reasons, 'artist', evidence.artist);
  appendTextReason(reasons, 'album', evidence.album);

  let score =
    textScore(evidence.title, 32, 18, 12) +
    textScore(evidence.artist, 28, 16, 10) +
    textScore(evidence.album, 22, 12, 8) +
    durationEvidence(evidence.duration.delta, reasons);
  if (evidence.ids.isrc.relation === 'exact') {
    score += 25;
    reasons.push('isrc-exact');
  } else if (evidence.ids.isrc.relation === 'conflict') {
    score -= 30;
    reasons.push('isrc-conflict');
  }
  if (evidence.version.candidateIntroduces) {
    score -= 30;
    reasons.push('version-conflict');
  }
  score += statusEvidence(candidate.status, reasons);
  score += typeEvidence(candidate, evidence, reasons);
  score += yearEvidence(
    expected?.releaseYear,
    candidate.date || candidate.firstReleaseDate,
    reasons,
  );
  score += Math.round(
    Math.min(100, Math.max(0, candidate.searchScore || 0)) / 10,
  );
  if (candidate.front) {
    score += 5;
    reasons.push('front-available');
  }

  return {
    ...candidate,
    evidence,
    score,
    confidence: confidenceFor(evidence, candidate),
    reasons,
    recommended: false,
    automatic: false,
  };
}

function compareEvaluatedCandidates(first, second) {
  return (
    second.score - first.score ||
    String(first.entityId).localeCompare(String(second.entityId))
  );
}

function rankArtworkProposals(expected, candidates) {
  const seen = new Set();
  const ranked = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = `${candidate?.entityType || ''}:${candidate?.entityId || ''}`;
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    ranked.push(evaluateArtworkCandidate(expected, candidate));
  }
  ranked.sort(compareEvaluatedCandidates);
  return ranked;
}

function canonicalArtworkIdentity(candidate) {
  const value = candidate?.front?.imageUrl;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value.trim();
  }
}

function rankArtworkCandidates(expected, candidates, options = {}) {
  const limit = Number.isInteger(options.limit)
    ? Math.min(16, Math.max(1, options.limit))
    : 12;
  const artworkSeen = new Set();
  const result = [];
  for (const candidate of rankArtworkProposals(expected, candidates)) {
    if (!candidate.front) continue;
    const artworkIdentity = canonicalArtworkIdentity(candidate);
    if (artworkIdentity && artworkSeen.has(artworkIdentity)) continue;
    if (artworkIdentity) artworkSeen.add(artworkIdentity);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  if (
    result[0]?.confidence === 'high' &&
    (!result[1] || result[0].score - result[1].score >= 10)
  ) {
    result[0].recommended = true;
  }
  return result;
}

module.exports = {
  canonicalArtworkIdentity,
  evaluateArtworkCandidate,
  rankArtworkCandidates,
  rankArtworkProposals,
};
