// Lossless suggestions only: linguistic reading spans are not sung timestamps.
export function suggestSplitOffsets(text) {
  return [...String(text).matchAll(/\s+/gu)].map(
    (match) => match.index + match[0].length,
  );
}

export function timingSegmentsFor(line, readingLine = null) {
  if (!line || typeof line.text !== 'string') return [];
  const existing = line.segments;
  if (
    Array.isArray(existing) &&
    existing.length > 0 &&
    existing.every((s) => typeof s.text === 'string' && s.text.length > 0) &&
    existing.map((s) => s.text).join('') === line.text
  ) {
    return existing.map((segment) => ({ ...segment }));
  }
  const spans = readingLine?.segments;
  const aligned =
    readingLine?.lineId === line.lineId &&
    readingLine?.text === line.text &&
    Array.isArray(spans) &&
    spans.length > 1 &&
    spans.every((s) => typeof s.t === 'string' && s.t.length > 0) &&
    spans.map((s) => s.t).join('') === line.text;
  const offsets = [0, ...suggestSplitOffsets(line.text), line.text.length];
  const parts = aligned
    ? spans.map((s) => s.t)
    : offsets
        .slice(0, -1)
        .map((start, index) => line.text.slice(start, offsets[index + 1]))
        .filter(Boolean);
  return parts.map((text, index) => ({
    segmentId: `${line.lineId}_s_${index}`,
    text,
    startMs: index === 0 ? line.startMs : null,
    endMs: index === parts.length - 1 ? line.endMs : null,
  }));
}

export function canEditTimingLine(line, readingLine = null) {
  return Boolean(
    line &&
    Number.isFinite(line.startMs) &&
    Number.isFinite(line.endMs) &&
    line.endMs > line.startMs &&
    timingSegmentsFor(line, readingLine).length > 1,
  );
}
