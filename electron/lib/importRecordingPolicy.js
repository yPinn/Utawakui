'use strict';

const {
  compareRecordingIdentity,
  compareTextEvidence,
  durationDelta,
  signedDurationDelta,
} = require('./musicIdentity/recordingEvidence.js');
const { buildObservedTrack } = require('./musicIdentity/observedTrack.js');
const { normalizeForCompare } = require('./musicTitle.js');

function firstDefined(value, keys) {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) {
      return value[key];
    }
  }
  return undefined;
}

function confidenceFields(value) {
  if (value?.confidence && typeof value.confidence === 'object') {
    return value.confidence;
  }
  const confidence =
    typeof value?.confidence === 'string' ? value.confidence : 'none';
  return {
    title: confidence,
    artist: confidence,
    album: confidence,
  };
}

function buildImportObservedTrack(value = {}) {
  return buildObservedTrack({
    title: firstDefined(value, ['title', 'trackName']),
    artistCredit: firstDefined(value, ['artistCredit', 'artist', 'artistName']),
    artistHints: firstDefined(value, ['artistHints', 'artists']),
    album: firstDefined(value, ['album', 'albumName']),
    durationSeconds: value.duration,
    isrc: value.isrc,
    source: {
      provider: value.source?.provider ?? value.sourceProvider,
      platform: value.source?.platform ?? value.sourcePlatform,
      type: value.source?.type ?? value.sourceType,
      id: value.source?.id ?? value.sourceId,
    },
    confidence: confidenceFields(value),
  });
}

function importTextEvidence(expected, actual) {
  return compareTextEvidence(
    normalizeForCompare(expected),
    normalizeForCompare(actual),
  );
}

function textReason(field, evidence) {
  if (evidence.exact) return `${field}-exact`;
  if (evidence.contains) return `${field}-contains`;
  if (evidence.tokenOverlap > 0) return `${field}-token-overlap`;
  return null;
}

function compareImportRecordingIdentity(expected, candidate) {
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
  const expectedTrack = buildImportObservedTrack(expected) || {};
  const candidateTrack = buildImportObservedTrack(candidate) || {};
  const shared = compareRecordingIdentity(expectedTrack, candidateTrack);
  const title = importTextEvidence(expectedTitle, candidateTitle);
  const artist = importTextEvidence(expectedArtist, candidateArtist);
  const album = importTextEvidence(expectedAlbum, candidateAlbum);
  const delta = durationDelta(expected?.duration, candidate?.duration);
  const signedDelta = signedDurationDelta(
    expected?.duration,
    candidate?.duration,
  );
  const duration = {
    expected: Number.isFinite(expected?.duration)
      ? Math.round(expected.duration)
      : undefined,
    candidate: Number.isFinite(candidate?.duration)
      ? Math.round(candidate.duration)
      : undefined,
    delta,
    signedDelta,
  };
  const reasons = [
    textReason('title', title),
    textReason('artist', artist),
    textReason('album', album),
    ...(delta !== null ? ['duration-delta'] : []),
    ...shared.reasons.filter(
      (reason) =>
        reason !== 'duration-delta' &&
        !/^(?:title|artist|album)-/u.test(reason),
    ),
  ].filter(Boolean);

  return {
    ...shared,
    title,
    artist,
    album,
    duration,
    reasons,
  };
}

function importTextScore(evidence) {
  if (evidence?.exact) return 14;
  if (evidence?.contains) return 8;
  return 0;
}

function importDurationScore(delta) {
  if (delta === null) return 0;
  if (delta <= 4) return 14;
  if (delta <= 15) return 10;
  if (delta <= 45) return 4;
  return -18;
}

function scoreImportRecording(expected, candidate) {
  const evidence = compareImportRecordingIdentity(expected, candidate);
  const durationDelta = evidence.duration.delta;
  return {
    evidence,
    titleScore: importTextScore(evidence.title),
    artistScore: importTextScore(evidence.artist),
    durationScore: importDurationScore(durationDelta),
    durationDelta,
  };
}

module.exports = {
  buildImportObservedTrack,
  compareImportRecordingIdentity,
  importDurationScore,
  importTextEvidence,
  importTextScore,
  scoreImportRecording,
};
