'use strict';
const wanakana = require('wanakana');
const { comparisonWords } = require('../lyricsAcoustic/english.cjs');
const {
  conservativeRules,
} = require('../lyricsAlignmentCandidates/qualityConservative.cjs');
// Frozen before inspecting fresh model results. No VAD and no retiming.
const contentRules = Object.freeze({
  maxContradictionCoverage: conservativeRules.maxContradictionCoverage,
  minAsrCharacters: conservativeRules.minAsrCharacters,
  paddingMs: 500,
  extraRatioWarning: 0.35,
  minExtraCharacters: 3,
});
function normalize(text, language) {
  if (language === 'en') return comparisonWords(text);
  const normalized = text.normalize('NFKC').toLowerCase();
  return [
    ...(language === 'ja'
      ? wanakana.toHiragana(normalized)
      : normalized
    ).replace(/[^\p{L}\p{M}\p{N}]/gu, ''),
  ];
}
function lcsLength(a, b) {
  if ((a.length + 1) * (b.length + 1) > 4500000)
    throw Error('content LCS budget');
  const row = new Uint16Array(b.length + 1);
  for (const char of a) {
    let diagonal = 0;
    for (let j = 0; j < b.length; j++) {
      const old = row[j + 1];
      row[j + 1] = char === b[j] ? diagonal + 1 : Math.max(row[j + 1], row[j]);
      diagonal = old;
    }
  }
  return row[b.length];
}
function checkContent(line, evidence) {
  const { language, windowStartMs, offsetMs, durationMs, spans } = evidence;
  if (
    !['zh', 'ja', 'en'].includes(language) ||
    !Number.isSafeInteger(windowStartMs) ||
    !Number.isSafeInteger(offsetMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > 30000 ||
    !Number.isSafeInteger(line.startMs) ||
    !Number.isSafeInteger(line.endMs) ||
    line.endMs <= line.startMs ||
    !Array.isArray(spans) ||
    spans.length > 4096
  )
    throw Error('content evidence');
  const source = normalize(line.text, language),
    target = [];
  const englishText = [],
    englishTimed = [];
  let previous = -1,
    bytes = 0,
    timedCharacters = 0;
  for (const span of spans) {
    if (
      typeof span.text !== 'string' ||
      !Number.isFinite(span.start) ||
      span.start < 0 ||
      span.start < previous ||
      span.start * 1000 > durationMs
    )
      throw Error('content clock');
    previous = span.start;
    bytes += span.text.length;
    if (bytes > 32768) throw Error('content text budget');
    const timed = span.boundary !== false,
      clock = Math.round(span.start * 1000) + windowStartMs + offsetMs;
    // Untimed text stays in compatibility, but cannot provide evidence to reject.
    if (
      timed &&
      (clock < line.startMs - contentRules.paddingMs ||
        clock > line.endMs + contentRules.paddingMs)
    )
      continue;
    if (language === 'en') {
      englishText.push(span.text);
      if (timed) englishTimed.push(span.text);
    }
    const chars = normalize(span.text, language);
    target.push(...chars);
    if (timed) timedCharacters += chars.length;
  }
  if (language === 'en') {
    target.splice(
      0,
      target.length,
      ...normalize(englishText.join(''), language),
    );
    timedCharacters = normalize(englishTimed.join(''), language).length;
  }
  const matched = lcsLength(source, target),
    compatibility = source.length ? matched / source.length : 0,
    extra = Math.max(0, target.length - matched);
  const timedCoverage =
    language === 'en' && source.length
      ? lcsLength(source, normalize(englishTimed.join(''), language)) /
        source.length
      : compatibility;
  const reject =
    source.length > 0 &&
    timedCharacters >=
      (language === 'en' ? 4 : contentRules.minAsrCharacters) &&
    compatibility <= contentRules.maxContradictionCoverage;
  return {
    evidenceState: reject
      ? 'contradiction'
      : timedCharacters >=
            (language === 'en' ? 2 : contentRules.minAsrCharacters) &&
          timedCoverage >= 0.8
        ? 'supported'
        : 'insufficient',
    reject,
    compatibility,
    asrCharacters: timedCharacters,
    sourceCharacters: source.length,
    matchedCharacters: matched,
    extraCharacters: extra,
    extraContentWarning:
      compatibility >= 0.8 &&
      timedCharacters >= contentRules.minAsrCharacters &&
      extra >= contentRules.minExtraCharacters &&
      extra / Math.max(1, target.length) >= contentRules.extraRatioWarning,
  };
}
module.exports = { checkContent, contentRules };
