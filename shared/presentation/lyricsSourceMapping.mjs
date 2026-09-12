const ALIGNABLE_GLYPH_RE = /[\p{L}\p{N}]/u;

function alignableGlyphs(value) {
  const text = String(value ?? '');
  const glyphs = [];
  for (let sourceStart = 0; sourceStart < text.length;) {
    const codePoint = text.codePointAt(sourceStart);
    const glyph = String.fromCodePoint(codePoint);
    const sourceEnd = sourceStart + glyph.length;
    if (ALIGNABLE_GLYPH_RE.test(glyph)) {
      glyphs.push({
        glyph: glyph.toLocaleLowerCase(),
        sourceEnd,
        sourceStart,
      });
    }
    sourceStart = sourceEnd;
  }
  return glyphs;
}

export function alignDisplayTextsToSourceRanges(sourceValue, displayValues) {
  const sourceGlyphs = alignableGlyphs(sourceValue);
  const displayTexts = Array.isArray(displayValues) ? displayValues : [];
  let sourceCursor = 0;
  const ranges = [];

  for (const displayText of displayTexts) {
    const displayGlyphs = alignableGlyphs(displayText);
    if (displayGlyphs.length === 0) return null;
    let firstMatch = null;
    let lastMatch = null;
    for (const displayGlyph of displayGlyphs) {
      const matchIndex = sourceGlyphs.findIndex(
        (sourceGlyph, index) =>
          index >= sourceCursor && sourceGlyph.glyph === displayGlyph.glyph,
      );
      if (matchIndex === -1) return null;
      firstMatch ??= sourceGlyphs[matchIndex];
      lastMatch = sourceGlyphs[matchIndex];
      sourceCursor = matchIndex + 1;
    }
    ranges.push({
      sourceStart: firstMatch.sourceStart,
      sourceEnd: lastMatch.sourceEnd,
    });
  }

  return ranges;
}

export function interpolateSourceTimeAtOffset(segments, sourceOffset) {
  if (!Number.isFinite(sourceOffset)) return null;
  const segment = (Array.isArray(segments) ? segments : []).find(
    (candidate) =>
      Number.isFinite(candidate?.sourceStart) &&
      Number.isFinite(candidate?.sourceEnd) &&
      sourceOffset >= candidate.sourceStart &&
      sourceOffset < candidate.sourceEnd,
  );
  if (!segment || !Number.isFinite(segment.startMs)) return null;
  if (
    sourceOffset <= segment.sourceStart ||
    !Number.isFinite(segment.endMs) ||
    segment.endMs <= segment.startMs ||
    segment.sourceEnd <= segment.sourceStart
  ) {
    return segment.startMs;
  }
  const progress =
    (sourceOffset - segment.sourceStart) /
    (segment.sourceEnd - segment.sourceStart);
  return segment.startMs + (segment.endMs - segment.startMs) * progress;
}
