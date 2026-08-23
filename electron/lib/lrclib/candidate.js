'use strict';

const { parseLrcLines } = require('./lrc.js');
const { parseLyricsfile } = require('./lyricsfile.js');
const {
  durationDelta,
  signedDurationDelta,
  textMatchScore,
  versionMismatchPenalty,
} = require('./matching.js');

const BAND_ORDER = Object.freeze({ exact: 0, strong: 1, related: 2 });
const CAPABILITY_ORDER = Object.freeze({
  T2: 4,
  T1: 3,
  T0: 2,
  instrumental: 1,
  unsupported: 0,
});

function legacyAnalysis(record) {
  const syncedLines = parseLrcLines(record.syncedLyrics);
  const hasSynced = syncedLines.length > 0;
  const hasPlain =
    typeof record.plainLyrics === 'string' && record.plainLyrics.length > 0;
  const level = record.instrumental
    ? 'instrumental'
    : hasSynced
      ? 'T1'
      : hasPlain
        ? 'T0'
        : 'unsupported';
  return {
    capability: { level, partial: false },
    compatibility: {
      t0: !record.instrumental && hasPlain,
      t1: !record.instrumental && hasSynced,
      t2: false,
    },
    warnings: record.instrumental
      ? ['lyricsfile-missing', 'instrumental-record']
      : ['lyricsfile-missing'],
    lineCount: syncedLines.length,
    segmentCount: 0,
    previewLines: syncedLines,
    autoUsable: !record.instrumental && hasSynced,
  };
}

function analyzeLrclibRecord(record) {
  if (
    typeof record.lyricsfile !== 'string' ||
    record.lyricsfile.trim().length === 0
  ) {
    return legacyAnalysis(record);
  }

  const parsed = parseLyricsfile(record.lyricsfile);
  if (parsed.status === 'unsupported') {
    return {
      capability: { level: 'unsupported', partial: false },
      compatibility: { t0: false, t1: false, t2: false },
      warnings: ['unsupported-lyricsfile-version'],
      lineCount: 0,
      segmentCount: 0,
      previewLines: [],
      autoUsable: false,
    };
  }
  if (parsed.status === 'error') {
    return {
      capability: { level: 'unsupported', partial: false },
      compatibility: { t0: false, t1: false, t2: false },
      warnings: ['invalid-lyricsfile'],
      lineCount: 0,
      segmentCount: 0,
      previewLines: [],
      autoUsable: false,
    };
  }

  const segmentCount = parsed.document.lines.reduce(
    (count, line) => count + line.words.length,
    0,
  );
  return {
    capability: parsed.capability,
    compatibility: parsed.compatibility,
    warnings: parsed.warnings,
    lineCount: parsed.document.lines.length,
    segmentCount,
    previewLines: parsed.document.lines.map((line) => ({
      start: line.startMs / 1000,
      text: line.text,
    })),
    autoUsable:
      !record.instrumental &&
      (parsed.compatibility.t2 || parsed.compatibility.t1),
  };
}

function buildMatchReasons(identity, record, scores) {
  const reasons = [];
  if (scores.titleScore === 1) reasons.push('title-exact');
  else if (scores.titleScore >= 0.82) reasons.push('title-close');
  if (scores.artistScore === 1) reasons.push('artist-exact');
  else if (scores.artistScore >= 0.8) reasons.push('artist-close');
  if (
    identity.albumName &&
    textMatchScore(identity.albumName, record.albumName) === 1
  ) {
    reasons.push('album-exact');
  }
  if (scores.durationDelta === 0) reasons.push('duration-exact');
  else if (scores.durationDelta !== null && scores.durationDelta <= 15) {
    reasons.push('duration-close');
  }
  return reasons;
}

function evaluateLrclibCandidate(identity, record) {
  const titleScore = textMatchScore(identity.trackName, record.trackName);
  const artistScore = textMatchScore(identity.artistName, record.artistName);
  const delta = durationDelta(identity.duration, record.duration);
  const versionMismatch =
    versionMismatchPenalty(identity.trackName, record) > 0;
  const exactDuration = delta === null || delta <= 4;
  const strongDuration = delta === null || delta <= 45;
  const band =
    titleScore === 1 && artistScore === 1 && exactDuration && !versionMismatch
      ? 'exact'
      : titleScore === 1 &&
          artistScore >= 0.8 &&
          strongDuration &&
          !versionMismatch
        ? 'strong'
        : 'related';
  const analysis = analyzeLrclibRecord(record);
  const warnings = versionMismatch
    ? [...analysis.warnings, 'version-mismatch']
    : analysis.warnings;

  return {
    record,
    band,
    matchReasons: buildMatchReasons(identity, record, {
      titleScore,
      artistScore,
      durationDelta: delta,
    }),
    titleScore,
    artistScore,
    durationDelta: delta,
    durationDeltaSigned: signedDurationDelta(
      identity.duration,
      record.duration,
    ),
    ...analysis,
    warnings,
    autoUsable: band !== 'related' && analysis.autoUsable,
  };
}

function rankLrclibCandidateMatches(identity, records) {
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()]
    .map((record) => evaluateLrclibCandidate(identity, record))
    .sort(
      (first, second) =>
        BAND_ORDER[first.band] - BAND_ORDER[second.band] ||
        second.titleScore +
          second.artistScore -
          (first.titleScore + first.artistScore) ||
        (first.durationDelta ?? Number.MAX_SAFE_INTEGER) -
          (second.durationDelta ?? Number.MAX_SAFE_INTEGER) ||
        (CAPABILITY_ORDER[second.capability.level] ?? 0) -
          (CAPABILITY_ORDER[first.capability.level] ?? 0) ||
        first.record.id - second.record.id,
    );
}

module.exports = {
  analyzeLrclibRecord,
  evaluateLrclibCandidate,
  rankLrclibCandidateMatches,
};
