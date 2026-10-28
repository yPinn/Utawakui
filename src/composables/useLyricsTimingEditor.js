import { computed, readonly, shallowRef } from 'vue';
import {
  canEditTimingLine,
  suggestSplitOffsets,
  timingSegmentsFor,
} from '../utils/lyricsTiming.js';
export { suggestSplitOffsets } from '../utils/lyricsTiming.js';

const draft = shallowRef(null);
const baseDocument = shallowRef(null);
const sourceSession = shallowRef(null);
const history = [];
const initialSegments = shallowRef([]);

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
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

const hasChanges = computed(() =>
  Boolean(
    draft.value?.segments.some(
      (segment, index) =>
        segment.startMs !== initialSegments.value[index]?.startMs ||
        segment.endMs !== initialSegments.value[index]?.endMs,
    ),
  ),
);
const canCommit = computed(() => hasChanges.value && isValidDraft(draft.value));
const canUndo = computed(() => draft.value !== null && history.length > 0);

function beginLine(document, lineId, readingLine = null, session = null) {
  const line = document?.lines?.find(
    (candidate) => candidate.lineId === lineId,
  );
  if (!canEditTimingLine(line, readingLine)) return false;

  baseDocument.value = document;
  sourceSession.value = session;
  history.length = 0;
  const segments = timingSegmentsFor(line, readingLine);
  initialSegments.value = cloneSegments(segments);
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
  if (current.startMs === positionMs) return false;
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
  sourceSession.value = null;
  initialSegments.value = [];
  history.length = 0;
}

export function useLyricsTimingEditor() {
  return {
    draft: readonly(draft),
    sourceSession: readonly(sourceSession),
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
