'use strict';

const crypto = require('crypto');
const {
  textMatchScore,
  versionMismatchPenalty,
} = require('../lrclib/matching.js');
const { analyzeAmllTtml } = require('./ttml.js');

function stableRecord(record) {
  return {
    id: record.id,
    filename: record.filename,
    musicNames: record.musicNames,
    artistNames: record.artistNames,
    albumNames: record.albumNames,
    ncmMusicIds: record.ncmMusicIds,
    qqMusicIds: record.qqMusicIds,
    appleMusicIds: record.appleMusicIds,
    spotifyIds: record.spotifyIds,
    isrcs: record.isrcs,
    authorIds: record.authorIds,
    authorUsernames: record.authorUsernames,
    ttml: record.ttml,
  };
}

function fingerprintAmllRecord(record) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableRecord(record)))
    .digest('hex');
}

function bestScore(expected, values) {
  if (!expected) return 1;
  return Math.max(
    0,
    ...(Array.isArray(values) ? values : [values]).map((value) =>
      textMatchScore(expected, value),
    ),
  );
}

function evaluateAmllMetadata(track, record) {
  const expectedTitle = track?.title ?? track?.trackName ?? '';
  const expectedArtist = track?.artist ?? track?.artistName ?? '';
  const expectedAlbum = track?.album ?? track?.albumName ?? '';
  const titleScore = bestScore(expectedTitle, record.musicNames);
  const artistScore = bestScore(expectedArtist, [
    record.artistName,
    ...record.artistNames,
  ]);
  const albumScore = bestScore(expectedAlbum, record.albumNames);
  if (
    titleScore < 0.75 ||
    artistScore < 0.35 ||
    versionMismatchPenalty(expectedTitle, record) > 0
  ) {
    return null;
  }
  const matchBand =
    titleScore === 1 && artistScore === 1 && albumScore === 1
      ? 'exact'
      : titleScore >= 0.82 && artistScore >= 0.8
        ? 'strong'
        : 'related';
  return {
    record,
    matchBand,
    score: titleScore * 0.6 + artistScore * 0.3 + albumScore * 0.1,
    durationDelta: null,
    durationDeltaSigned: null,
  };
}

function compareMatches(first, second) {
  return second.score - first.score || first.record.id - second.record.id;
}

function rankAmllMetadata(track, records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => evaluateAmllMetadata(track, record))
    .filter(Boolean)
    .sort(compareMatches);
}

function rankAmllCandidates(track, records) {
  return rankAmllMetadata(track, records)
    .map((match) => {
      const analysis = analyzeAmllTtml(match.record.ttml, {
        recordId: match.record.id,
      });
      return analysis.status === 'ok' ? { ...match, analysis } : null;
    })
    .filter(Boolean);
}

function summarizeAmllCandidate(match) {
  const { record, analysis } = match;
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName,
    contributors: record.authorUsernames.slice(0, 8),
    duration: null,
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
    durationDelta: null,
    durationDeltaSigned: null,
    previewFingerprint: fingerprintAmllRecord(record),
  };
}

module.exports = {
  evaluateAmllMetadata,
  fingerprintAmllRecord,
  rankAmllCandidates,
  rankAmllMetadata,
  summarizeAmllCandidate,
};
