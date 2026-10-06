export const PREVIEW_SEGMENT_SECONDS = 30;
const FALLBACK_START_RATIO = 0.3;

function firstChorusStartSeconds(structure) {
  const sections = Array.isArray(structure?.sections) ? structure.sections : [];
  const chorus = sections.find(
    (section) =>
      section?.role === 'chorus' &&
      Number.isFinite(section.startMs) &&
      section.startMs >= 0,
  );
  return chorus ? chorus.startMs / 1000 : null;
}

// Starts at the first analysed chorus, else 30% in; a short track or a late
// chorus slides back so the window still fits before the end.
export function resolvePreviewSegment({ durationSeconds, structure } = {}) {
  const duration =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : null;
  const chorusStart = firstChorusStartSeconds(structure);
  const source = chorusStart === null ? 'estimated' : 'chorus';
  if (duration === null) {
    const start = chorusStart ?? 0;
    return { start, end: start + PREVIEW_SEGMENT_SECONDS, source };
  }

  const length = Math.min(PREVIEW_SEGMENT_SECONDS, duration);
  const preferredStart = chorusStart ?? duration * FALLBACK_START_RATIO;
  const start = Math.max(0, Math.min(preferredStart, duration - length));
  return { start, end: start + length, source };
}
