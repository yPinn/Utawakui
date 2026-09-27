'use strict';

const crypto = require('crypto');
const {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
  lyricsTextMatchScore,
} = require('../lyricsProviders/recordingPolicy.js');
const { analyzeAmllTtml } = require('../amll/ttml.js');

const MINIMUM_MATCH_SCORE = 80;
const BETTER_LYRICS_MATCH_RULES = Object.freeze({
  exact: {
    title: 1,
    artist: 1,
    album: 1,
    duration: 4,
    durationRequired: true,
  },
  strong: {
    title: 0.82,
    artist: 0.8,
    duration: 4,
    durationRequired: true,
  },
});

function stableRecord(record) {
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName,
    duration: record.duration,
    ttml: record.ttml,
  };
}

function fingerprintBetterLyricsRecord(record) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableRecord(record)))
    .digest('hex');
}

function evaluateBetterLyricsCandidate(track, record) {
  if (
    !record ||
    (Number.isFinite(record.score) && record.score < MINIMUM_MATCH_SCORE)
  ) {
    return null;
  }
  const titleScore = lyricsTextMatchScore(
    track?.title ?? track?.trackName ?? '',
    record.trackName,
  );
  const artistScore = lyricsTextMatchScore(
    track?.artist ?? track?.artistName ?? '',
    record.artistName,
  );
  const albumScore =
    (track?.album ?? track?.albumName)
      ? lyricsTextMatchScore(track.album ?? track.albumName, record.albumName)
      : 1;
  const recordingEvidence = compareLyricsRecordingIdentity(track, record);
  const delta = recordingEvidence.duration.delta;
  if (
    titleScore < 0.82 ||
    artistScore < 0.8 ||
    delta === null ||
    delta > 4 ||
    recordingEvidence.versionMismatch
  ) {
    return null;
  }
  const analysis = analyzeAmllTtml(record.ttml, { recordId: record.id });
  if (analysis.status !== 'ok') return null;
  return {
    record,
    analysis,
    matchBand: classifyLyricsMatch(
      {
        ...recordingEvidence,
        scores: {
          title: titleScore,
          artist: artistScore,
          album: albumScore,
        },
      },
      BETTER_LYRICS_MATCH_RULES,
    ),
    durationDelta: delta,
    durationDeltaSigned: recordingEvidence.duration.signedDelta,
  };
}

function summarizeBetterLyricsCandidate(match) {
  const { record, analysis } = match;
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName || null,
    contributors: [],
    duration: record.duration,
    lineCount: analysis.lineCount,
    segmentCount: analysis.segmentCount,
    previewLines: analysis.document.lines.slice(0, 5).map((line) => ({
      text: line.text,
      start: line.startMs / 1000,
    })),
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    matchBand: match.matchBand,
    matchReasons: [],
    durationDelta: match.durationDelta,
    durationDeltaSigned: match.durationDeltaSigned,
    previewFingerprint: fingerprintBetterLyricsRecord(record),
  };
}

module.exports = {
  MINIMUM_MATCH_SCORE,
  evaluateBetterLyricsCandidate,
  fingerprintBetterLyricsRecord,
  summarizeBetterLyricsCandidate,
};
