import { computed, readonly, shallowRef } from 'vue';
import {
  canEditTimingLine,
  suggestSplitOffsets,
  timingSegmentsFor,
} from '../utils/lyricsTiming.js';
import {
  canEditLineTiming,
  editLineTiming,
  validTimingDraft,
} from '../utils/lyricsLineTiming.js';
export { suggestSplitOffsets } from '../utils/lyricsTiming.js';

const baseDocument = shallowRef(null),
  draftDocument = shallowRef(null),
  sourceSession = shallowRef(null);
const activeLineId = shallowRef(null),
  readingSuggestion = shallowRef(null),
  validationError = shallowRef('');
const history = [];
const clone = (value) => JSON.parse(JSON.stringify(value));
const draft = computed(() => {
  const line = draftDocument.value?.lines.find(
    (line) => line.lineId === activeLineId.value,
  );
  return line ? { ...line, segments: line.segments ?? [] } : null;
});
const hasChanges = computed(
  () =>
    Boolean(draftDocument.value) &&
    JSON.stringify(draftDocument.value) !== JSON.stringify(baseDocument.value),
);
const canCommit = computed(
  () =>
    hasChanges.value &&
    !validationError.value &&
    validTimingDraft(draftDocument.value),
);
const canUndo = computed(
  () => Boolean(draftDocument.value) && history.length > 0,
);
const canEnableSegments = computed(() =>
  Boolean(
    draft.value &&
    !draft.value.segments.length &&
    canEditTimingLine(draft.value, readingSuggestion.value),
  ),
);
const dependencies = computed(() =>
  (draftDocument.value?.lines ?? []).filter(
    (line, index) =>
      line.lineId !== activeLineId.value &&
      line.endMs !== baseDocument.value?.lines[index]?.endMs,
  ),
);

function beginLine(
  document,
  lineId,
  readingLine = null,
  session = null,
  { mode = 'segments' } = {},
) {
  const line = document?.lines?.find((line) => line.lineId === lineId);
  if (
    mode === 'line'
      ? !canEditLineTiming(line)
      : !canEditTimingLine(line, readingLine)
  )
    return false;
  baseDocument.value = clone(document);
  sourceSession.value = session ? clone(session) : null;
  activeLineId.value = lineId;
  readingSuggestion.value = readingLine ? clone(readingLine) : null;
  history.length = 0;
  validationError.value = '';
  const next = clone(document);
  if (mode === 'segments')
    next.lines.find((line) => line.lineId === lineId).segments =
      timingSegmentsFor(line, readingLine);
  draftDocument.value = next;
  return true;
}
function replaceDocument(next) {
  history.push(draftDocument.value);
  if (history.length > 100) history.shift();
  draftDocument.value = next;
  validationError.value = '';
  return true;
}
function changeLine(kind, value) {
  if (!draft.value) return false;
  const result = editLineTiming(
    draftDocument.value,
    activeLineId.value,
    kind,
    value,
  );
  validationError.value = result.reason
    ? '時間調整會超出片段或破壞相鄰句順序，未套用。'
    : '';
  return result.document ? replaceDocument(result.document) : false;
}
// Gesture previews use the same complete-document validation without changing
// the draft, validation message, inferred dependencies or undo history.
function previewLineTiming(kind, value) {
  if (!draft.value || !['start', 'end', 'move'].includes(kind)) return null;
  const result = editLineTiming(
    draftDocument.value,
    activeLineId.value,
    kind,
    value,
  );
  return (
    result.document?.lines.find((line) => line.lineId === activeLineId.value) ??
    (result.reason === null ? draft.value : null)
  );
}
function enableSegments() {
  if (!canEnableSegments.value) return false;
  const segments = timingSegmentsFor(draft.value, readingSuggestion.value);
  return replaceDocument({
    ...draftDocument.value,
    lines: draftDocument.value.lines.map((line) =>
      line.lineId === activeLineId.value ? { ...line, segments } : line,
    ),
  });
}
function setBoundary(index, positionMs) {
  const value = draft.value;
  if (!value || index <= 0 || index >= value.segments.length) return false;
  const previous = value.segments[index - 1],
    current = value.segments[index];
  if (current.startMs === positionMs) {
    validationError.value = '';
    return false;
  }
  const upper = current.endMs ?? value.endMs;
  if (
    !Number.isSafeInteger(positionMs) ||
    !Number.isFinite(previous.startMs) ||
    !Number.isFinite(upper) ||
    positionMs <= previous.startMs ||
    positionMs >= upper
  )
    return false;
  const segments = value.segments.map((segment) => ({ ...segment }));
  segments[index - 1].endMs = positionMs;
  segments[index].startMs = positionMs;
  const next = {
    ...draftDocument.value,
    lines: draftDocument.value.lines.map((line) =>
      line.lineId === value.lineId ? { ...line, segments } : line,
    ),
  };
  if (!validTimingDraft(next, { allowIncomplete: true })) return false;
  return replaceDocument(next);
}
function tapBoundary(positionMs) {
  const index = draft.value?.segments.findIndex(
    (segment, index) => index > 0 && segment.startMs === null,
  );
  return setBoundary(index ?? -1, Math.round(positionMs));
}
function nudgeBoundary(index, deltaMs) {
  const position = draft.value?.segments?.[index]?.startMs;
  if (!Number.isFinite(position) || !Number.isSafeInteger(deltaMs))
    return false;
  return setBoundary(index, position + deltaMs);
}
function undo() {
  if (!draftDocument.value || !history.length) return false;
  draftDocument.value = history.pop();
  validationError.value = '';
  return true;
}
function buildDocument() {
  if (!canCommit.value) return null;
  const result = clone(draftDocument.value);
  result.granularity = result.lines.some((line) => line.segments?.length)
    ? 'T2'
    : result.lines.some((line) => line.startMs !== null)
      ? 'T1'
      : 'T0';
  return result;
}
function cancel() {
  draftDocument.value = baseDocument.value = sourceSession.value = null;
  activeLineId.value = readingSuggestion.value = null;
  validationError.value = '';
  history.length = 0;
}
export function useLyricsTimingEditor() {
  return {
    draft: readonly(draft),
    sourceSession: readonly(sourceSession),
    canCommit,
    canUndo,
    canEnableSegments,
    dependencies,
    validationError: readonly(validationError),
    suggestSplitOffsets,
    beginLine,
    enableSegments,
    shiftLine: (deltaMs) => changeLine('move', deltaMs),
    previewLineTiming,
    setLineStart: (positionMs) => changeLine('start', positionMs),
    setLineEnd: (positionMs) => changeLine('end', positionMs),
    tapBoundary,
    nudgeBoundary,
    undo,
    buildDocument,
    cancel,
  };
}
