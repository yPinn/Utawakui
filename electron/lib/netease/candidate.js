'use strict';

const crypto = require('crypto');
const OpenCCSimplified = require('opencc-js/t2cn');
const OpenCCTraditional = require('opencc-js/cn2t');
const {
  durationDelta,
  signedDurationDelta,
  textMatchScore,
  versionMismatchPenalty,
} = require('../lrclib/matching.js');
const { parseLrcLines } = require('../lrclib/lrc.js');
const { analyzeNeteaseLyrics } = require('./yrc.js');

const toSimplified = OpenCCSimplified.Converter({ from: 'tw', to: 'cn' });
const toTraditional = OpenCCTraditional.Converter({ from: 'cn', to: 'tw' });

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
    ...values.flatMap((value) => [
      textMatchScore(expected, value),
      textMatchScore(toSimplified(expected), toSimplified(value)),
      textMatchScore(toTraditional(expected), toTraditional(value)),
    ]),
  );
}

function evaluateNeteaseMetadata(track, record) {
  const expectedTitle = track?.title ?? track?.trackName;
  const expectedArtist = track?.artist ?? track?.artistName;
  const expectedAlbum = track?.album ?? track?.albumName;
  const expectedDuration = track?.duration;
  const titleScore = bestTextScore(expectedTitle, [
    record.trackName,
    ...record.aliases,
    ...record.translatedTitles,
  ]);
  const artistScore = bestTextScore(expectedArtist, record.artists);
  const albumScore = expectedAlbum
    ? textMatchScore(expectedAlbum, record.albumName)
    : 1;
  const delta = durationDelta(expectedDuration, record.duration);
  const versionPenalty = versionMismatchPenalty(expectedTitle, record);
  if (
    titleScore < 0.75 ||
    artistScore < 0.35 ||
    (delta !== null && delta > 90) ||
    versionPenalty > 0
  ) {
    return null;
  }
  const matchBand =
    titleScore === 1 &&
    artistScore === 1 &&
    albumScore === 1 &&
    (delta === null || delta <= 4)
      ? 'exact'
      : titleScore >= 0.82 &&
          artistScore >= 0.8 &&
          (delta === null || delta <= 15)
        ? 'strong'
        : 'related';
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
    durationDeltaSigned: signedDurationDelta(expectedDuration, record.duration),
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
