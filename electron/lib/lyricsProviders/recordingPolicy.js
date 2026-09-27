'use strict';

const {
  compareRecordingIdentity,
  compareTextEvidence,
} = require('../musicIdentity/recordingEvidence.js');
const { normalizeForCompare } = require('../musicTitle.js');

function firstDefined(value, keys) {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) {
      return value[key];
    }
  }
  return undefined;
}

function lyricsTextEvidence(expected, actual) {
  return compareTextEvidence(
    normalizeForCompare(expected),
    normalizeForCompare(actual),
  );
}

function scoreLyricsTextEvidence(evidence) {
  if (!evidence.expectedKey || !evidence.actualKey) return 0;
  if (evidence.exact) return 1;
  if (evidence.contains) return 0.82;
  return evidence.tokenOverlap >= 0.75 ? evidence.tokenOverlap : 0;
}

function lyricsTextMatchScore(expected, actual) {
  return scoreLyricsTextEvidence(lyricsTextEvidence(expected, actual));
}

function textReason(field, evidence) {
  if (evidence.exact) return `${field}-exact`;
  if (evidence.contains) return `${field}-contains`;
  if (evidence.tokenOverlap > 0) return `${field}-token-overlap`;
  return null;
}

function compareLyricsRecordingIdentity(expected = {}, candidate = {}) {
  const expectedTitle = firstDefined(expected, ['title', 'trackName']);
  const expectedArtist = firstDefined(expected, [
    'artistCredit',
    'artist',
    'artistName',
  ]);
  const expectedAlbum = firstDefined(expected, ['album', 'albumName']);
  const candidateTitle = firstDefined(candidate, ['title', 'trackName']);
  const candidateArtist = firstDefined(candidate, [
    'artistCredit',
    'artist',
    'artistName',
  ]);
  const candidateAlbum = firstDefined(candidate, ['album', 'albumName']);
  const shared = compareRecordingIdentity(
    {
      title: expectedTitle,
      artistCredit: expectedArtist,
      duration: expected.duration,
      isrc: expected.isrc,
    },
    {
      title: candidateTitle,
      artistCredit: candidateArtist,
      album: candidateAlbum,
      duration: candidate.duration,
      isrc: candidate.isrc,
    },
  );
  const title = lyricsTextEvidence(expectedTitle, candidateTitle);
  const artist = lyricsTextEvidence(expectedArtist, candidateArtist);
  const album = lyricsTextEvidence(expectedAlbum, candidateAlbum);
  const scores = {
    title: scoreLyricsTextEvidence(title),
    artist: scoreLyricsTextEvidence(artist),
    album: scoreLyricsTextEvidence(album),
  };
  const reasons = [
    textReason('title', title),
    textReason('artist', artist),
    textReason('album', album),
    ...shared.reasons.filter(
      (reason) => !/^(?:title|artist|album)-/u.test(reason),
    ),
  ].filter(Boolean);

  return {
    ...shared,
    title,
    artist,
    album,
    scores,
    hasArtist: Boolean(artist.expectedKey),
    versionMismatch: shared.version.candidateIntroduces,
    reasons,
  };
}

function passesMatchRule(evidence, rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.requiresArtist === true && !evidence.hasArtist) return false;
  for (const field of ['title', 'artist', 'album']) {
    if (Number.isFinite(rule[field]) && evidence.scores[field] < rule[field]) {
      return false;
    }
  }
  const delta = evidence.duration?.delta ?? null;
  if (rule.durationRequired === true && delta === null) return false;
  return (
    !Number.isFinite(rule.duration) || delta === null || delta <= rule.duration
  );
}

function classifyLyricsMatch(evidence, rules = {}) {
  if (!evidence.versionMismatch && passesMatchRule(evidence, rules.exact)) {
    return 'exact';
  }
  if (!evidence.versionMismatch && passesMatchRule(evidence, rules.strong)) {
    return 'strong';
  }
  return 'related';
}

function isAutomaticLyricsCandidate(candidate) {
  return (
    candidate?.matchBand === 'exact' &&
    candidate?.instrumental !== true &&
    (candidate?.compatibility?.t2 === true ||
      candidate?.compatibility?.t1 === true)
  );
}

module.exports = {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
  isAutomaticLyricsCandidate,
  lyricsTextEvidence,
  lyricsTextMatchScore,
  scoreLyricsTextEvidence,
};
