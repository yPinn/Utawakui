'use strict';
const wanakana = require('wanakana');
const { lexicalUnits, textCuts } = require('../lyricsAcoustic/protocol.cjs');
const { uniqueLcs } = require('./protocol.cjs');
// Frozen before reading any new scored results. These are research policies,
// not calibrated probabilities of correctness or production defaults.
const qualityRules = Object.freeze({
  frameMs: 32,
  speechThreshold: 0.5,
  minActiveRatio: 0.1,
  activityRadiusMs: 256,
  contentPaddingMs: 500,
  minContentCoverage: 0.5,
  minContentCharacters: 3,
  clockToleranceMs: 600,
});
const profiles = Object.freeze([
  'baseline',
  'activity',
  'content',
  'combined',
  'combined-time',
]);
function normalize(text, language) {
  const value = text.normalize('NFKC').toLowerCase();
  return (language === 'ja' ? wanakana.toHiragana(value) : value).replace(
    /[^\p{L}\p{M}\p{N}]/gu,
    '',
  );
}
function compatibleLength(source, target) {
  if ((source.length + 1) * (target.length + 1) > 4500000)
    throw Error('quality alignment budget');
  const row = new Uint16Array(target.length + 1);
  for (const unit of source) {
    let diagonal = 0;
    for (let j = 0; j < target.length; j++) {
      const prior = row[j + 1];
      row[j + 1] =
        unit.char === target[j].char
          ? diagonal + 1
          : Math.max(row[j + 1], row[j]);
      diagonal = prior;
    }
  }
  return row[target.length];
}
function assessLine(line, starts, evidence, profile) {
  if (!profiles.includes(profile)) throw Error('quality profile');
  const {
    language,
    windowStartMs,
    offsetMs,
    durationMs,
    probabilities,
    asrSpans,
  } = evidence;
  if (
    !['zh', 'ja'].includes(language) ||
    !Number.isSafeInteger(windowStartMs) ||
    !Number.isSafeInteger(offsetMs) ||
    !Number.isFinite(durationMs) ||
    !Number.isSafeInteger(durationMs * 16) ||
    durationMs <= 0 ||
    durationMs > 30000 ||
    !Array.isArray(probabilities) ||
    probabilities.length !== Math.ceil(durationMs / 32) ||
    probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1) ||
    !Array.isArray(asrSpans) ||
    asrSpans.length > 4096
  )
    throw Error('quality evidence');
  if (
    !(starts instanceof Map) ||
    !Number.isSafeInteger(line.startMs) ||
    !Number.isSafeInteger(line.endMs) ||
    line.endMs <= line.startMs
  )
    throw Error('quality line');
  const source = [];
  for (const unit of lexicalUnits(line.text, language))
    for (const char of normalize(unit.text, language))
      source.push({ char, from: unit.from });
  const left = line.startMs - windowStartMs - offsetMs,
    right = line.endMs - windowStartMs - offsetMs;
  let active = 0,
    total = 0;
  for (let i = 0; i < probabilities.length; i++) {
    const overlap = Math.max(
      0,
      Math.min(right, (i + 1) * 32, durationMs) - Math.max(left, i * 32),
    );
    total += overlap;
    if (probabilities[i] >= qualityRules.speechThreshold) active += overlap;
  }
  const activeRatio = total ? active / total : 0,
    target = [];
  let count = 0,
    previous = -1;
  for (const span of asrSpans) {
    if (
      typeof span.text !== 'string' ||
      !Number.isFinite(span.start) ||
      span.start < 0 ||
      span.start < previous ||
      span.start * 1000 > durationMs
    )
      throw Error('quality evidence clock');
    previous = span.start;
    count += span.text.length;
    if (count > 32768) throw Error('quality text budget');
    if (
      span.boundary !== false &&
      (span.start * 1000 < left - qualityRules.contentPaddingMs ||
        span.start * 1000 > right + qualityRules.contentPaddingMs)
    )
      continue;
    let boundary = span.boundary !== false;
    for (const char of normalize(span.text, language)) {
      target.push({
        char,
        startMs: Math.round(span.start * 1000) + windowStartMs + offsetMs,
        boundary,
        timed: span.boundary !== false,
      });
      boundary = false;
    }
  }
  const mapping = new Map(
      [...uniqueLcs(source, target)].filter(([, j]) => target[j].timed),
    ),
    contentCoverage = source.length ? mapping.size / source.length : 0;
  const contentAccepted =
    contentCoverage >= qualityRules.minContentCoverage &&
    mapping.size >= Math.min(qualityRules.minContentCharacters, source.length);
  const cuts = textCuts(line.text, language),
    clockSupports = [];
  for (let c = 0; c < cuts.length - 1; c++) {
    const indices = source
      .map((u, i) => ({ u, i }))
      .filter(({ u }) => u.from >= cuts[c] && u.from < cuts[c + 1])
      .map(({ i }) => i);
    if (!indices.length) continue;
    const j = mapping.get(indices[0]);
    if (
      j === undefined ||
      !target[j].boundary ||
      indices.some((i, n) => mapping.get(i) !== j + n)
    )
      continue;
    clockSupports.push({ from: cuts[c], startMs: target[j].startMs });
  }
  const useActivity = ['activity', 'combined', 'combined-time'].includes(
      profile,
    ),
    useContent = ['content', 'combined', 'combined-time'].includes(profile);
  const rejectedLine =
    useActivity && activeRatio < qualityRules.minActiveRatio
      ? 'activity'
      : useContent && !contentAccepted
        ? 'content'
        : null;
  const result = new Map(),
    rejected = { activity: 0, content: 0, clock: 0 };
  for (const [from, startMs] of starts) {
    if (
      !Number.isSafeInteger(from) ||
      from < 0 ||
      from >= line.text.length ||
      !Number.isSafeInteger(startMs) ||
      startMs < line.startMs ||
      startMs >= line.endMs
    )
      throw Error('quality boundary');
    if (rejectedLine) {
      rejected[rejectedLine]++;
      continue;
    }
    // The first display anchor belongs to T1, never retime it using model evidence.
    if (from === 0) {
      result.set(from, startMs);
      continue;
    }
    const relative = startMs - windowStartMs - offsetMs;
    if (
      useActivity &&
      !probabilities.some(
        (p, i) =>
          p >= qualityRules.speechThreshold &&
          i * 32 <= relative + qualityRules.activityRadiusMs &&
          Math.min((i + 1) * 32, durationMs) >=
            relative - qualityRules.activityRadiusMs,
      )
    ) {
      rejected.activity++;
      continue;
    }
    if (profile === 'combined-time') {
      const i = source.findIndex((u) => u.from === from),
        j = mapping.get(i),
        token = j === undefined ? null : target[j];
      if (
        !token?.boundary ||
        Math.abs(token.startMs - startMs) > qualityRules.clockToleranceMs
      ) {
        rejected.clock++;
        continue;
      }
    }
    result.set(from, startMs);
  }
  return {
    starts: result,
    activeRatio,
    contentCoverage,
    contentAccepted,
    compatibilityCoverage: source.length
      ? compatibleLength(source, target) / source.length
      : 0,
    asrCharacters: target.filter((t) => t.timed).length,
    clockSupports,
    rejectedLine,
    rejected,
  };
}
module.exports = { qualityRules, profiles, assessLine };
