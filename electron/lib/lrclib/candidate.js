'use strict';

const { parseLrcLines } = require('./lrc.js');
const { parseLyricsfile } = require('./lyricsfile.js');
const { fingerprintLrclibRecord } = require('./record.js');
const {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
} = require('../lyricsProviders/recordingPolicy.js');
const {
  durationDelta,
  signedDurationDelta,
  textMatchScore,
} = require('./matching.js');

const BAND_ORDER = Object.freeze({ exact: 0, strong: 1, related: 2 });
const CAPABILITY_ORDER = Object.freeze({
  T2: 4,
  T1: 3,
  T0: 2,
  instrumental: 1,
  unsupported: 0,
});
const SUMMARY_TEXT_LIMIT = 256;
const PREVIEW_LINE_TEXT_LIMIT = 240;
const PREVIEW_TOTAL_TEXT_LIMIT = 800;
const PROVIDER_DURATION_CONFLICT_TOLERANCE_SECONDS = 15;
const LANGUAGE_TAG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const LRCLIB_MATCH_RULES = Object.freeze({
  exact: { title: 1, artist: 1, duration: 4 },
  strong: { title: 1, artist: 0.8, duration: 45 },
});

function boundedSummaryText(value, maxLength) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function normalizedLanguage(value) {
  if (typeof value !== 'string' || value.length > 35) return null;
  return LANGUAGE_TAG_RE.test(value) ? value : null;
}

function boundedPreviewLines(lines, lineLimit) {
  let remaining = PREVIEW_TOTAL_TEXT_LIMIT;
  const result = [];
  for (const line of lines.slice(0, lineLimit)) {
    if (remaining <= 0) break;
    const text = boundedSummaryText(
      line.text,
      Math.min(PREVIEW_LINE_TEXT_LIMIT, remaining),
    );
    result.push({ start: line.start, text });
    remaining -= text.length;
  }
  return result;
}

function plainLyricsLines(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ start: null, text }));
}

function legacyAnalysis(record, warnings = ['lyricsfile-missing']) {
  const syncedLines = parseLrcLines(record.syncedLyrics);
  const plainLines = plainLyricsLines(record.plainLyrics);
  const hasSynced = syncedLines.length > 0;
  const hasPlain = plainLines.length > 0;
  const level = record.instrumental
    ? 'instrumental'
    : hasSynced
      ? 'T1'
      : hasPlain
        ? 'T0'
        : 'unsupported';
  const previewLines = record.instrumental
    ? []
    : hasSynced
      ? syncedLines
      : plainLines;
  return {
    language: null,
    capability: { level, partial: false },
    compatibility: {
      t0: !record.instrumental && hasPlain,
      t1: !record.instrumental && hasSynced,
      t2: false,
    },
    warnings: record.instrumental
      ? [...warnings, 'instrumental-record']
      : warnings,
    lineCount: previewLines.length,
    segmentCount: 0,
    timingEnd: hasSynced ? (syncedLines.at(-1)?.start ?? null) : null,
    previewLines,
    autoUsable: !record.instrumental && hasSynced,
  };
}

function unsupportedAnalysis(warning) {
  return {
    language: null,
    capability: { level: 'unsupported', partial: false },
    compatibility: { t0: false, t1: false, t2: false },
    warnings: [warning],
    lineCount: 0,
    segmentCount: 0,
    timingEnd: null,
    previewLines: [],
    autoUsable: false,
  };
}

function lyricsfileFallbackAnalysis(record, warning) {
  const fallback = legacyAnalysis(record, []);
  if (fallback.capability.level === 'unsupported') {
    return unsupportedAnalysis(warning);
  }
  if (fallback.capability.level === 'instrumental') {
    return { ...fallback, warnings: [warning, 'instrumental-record'] };
  }
  return { ...fallback, warnings: [`${warning}-fallback`] };
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
    return lyricsfileFallbackAnalysis(record, 'unsupported-lyricsfile-version');
  }
  if (parsed.status === 'error') {
    return lyricsfileFallbackAnalysis(record, 'invalid-lyricsfile');
  }

  const timedPreviewLines = parsed.document.lines.map((line) => ({
    start: line.startMs / 1000,
    text: line.text,
  }));
  const plainPreviewLines = plainLyricsLines(parsed.document.plain);
  const previewLines =
    timedPreviewLines.length > 0 ? timedPreviewLines : plainPreviewLines;
  const segmentCount = parsed.document.lines.reduce(
    (count, line) => count + line.words.length,
    0,
  );
  return {
    language: normalizedLanguage(parsed.document.metadata.language),
    capability: parsed.capability,
    compatibility: parsed.compatibility,
    warnings: parsed.warnings,
    lineCount: previewLines.length,
    segmentCount,
    timingEnd:
      parsed.document.lines.reduce(
        (latest, line) => Math.max(latest, line.endMs ?? line.startMs),
        0,
      ) / 1000 || null,
    previewLines,
    autoUsable:
      !record.instrumental &&
      (parsed.compatibility.t2 || parsed.compatibility.t1),
  };
}

function durationEvidence(identity, record, timingEnd) {
  const providerDelta = durationDelta(identity.duration, record.duration);
  const providerDurationInconsistent =
    Number.isFinite(record.duration) &&
    Number.isFinite(timingEnd) &&
    timingEnd > record.duration + PROVIDER_DURATION_CONFLICT_TOLERANCE_SECONDS;
  const effectiveDurationDelta = providerDurationInconsistent
    ? durationDelta(identity.duration, timingEnd)
    : providerDelta;
  return {
    providerDelta,
    effectiveDurationDelta,
    providerDurationInconsistent,
  };
}

function titleMatchScore(identity, record) {
  return Math.max(
    textMatchScore(identity.trackName, record.trackName),
    ...(Array.isArray(identity.titleAliases)
      ? identity.titleAliases.map((alias) =>
          textMatchScore(alias, record.trackName),
        )
      : []),
  );
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
  const recordingEvidence = compareLyricsRecordingIdentity(identity, record);
  const titleScore = Math.max(
    recordingEvidence.scores.title,
    titleMatchScore(identity, record),
  );
  const artistScore = recordingEvidence.scores.artist;
  const albumScore = recordingEvidence.scores.album;
  const analysis = analyzeLrclibRecord(record);
  const duration = durationEvidence(identity, record, analysis.timingEnd);
  const delta = duration.providerDelta;
  const versionMismatch = recordingEvidence.versionMismatch;
  const band = classifyLyricsMatch(
    {
      ...recordingEvidence,
      scores: {
        ...recordingEvidence.scores,
        title: titleScore,
        artist: artistScore,
        album: albumScore,
      },
      duration: {
        ...recordingEvidence.duration,
        delta: duration.effectiveDurationDelta,
      },
    },
    LRCLIB_MATCH_RULES,
  );
  const warnings = [
    ...analysis.warnings,
    ...(duration.providerDurationInconsistent
      ? ['provider-duration-inconsistent']
      : []),
    ...(versionMismatch ? ['version-mismatch'] : []),
  ];

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
    albumScore,
    versionMismatch,
    durationDelta: delta,
    effectiveDurationDelta: duration.effectiveDurationDelta,
    durationDeltaSigned: signedDurationDelta(
      identity.duration,
      record.duration,
    ),
    ...analysis,
    warnings,
    autoUsable: band !== 'related' && analysis.autoUsable,
  };
}

function capabilityOrder(match) {
  return CAPABILITY_ORDER[match.capability.level] ?? 0;
}

function identityScore(match) {
  return match.titleScore + match.artistScore;
}

function compareCandidateMatches(first, second) {
  const firstRelated = first.band === 'related' ? 1 : 0;
  const secondRelated = second.band === 'related' ? 1 : 0;
  const groupOrder = firstRelated - secondRelated;
  if (groupOrder !== 0) return groupOrder;

  if (!firstRelated) {
    return (
      capabilityOrder(second) - capabilityOrder(first) ||
      BAND_ORDER[first.band] - BAND_ORDER[second.band] ||
      identityScore(second) - identityScore(first) ||
      (first.effectiveDurationDelta ?? Number.MAX_SAFE_INTEGER) -
        (second.effectiveDurationDelta ?? Number.MAX_SAFE_INTEGER) ||
      first.record.id - second.record.id
    );
  }

  return (
    second.titleScore - first.titleScore ||
    Number(first.versionMismatch) - Number(second.versionMismatch) ||
    second.artistScore - first.artistScore ||
    second.albumScore - first.albumScore ||
    (first.effectiveDurationDelta ?? Number.MAX_SAFE_INTEGER) -
      (second.effectiveDurationDelta ?? Number.MAX_SAFE_INTEGER) ||
    capabilityOrder(second) - capabilityOrder(first) ||
    first.record.id - second.record.id
  );
}

function rankLrclibCandidateMatches(identity, records) {
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()]
    .map((record) => evaluateLrclibCandidate(identity, record))
    .sort(compareCandidateMatches);
}

function summarizeLrclibCandidate(match, previewLineLimit = 5) {
  const record = match.record;
  return {
    id: record.id,
    trackName: boundedSummaryText(record.trackName, SUMMARY_TEXT_LIMIT),
    artistName: boundedSummaryText(record.artistName, SUMMARY_TEXT_LIMIT),
    albumName: boundedSummaryText(record.albumName, SUMMARY_TEXT_LIMIT),
    duration: record.duration,
    instrumental: record.instrumental,
    ...(match.language ? { language: match.language } : {}),
    lineCount: match.lineCount,
    segmentCount: match.segmentCount,
    previewLines: boundedPreviewLines(match.previewLines, previewLineLimit),
    capability: match.capability,
    compatibility: match.compatibility,
    warnings: match.warnings,
    matchBand: match.band,
    matchReasons: match.matchReasons,
    durationDelta: match.durationDelta,
    durationDeltaSigned: match.durationDeltaSigned,
    previewFingerprint: fingerprintLrclibRecord(record),
  };
}

module.exports = {
  analyzeLrclibRecord,
  evaluateLrclibCandidate,
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
};
