'use strict';

const { normalizeForCompare } = require('./text.js');
const {
  candidateIntroducesVersion,
  collectVersionTerms,
} = require('./recordingSignals.js');
const { normalizeIsrc } = require('./observedTrack.js');

function tokenSet(value) {
  return new Set(normalizeForCompare(value).split(/\s+/u).filter(Boolean));
}

function tokenOverlap(first, second) {
  const firstTokens = tokenSet(first);
  const secondTokens = tokenSet(second);
  if (firstTokens.size === 0 || secondTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(firstTokens.size, secondTokens.size);
}

function compareTextEvidence(expected, actual) {
  const expectedKey = normalizeForCompare(expected);
  const actualKey = normalizeForCompare(actual);
  const exact = Boolean(expectedKey && actualKey && expectedKey === actualKey);
  return {
    expectedKey,
    actualKey,
    exact,
    contains: Boolean(
      !exact &&
      expectedKey &&
      actualKey &&
      (expectedKey.includes(actualKey) || actualKey.includes(expectedKey)),
    ),
    tokenOverlap: tokenOverlap(expectedKey, actualKey),
  };
}

function durationDelta(trackDuration, candidateDuration) {
  if (!Number.isFinite(trackDuration) || !Number.isFinite(candidateDuration)) {
    return null;
  }
  return Math.abs(Math.round(trackDuration) - Math.round(candidateDuration));
}

function signedDurationDelta(trackDuration, candidateDuration) {
  if (!Number.isFinite(trackDuration) || !Number.isFinite(candidateDuration)) {
    return null;
  }
  return Math.round(candidateDuration) - Math.round(trackDuration);
}

function idEvidence(expected, candidate) {
  const expectedValue = normalizeIsrc(expected);
  const candidateValue = normalizeIsrc(candidate);
  return {
    expected: expectedValue,
    candidate: candidateValue,
    relation:
      expectedValue && candidateValue
        ? expectedValue === candidateValue
          ? 'exact'
          : 'conflict'
        : 'missing',
  };
}

function appendTextReasons(reasons, field, evidence) {
  if (evidence.exact) reasons.push(`${field}-exact`);
  else if (evidence.contains) reasons.push(`${field}-contains`);
  else if (evidence.tokenOverlap > 0) reasons.push(`${field}-token-overlap`);
}

function compareRecordingIdentity(expected = {}, candidate = {}) {
  const title = compareTextEvidence(expected.title, candidate.title);
  const artist = compareTextEvidence(
    expected.artistCredit,
    candidate.artistCredit,
  );
  const album = compareTextEvidence(expected.album, candidate.album);
  const delta = durationDelta(expected.duration, candidate.duration);
  const signedDelta = signedDurationDelta(
    expected.duration,
    candidate.duration,
  );
  const isrc = idEvidence(expected.isrc, candidate.isrc);
  const sourceVersionTerms = collectVersionTerms([
    expected.title,
    expected.album,
  ]);
  const candidateVersionTerms = collectVersionTerms([
    candidate.title,
    candidate.album,
  ]);
  const candidateIntroduces = candidateIntroducesVersion(
    [expected.title, expected.album],
    [candidate.title, candidate.album],
  );
  const reasons = [];
  appendTextReasons(reasons, 'title', title);
  appendTextReasons(reasons, 'artist', artist);
  appendTextReasons(reasons, 'album', album);
  if (delta !== null) reasons.push('duration-delta');
  if (isrc.relation === 'exact') reasons.push('isrc-exact');
  if (isrc.relation === 'conflict') reasons.push('isrc-conflict');
  if (candidateIntroduces) reasons.push('candidate-version-extra');

  return {
    title,
    artist,
    album,
    duration: {
      expected: Number.isFinite(expected.duration)
        ? Math.round(expected.duration)
        : undefined,
      candidate: Number.isFinite(candidate.duration)
        ? Math.round(candidate.duration)
        : undefined,
      delta,
      signedDelta,
    },
    ids: { isrc },
    version: {
      sourceTerms: [...sourceVersionTerms],
      candidateTerms: [...candidateVersionTerms],
      candidateIntroduces,
    },
    reasons,
  };
}

module.exports = {
  compareRecordingIdentity,
  compareTextEvidence,
  durationDelta,
  signedDurationDelta,
};
