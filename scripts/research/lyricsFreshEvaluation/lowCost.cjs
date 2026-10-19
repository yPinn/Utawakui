'use strict';
const OpenCC = require('opencc-js/t2cn');
const { checkContent } = require('./content.cjs');
const { textCuts, lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const { alignStarts } = require('../lyricsAlignmentCandidates/protocol.cjs');
const {
  buildAcousticChunks,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const simplify = OpenCC.Converter({ from: 'tw', to: 'cn' });
const lowCostRules = Object.freeze({
  neighborRadiusMs: 1500,
  minNeighborCoverage: 0.8,
  minNeighborMatches: 4,
});
function checkLowCost(line, evidence, profile) {
  if (
    !['baseline', 'script-fold', 'neighbor-rescue', 'advisory'].includes(
      profile,
    )
  )
    throw Error('low-cost profile');
  const fold = (text) => (evidence.language === 'zh' ? simplify(text) : text);
  const l = profile === 'baseline' ? line : { ...line, text: fold(line.text) };
  const e =
    profile === 'baseline'
      ? evidence
      : {
          ...evidence,
          spans: evidence.spans.map((s) => ({ ...s, text: fold(s.text) })),
        };
  const result = checkContent(l, e);
  let rescuedByNeighbor = false;
  if (profile === 'neighbor-rescue' && result.reject) {
    const left = line.startMs - lowCostRules.neighborRadiusMs,
      right = line.endMs + lowCostRules.neighborRadiusMs;
    const timedSpans = e.spans.filter(
      (s) =>
        s.boundary !== false &&
        s.start * 1000 + e.windowStartMs + e.offsetMs >= left &&
        s.start * 1000 + e.windowStartMs + e.offsetMs <= right,
    );
    const nearby = checkContent(
      {
        ...l,
        startMs: Math.max(0, l.startMs - lowCostRules.neighborRadiusMs),
        endMs: Math.min(
          e.durationMs + e.windowStartMs + e.offsetMs,
          l.endMs + lowCostRules.neighborRadiusMs,
        ),
      },
      { ...e, spans: timedSpans },
    );
    rescuedByNeighbor =
      nearby.compatibility >= lowCostRules.minNeighborCoverage &&
      nearby.matchedCharacters >= lowCostRules.minNeighborMatches;
  }
  return {
    ...result,
    reject:
      profile === 'advisory' ? false : result.reject && !rescuedByNeighbor,
    rescuedByNeighbor,
    state:
      result.reject && !rescuedByNeighbor && profile !== 'advisory'
        ? 'contradiction'
        : 'unknown',
  };
}
function splitTimedSpan(span) {
  if (
    typeof span.text !== 'string' ||
    !Number.isFinite(span.start) ||
    !Number.isFinite(span.end) ||
    span.start < 0 ||
    span.end < span.start
  )
    throw Error('model span');
  const parts = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      span.text,
    ),
  ];
  if (parts.length <= 1 || span.end === span.start) return [span];
  // Exploratory interpolation, not measured phonetic onsets. Never production T2.
  return parts.map((p, i) => ({
    text: p.segment,
    start: span.start + ((span.end - span.start) * i) / parts.length,
    end: span.start + ((span.end - span.start) * (i + 1)) / parts.length,
  }));
}
function timingChunks(
  canonical,
  language,
  captured,
  recorded,
  profile,
  baselineStarts,
  expectedWindows,
) {
  if (
    !['captured-exact', 'span-interpolation', 'disagreement-fallback'].includes(
      profile,
    ) ||
    captured.length !== recorded.length ||
    !Array.isArray(expectedWindows) ||
    expectedWindows.length !== recorded.length ||
    recorded.some((w, i) =>
      ['index', 'startMs', 'endMs', 'lineIds'].some(
        (k) => JSON.stringify(w[k]) !== JSON.stringify(expectedWindows[i][k]),
      ),
    )
  )
    throw Error('timing profile/context');
  const startsByLine = new Map();
  for (let i = 0; i < captured.length; i++) {
    const entry = captured[i],
      w = recorded[i];
    if (
      entry.request.prefix !== `w${w.index}` ||
      !Number.isFinite(entry.request.durationSeconds) ||
      Math.abs(entry.request.durationSeconds * 1000 - (w.endMs - w.startMs)) >
        100
    )
      throw Error('timing window');
    const rows = canonical.lines.filter((l) => {
      try {
        lexicalUnits(l.text, language);
        return l.startMs >= w.startMs && l.endMs <= w.endMs;
      } catch {
        return false;
      }
    });
    if (
      entry.request.text !== rows.map((l) => l.text).join('\n') ||
      entry.request.language !== language
    )
      throw Error('timing text context');
    const mapped = alignStarts(
      rows,
      profile === 'captured-exact'
        ? entry.spans
        : entry.spans.flatMap(splitTimedSpan),
      {
        mode: 'exact',
        language,
        windowStartMs: w.startMs,
        offsetMs: 0,
      },
    );
    for (const [id, starts] of mapped)
      if (w.lineIds.includes(id)) startsByLine.set(id, starts);
  }
  return canonical.lines.map((line, index) => {
    let starts = startsByLine.get(line.lineId) ?? new Map();
    if (profile === 'disagreement-fallback') {
      const baseline = baselineStarts[index];
      if (
        [...starts].some(
          ([from, time]) =>
            from > 0 &&
            baseline.has(from) &&
            Math.abs(time - baseline.get(from)) > 500,
        )
      )
        starts = new Map(
          [...baseline].map(([from, time]) => [from, Math.round(time)]),
        );
    }
    return buildAcousticChunks(
      line.text,
      textCuts(line.text, language),
      starts,
      line.startMs,
      line.endMs,
      line.lineId,
    );
  });
}
module.exports = { checkLowCost, splitTimedSpan, lowCostRules, timingChunks };
