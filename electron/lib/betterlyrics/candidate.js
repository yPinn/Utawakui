'use strict';

const crypto = require('crypto');
const {
  durationDelta,
  signedDurationDelta,
  textMatchScore,
  versionMismatchPenalty,
} = require('../lrclib/matching.js');
const { analyzeAmllTtml } = require('../amll/ttml.js');

const MINIMUM_MATCH_SCORE = 80;

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
  const titleScore = textMatchScore(
    track?.title ?? track?.trackName ?? '',
    record.trackName,
  );
  const artistScore = textMatchScore(
    track?.artist ?? track?.artistName ?? '',
    record.artistName,
  );
  const albumScore =
    (track?.album ?? track?.albumName)
      ? textMatchScore(track.album ?? track.albumName, record.albumName)
      : 1;
  const delta = durationDelta(track?.duration, record.duration);
  if (
    titleScore < 0.82 ||
    artistScore < 0.8 ||
    delta === null ||
    delta > 4 ||
    versionMismatchPenalty(track?.title ?? track?.trackName ?? '', record) > 0
  ) {
    return null;
  }
  const analysis = analyzeAmllTtml(record.ttml, { recordId: record.id });
  if (analysis.status !== 'ok') return null;
  return {
    record,
    analysis,
    matchBand:
      titleScore === 1 && artistScore === 1 && albumScore === 1
        ? 'exact'
        : 'strong',
    durationDelta: delta,
    durationDeltaSigned: signedDurationDelta(track?.duration, record.duration),
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
