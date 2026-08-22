import { computed, readonly, shallowRef } from 'vue';

const draft = shallowRef(null);
const baseDocument = shallowRef(null);
const history = [];

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

export function suggestSplitOffsets(text) {
  return [...String(text).matchAll(/\s+/gu)].map(
    (match) => match.index + match[0].length,
  );
}

function splitText(text) {
  const offsets = suggestSplitOffsets(text);
  if (offsets.length === 0) return [text];
  const boundaries = [0, ...offsets, text.length];
  return boundaries
    .slice(0, -1)
    .map((start, index) => text.slice(start, boundaries[index + 1]))
    .filter(Boolean);
}

function isValidDraft(value) {
  if (!value || value.segments.length === 0) return false;
  if (value.segments.map((segment) => segment.text).join('') !== value.text) {
    return false;
  }
  return value.segments.every((segment, index) => {
    if (!Number.isFinite(segment.startMs)) return false;
    const effectiveEnd = segment.endMs;
    if (!Number.isFinite(effectiveEnd) || effectiveEnd <= segment.startMs) {
      return false;
    }
    return (
      index === value.segments.length - 1 ||
      effectiveEnd === value.segments[index + 1].startMs
    );
  });
}

const canCommit = computed(() => isValidDraft(draft.value));
const canUndo = computed(() => history.length > 0 && draft.value !== null);

function beginLine(document, lineId) {
  const line = document?.lines?.find(
    (candidate) => candidate.lineId === lineId,
  );
  if (!line) return false;

  baseDocument.value = document;
  history.length = 0;
  const segments = line.segments
    ? cloneSegments(line.segments)
    : splitText(line.text).map((text, index, parts) => ({
        segmentId: `${line.lineId}_s_${index}`,
        text,
        startMs: index === 0 ? line.startMs : null,
        endMs: index === parts.length - 1 ? line.endMs : null,
      }));
  draft.value = {
    lineId: line.lineId,
    text: line.text,
    startMs: line.startMs,
    endMs: line.endMs,
    segments,
  };
  return true;
}

function saveHistory() {
  history.push(cloneSegments(draft.value.segments));
}

function setBoundary(index, positionMs) {
  const value = draft.value;
  if (!value || index <= 0 || index >= value.segments.length) return false;
  const previous = value.segments[index - 1];
  const current = value.segments[index];
  const upperBound = current.endMs ?? value.endMs;
  if (
    !Number.isFinite(positionMs) ||
    !Number.isFinite(previous.startMs) ||
    !Number.isFinite(upperBound) ||
    positionMs <= previous.startMs ||
    positionMs >= upperBound
  ) {
    return false;
  }

  saveHistory();
  const segments = cloneSegments(value.segments);
  segments[index - 1].endMs = positionMs;
  segments[index].startMs = positionMs;
  draft.value = { ...value, segments };
  return true;
}

function tapBoundary(positionMs) {
  const value = draft.value;
  if (!value) return false;
  const index = value.segments.findIndex(
    (segment, segmentIndex) => segmentIndex > 0 && segment.startMs === null,
  );
  return setBoundary(index, positionMs);
}

function nudgeBoundary(index, deltaMs) {
  const value = draft.value;
  const positionMs = value?.segments?.[index]?.startMs;
  if (!Number.isFinite(positionMs) || !Number.isFinite(deltaMs)) return false;
  return setBoundary(index, positionMs + deltaMs);
}

function undo() {
  if (!draft.value || history.length === 0) return false;
  draft.value = { ...draft.value, segments: history.pop() };
  return true;
}

function buildDocument() {
  if (!canCommit.value || !baseDocument.value) return null;
  return {
    ...baseDocument.value,
    granularity: 'T2',
    lines: baseDocument.value.lines.map((line) =>
      line.lineId === draft.value.lineId
        ? { ...line, segments: cloneSegments(draft.value.segments) }
        : line,
    ),
  };
}

function cancel() {
  draft.value = null;
  baseDocument.value = null;
  history.length = 0;
}

export function useLyricsTimingEditor() {
  return {
    draft: readonly(draft),
    canCommit,
    canUndo,
    suggestSplitOffsets,
    beginLine,
    tapBoundary,
    nudgeBoundary,
    undo,
    buildDocument,
    cancel,
  };
}
