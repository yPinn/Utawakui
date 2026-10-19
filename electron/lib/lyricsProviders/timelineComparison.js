'use strict';

const crypto = require('node:crypto');
const { chineseScriptForms } = require('../musicIdentity/queryVariants.js');

const PROFILE = 'unique-line-starts-v1';
const MAX_SAMPLES = 128;
const MAX_LINES = 5000;
const MAX_TEXT_CHARS = 2000;
const MAX_TIME_MS = 604_800_000;
const MIN_MATCHES = 5;
const MIN_OVERLAP = 0.5;
const MIN_SPAN_MS = 10_000;
const NOTICE_THRESHOLD_MS = 1000;
const MAX_OFFSET_MS = 15_000;
const MAX_SPREAD_MS = 500;
const CREDIT_PREFIX =
  /^\s*(?:作词|作曲|编曲|词曲|演唱|歌手|制作|lyrics?(?:\s+by)?|composer|composed\s+by|arrang(?:ed|ement)|written\s+by)\s*[:：]/iu;

function lineKey(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_CHARS) return null;
  const normalized = chineseScriptForms(text.normalize('NFKC')).simplified;
  if (CREDIT_PREFIX.test(normalized)) return null;
  const key = normalized.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
  if (Array.from(key).length < 4) return null;
  return crypto.createHash('sha256').update(key).digest('hex');
}

function validTime(time) {
  return Number.isSafeInteger(time) && time >= 0 && time <= MAX_TIME_MS;
}

// Main-only, bounded signatures from already hydrated lyrics. Repeated text is
// counted before filtering timestamps, so an untimed repeat cannot look unique.
function buildLyricsTimelineEvidence(lines) {
  if (!Array.isArray(lines) || lines.length > MAX_LINES) return null;
  const counts = new Map();
  const entries = [];
  let textChars = 0;
  for (const line of lines) {
    textChars += typeof line?.text === 'string' ? line.text.length : 0;
    if (textChars > 100_000) return null;
    const key = lineKey(line?.text);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    const time =
      line.startMs ??
      (Number.isFinite(line.start) ? Math.round(line.start * 1000) : null);
    if (validTime(time)) entries.push({ key, startMs: time });
  }
  const unique = entries.filter(({ key }) => counts.get(key) === 1);
  if (!unique.length) return null;
  const count = Math.min(MAX_SAMPLES, unique.length);
  const samples = Array.from(
    { length: count },
    (_, i) =>
      unique[
        count === 1 ? 0 : Math.round((i * (unique.length - 1)) / (count - 1))
      ],
  );
  return { profile: PROFILE, samples };
}

function isLyricsTimelineEvidence(value) {
  if (
    value?.profile !== PROFILE ||
    !Array.isArray(value.samples) ||
    value.samples.length > MAX_SAMPLES ||
    value.samples.length < MIN_MATCHES
  )
    return false;
  const keys = new Set();
  let previous = -1;
  return value.samples.every((sample) => {
    if (
      !/^[a-f0-9]{64}$/u.test(sample?.key) ||
      !validTime(sample.startMs) ||
      sample.startMs < previous ||
      keys.has(sample.key)
    )
      return false;
    previous = sample.startMs;
    keys.add(sample.key);
    return true;
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function compareLyricsTimelines(reference, candidate) {
  if (
    !isLyricsTimelineEvidence(reference) ||
    !isLyricsTimelineEvidence(candidate)
  )
    return null;
  const byKey = new Map(
    candidate.samples.map((sample, index) => [
      sample.key,
      { ...sample, index },
    ]),
  );
  const matched = reference.samples.flatMap((sample) => {
    const other = byKey.get(sample.key);
    return other
      ? [
          {
            reference: sample.startMs,
            candidate: other.startMs,
            index: other.index,
          },
        ]
      : [];
  });
  if (
    matched.length < MIN_MATCHES ||
    matched.length /
      Math.max(reference.samples.length, candidate.samples.length) <
      MIN_OVERLAP ||
    matched.some((entry, i) => i > 0 && entry.index <= matched[i - 1].index)
  )
    return null;
  if (
    matched.at(-1).reference - matched[0].reference < MIN_SPAN_MS ||
    matched.at(-1).candidate - matched[0].candidate < MIN_SPAN_MS
  )
    return null;
  const deltas = matched.map((entry) => entry.candidate - entry.reference);
  if (
    Math.max(...deltas) - Math.min(...deltas) > MAX_SPREAD_MS ||
    deltas.some((delta) => Math.abs(delta) > MAX_OFFSET_MS)
  )
    return null;
  const offsetMs = Math.round(median(deltas));
  return Math.abs(offsetMs) > NOTICE_THRESHOLD_MS
    ? { offsetMs, matchedLineCount: matched.length }
    : null;
}

function projectLyricsCandidateResult(result) {
  const projected = { ...result };
  delete projected.timelineEvidenceById;
  return projected;
}

module.exports = {
  buildLyricsTimelineEvidence,
  isLyricsTimelineEvidence,
  compareLyricsTimelines,
  projectLyricsCandidateResult,
};
