import limits from '../../shared/lyricsTimingValues.json' with { type: 'json' };

const time = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= limits.maxTimeMs;
export function canEditLineTiming(line) {
  return Boolean(
    line && time(line.startMs) && (line.endMs === null || time(line.endMs)),
  );
}

// Draft-time temporal checks mirror the existing canonical constraints, with
// explicit allowance for not-yet-recorded segment boundaries. Main remains the
// complete schema/identity/CAS validator at the existing save boundary.
export function validTimingDraft(document, { allowIncomplete = false } = {}) {
  if (
    !Array.isArray(document?.lines) ||
    document.lines.length > limits.maxLines
  )
    return false;
  let previousStart = null,
    total = 0;
  return document.lines.every((line, index) => {
    if (line.startMs !== null && !time(line.startMs)) return false;
    if (
      line.endMs !== null &&
      (!time(line.endMs) || line.startMs === null || line.endMs < line.startMs)
    )
      return false;
    if (line.startMs !== null) {
      if (previousStart !== null && line.startMs < previousStart) return false;
      previousStart = line.startMs;
    }
    if (
      line.endInferred === true &&
      (!time(line.endMs) || line.endMs !== document.lines[index + 1]?.startMs)
    )
      return false;
    const segments = line.segments ?? [];
    if (
      !Array.isArray(segments) ||
      segments.length > limits.maxSegmentsPerLine ||
      (segments.length && line.startMs === null)
    )
      return false;
    total += segments.length;
    if (
      total > limits.maxTotalSegments ||
      (segments.length &&
        segments.map((segment) => segment.text).join('') !== line.text)
    )
      return false;
    let lastStart = null,
      lastEnd = null;
    return segments.every((segment) => {
      const start = segment.startMs,
        end = segment.endMs;
      if (start === null ? !allowIncomplete : !time(start)) return false;
      if (end !== null && !time(end)) return false;
      if (
        start !== null &&
        (start < line.startMs ||
          (line.endMs !== null && start > line.endMs) ||
          (lastStart !== null && start < lastStart) ||
          (lastEnd !== null && start < lastEnd))
      )
        return false;
      if (
        end !== null &&
        ((start !== null && end < start) ||
          (line.endMs !== null && end > line.endMs))
      )
        return false;
      lastStart = start;
      lastEnd = end;
      return true;
    });
  });
}

export function editLineTiming(document, lineId, kind, value) {
  const fail = (reason = 'invalid-range') => ({ document: null, reason });
  const index =
    document?.lines?.findIndex((line) => line.lineId === lineId) ?? -1;
  const line = document?.lines?.[index];
  if (
    !canEditLineTiming(line) ||
    !['move', 'start', 'end'].includes(kind) ||
    !Number.isSafeInteger(value)
  )
    return fail();
  if (
    (kind === 'move' && value === 0) ||
    (kind === 'start' && value === line.startMs) ||
    (kind === 'end' && value === line.endMs && line.endInferred !== true)
  )
    return fail(null);
  const nextLine = { ...line };
  if (kind === 'move') {
    nextLine.startMs += value;
    if (nextLine.endMs !== null) nextLine.endMs += value;
    if (line.segments)
      nextLine.segments = line.segments.map((segment) => ({
        ...segment,
        startMs: segment.startMs === null ? null : segment.startMs + value,
        endMs: segment.endMs === null ? null : segment.endMs + value,
      }));
  } else nextLine[kind === 'start' ? 'startMs' : 'endMs'] = value;
  if (kind === 'move' || kind === 'end') delete nextLine.endInferred;
  if (nextLine.endMs !== null && nextLine.endMs <= nextLine.startMs)
    return fail();
  const lines = document.lines.slice();
  lines[index] = nextLine;
  if (
    index > 0 &&
    lines[index - 1].endInferred === true &&
    nextLine.startMs !== line.startMs
  )
    lines[index - 1] = { ...lines[index - 1], endMs: nextLine.startMs };
  const candidate = { ...document, lines };
  return validTimingDraft(candidate, { allowIncomplete: true })
    ? { document: candidate, reason: null }
    : fail();
}
