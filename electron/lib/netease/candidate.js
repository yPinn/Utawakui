'use strict';

const crypto = require('crypto');
const {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
  lyricsTextMatchScore,
} = require('../lyricsProviders/recordingPolicy.js');
const { parseLrcLines } = require('../lrclib/lrc.js');
const { chineseScriptForms } = require('../musicIdentity/queryVariants.js');
const { analyzeNeteaseLyrics } = require('./yrc.js');

const NETEASE_MATCH_RULES = Object.freeze({
  exact: { title: 1, artist: 1, album: 1, duration: 4 },
  strong: { title: 0.82, artist: 0.8, duration: 15 },
});

function stableRecord(record) {
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    artists: record.artists,
    albumName: record.albumName,
    duration: record.duration,
    aliases: record.aliases,
    translatedTitles: record.translatedTitles,
    yrcLyrics: record.yrcLyrics,
    lrcLyrics: record.lrcLyrics,
  };
}

function fingerprintNeteaseRecord(record) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableRecord(record)))
    .digest('hex');
}

function bestTextScore(expected, values) {
  return Math.max(
    0,
    ...values.flatMap((value) => {
      const expectedForms = chineseScriptForms(expected);
      const valueForms = chineseScriptForms(value);
      return ['original', 'simplified', 'traditional'].map((form) =>
        lyricsTextMatchScore(expectedForms[form], valueForms[form]),
      );
    }),
  );
}

function evaluateNeteaseMetadata(track, record) {
  const expectedTitle = track?.title ?? track?.trackName;
  const expectedArtist = track?.artist ?? track?.artistName;
  const expectedAlbum = track?.album ?? track?.albumName;
  const titleScore = bestTextScore(expectedTitle, [
    record.trackName,
    ...record.aliases,
    ...record.translatedTitles,
  ]);
  const artistScore = bestTextScore(expectedArtist, record.artists);
  const albumScore = expectedAlbum
    ? lyricsTextMatchScore(expectedAlbum, record.albumName)
    : 1;
  const recordingEvidence = compareLyricsRecordingIdentity(track, record);
  const delta = recordingEvidence.duration.delta;
  if (
    titleScore < 0.75 ||
    artistScore < 0.35 ||
    (delta !== null && delta > 90) ||
    recordingEvidence.versionMismatch
  ) {
    return null;
  }
  const matchBand = classifyLyricsMatch(
    {
      ...recordingEvidence,
      scores: {
        title: titleScore,
        artist: artistScore,
        album: albumScore,
      },
    },
    NETEASE_MATCH_RULES,
  );
  const score =
    titleScore * 0.55 +
    artistScore * 0.2 +
    albumScore * 0.1 +
    (delta === null ? 0.05 : delta <= 4 ? 0.15 : delta <= 15 ? 0.1 : 0.02);
  return {
    record,
    matchBand,
    score,
    durationDelta: delta,
    durationDeltaSigned: recordingEvidence.duration.signedDelta,
    titleScore,
    artistScore,
  };
}

function evaluateCandidate(track, record) {
  const metadataMatch = evaluateNeteaseMetadata(track, record);
  if (!metadataMatch) return null;
  const analysis = analyzeNeteaseLyrics(record);
  if (analysis.status === 'error' || !analysis.compatibility.t0) return null;
  return { ...metadataMatch, analysis };
}

function compareMatches(first, second) {
  return (
    second.score - first.score ||
    (first.durationDelta ?? Number.MAX_SAFE_INTEGER) -
      (second.durationDelta ?? Number.MAX_SAFE_INTEGER) ||
    first.record.id - second.record.id
  );
}

function rankNeteaseMetadata(track, records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => evaluateNeteaseMetadata(track, record))
    .filter(Boolean)
    .sort(compareMatches);
}

function rankNeteaseCandidates(track, records) {
  return (Array.isArray(records) ? records : [])
    .map((record) => evaluateCandidate(track, record))
    .filter(Boolean)
    .sort(compareMatches);
}

function previewLinesFor(match) {
  let lines;
  if (match.analysis.document) {
    lines = match.analysis.document.lines.map((line) => ({
      text: line.text,
      start: line.startMs / 1000,
    }));
  } else {
    lines = parseLrcLines(match.record.lrcLyrics);
    if (lines.length === 0) {
      lines = match.record.lrcLyrics
        .split(/\r?\n/u)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
    }
  }
  return lines.slice(0, 5);
}

function summarizeNeteaseCandidate(match) {
  const record = match.record;
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName,
    duration: record.duration,
    lineCount: match.analysis.lineCount,
    segmentCount: match.analysis.segmentCount,
    previewLines: previewLinesFor(match),
    capability: match.analysis.capability,
    compatibility: match.analysis.compatibility,
    warnings: match.analysis.warnings,
    matchBand: match.matchBand,
    matchReasons: [],
    durationDelta: match.durationDelta,
    durationDeltaSigned: match.durationDeltaSigned,
    previewFingerprint: fingerprintNeteaseRecord(record),
  };
}

module.exports = {
  evaluateNeteaseMetadata,
  fingerprintNeteaseRecord,
  rankNeteaseCandidates,
  rankNeteaseMetadata,
  summarizeNeteaseCandidate,
};
