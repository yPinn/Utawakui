// Pure canonical snapshot projection shared across renderer and Browser Source.
import {
  adaptKineticPopLyricsPresentation,
  adaptKtvLyricsPresentation,
  adaptLiveStageLyricsPresentation,
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
  parseKtvDisplayPhrases,
} from './lyricsPresentation.mjs';
import { estimatedLyricsTextUnits } from './lyricsTimingUnits.mjs';
import { createLyricsRhythmPresentation } from './lyricsRhythm.mjs';
import { lyricsTemplateCapabilities } from './lyricsTemplateCapabilities.mjs';
import { normalizeLyricsPresentationPolicyId } from './lyricsPresentationPolicies.mjs';
import {
  alignDisplayTextsToSourceRanges,
  interpolateSourceTimeAtOffset,
} from './lyricsSourceMapping.mjs';
import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
} from './ornateVerticalPresentation.mjs';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function displayableLyricsText(value) {
  return text(value);
}

const CANONICAL_SECTION_ROLES = new Set([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'instrumental',
  'outro',
  'unknown',
]);
const MIN_PRESENTATION_CONFIDENCE = 0.5;
const LIVE_STAGE_CARD_START_MS = 4000;
const LIVE_STAGE_CARD_END_MS = 8000;
const LYRICS_COUNT_IN_BEATS = 4;
const LYRICS_COUNT_IN_FALLBACK_BEAT_MS = 500;
const KTV_DEFAULT_LINE_DURATION_MS = 7000;
const KTV_MIN_LINE_DURATION_MS = 3000;
const KTV_MAX_LINE_DURATION_MS = 10000;
const KTV_LONG_GAP_MIN_MS = 12000;
const KTV_LONG_GAP_FACTOR = 1.8;
const KTV_COUNT_IN_WINDOW_MS = 5000;
const KTV_COMPLETED_HANDOFF_HOLD_MS = 600;
const KTV_SECTION_TAIL_HOLD_MS = 5000;
const ARTWORK_PLAYBACK_STATUSES = new Set([
  'idle',
  'buffering',
  'playing',
  'seeking',
  'paused',
  'ended',
  'error',
]);

function revision(snapshot) {
  return Number.isSafeInteger(snapshot?.revision) ? snapshot.revision : 0;
}

function hiddenLyricsFrame(snapshot) {
  return {
    revision: revision(snapshot),
    visible: false,
    currentText: '',
    nextText: '',
    language: '',
    lineIndex: null,
    currentVisibleLineIndex: null,
    nextVisibleLineIndex: null,
  };
}

function visibleLyricLineIndex(lines, sourceLineIndex) {
  if (!Number.isSafeInteger(sourceLineIndex) || sourceLineIndex < 0)
    return null;
  if (!displayableLyricsText(lines[sourceLineIndex]?.text)) return null;

  let visibleIndex = -1;
  for (let index = 0; index <= sourceLineIndex; index += 1) {
    if (displayableLyricsText(lines[index]?.text)) visibleIndex += 1;
  }
  return visibleIndex;
}

function playbackRate(snapshot) {
  const rate = snapshot?.playback?.rate;
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function lyricsOffsetMs(snapshot) {
  return Number.isFinite(snapshot?.lyrics?.offsetMs)
    ? snapshot.lyrics.offsetMs
    : 0;
}

function lyricsPositionMs(snapshot, nowMs) {
  return playbackPositionMs(snapshot, nowMs) + lyricsOffsetMs(snapshot);
}

function nextFiniteLineStart(lines, lineIndex) {
  return lines
    .slice(lineIndex + 1)
    .find((line) => Number.isFinite(line?.startMs))?.startMs;
}

function effectiveLineEnd(snapshot, lines, lineIndex) {
  const line = lines[lineIndex];
  if (Number.isFinite(line?.endMs)) return line.endMs;
  const nextStartMs = nextFiniteLineStart(lines, lineIndex);
  if (Number.isFinite(nextStartMs)) return nextStartMs;
  return Number.isFinite(snapshot?.playback?.durationMs)
    ? snapshot.playback.durationMs + lyricsOffsetMs(snapshot)
    : null;
}

function boundedProgress(positionMs, startMs, endMs) {
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs)));
}

function estimatedPresentationSegments(value, startMs, endMs, idPrefix) {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  const units = estimatedLyricsTextUnits(value);
  const totalWeight = units.reduce((total, unit) => total + unit.weight, 0);
  if (units.length === 0 || totalWeight <= 0) return null;

  const durationMs = endMs - startMs;
  let elapsedWeight = 0;
  return units.map((unit, index) => {
    const segmentStartMs = startMs + (durationMs * elapsedWeight) / totalWeight;
    elapsedWeight += unit.weight;
    return {
      segmentId: `${idPrefix}-${index.toString(36)}`,
      text: unit.text,
      startMs: segmentStartMs,
      endMs:
        index === units.length - 1
          ? endMs
          : startMs + (durationMs * elapsedWeight) / totalWeight,
    };
  });
}

function authoredLineSegments(line) {
  const segments = Array.isArray(line?.segments) ? line.segments : [];
  return segments.length > 0 &&
    segments.every(
      (segment) =>
        typeof segment?.segmentId === 'string' &&
        typeof segment?.text === 'string' &&
        Number.isFinite(segment?.startMs),
    ) &&
    segments.map((segment) => segment.text).join('') === line.text
    ? segments
    : null;
}

function presentationLineSegments(snapshot, lines, lineIndex) {
  const line = lines[lineIndex];
  const authored = authoredLineSegments(line);
  if (authored) return { segments: authored, timingSource: 't2' };
  if (snapshot?.lyrics?.synced !== true) return null;

  const segments = estimatedPresentationSegments(
    displayableLyricsText(line?.text),
    line?.startMs,
    effectiveLineEnd(snapshot, lines, lineIndex),
    `line-estimate-${lineIndex.toString(36)}`,
  );
  return segments ? { segments, timingSource: 'line-estimate' } : null;
}

function projectSegmentStates(snapshot, segments, positionMs, fallbackEndMs) {
  const rate = playbackRate(snapshot);
  const isPlaying = snapshot?.playback?.status === 'playing';
  return segments.map((segment, index) => {
    const nextStartMs = segments[index + 1]?.startMs;
    const endMs = Number.isFinite(segment.endMs)
      ? segment.endMs
      : Number.isFinite(nextStartMs)
        ? nextStartMs
        : fallbackEndMs;
    const progress = boundedProgress(positionMs, segment.startMs, endMs);
    const state =
      positionMs < segment.startMs
        ? 'upcoming'
        : Number.isFinite(endMs) && positionMs >= endMs
          ? 'past'
          : 'active';
    return {
      segmentId: segment.segmentId,
      text: segment.text,
      state,
      progress: state === 'past' ? 1 : state === 'upcoming' ? 0 : progress,
      remainingMs:
        state === 'active' && isPlaying && Number.isFinite(endMs)
          ? Math.max(0, (endMs - positionMs) / rate)
          : null,
    };
  });
}

function projectCurrentSegments(snapshot, lines, lineIndex, nowMs) {
  const projection = presentationLineSegments(snapshot, lines, lineIndex);
  if (!projection) return null;

  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  return {
    timingSource: projection.timingSource,
    segments: projectSegmentStates(
      snapshot,
      projection.segments,
      positionMs,
      lineEndMs,
    ),
  };
}

function authoredSegmentsForDisplay(line, lineEndMs, displayText) {
  const segments = authoredLineSegments(line);
  const sourceText = typeof line?.text === 'string' ? line.text : '';
  if (!segments || !displayText || !sourceText) return null;

  const displayStart = sourceText.search(/\S/u);
  const trailingWhitespace = sourceText.match(/\s*$/u)?.[0].length ?? 0;
  const displayEnd = sourceText.length - trailingWhitespace;
  if (
    displayStart < 0 ||
    displayEnd <= displayStart ||
    sourceText.slice(displayStart, displayEnd) !== displayText
  ) {
    return null;
  }

  let sourceOffset = 0;
  return segments
    .map((segment, index) => {
      const sourceStart = sourceOffset;
      sourceOffset += segment.text.length;
      const sourceEnd = sourceOffset;
      const clippedStart = Math.max(sourceStart, displayStart);
      const clippedEnd = Math.min(sourceEnd, displayEnd);
      if (clippedEnd <= clippedStart) return null;
      const nextStartMs = segments[index + 1]?.startMs;
      return {
        sourceStart: clippedStart - displayStart,
        sourceEnd: clippedEnd - displayStart,
        startMs: segment.startMs,
        endMs: Number.isFinite(segment.endMs)
          ? segment.endMs
          : Number.isFinite(nextStartMs)
            ? nextStartMs
            : lineEndMs,
      };
    })
    .filter(Boolean);
}

function mangaBubbleStartMs(bubble, segments) {
  const sourceStart = Math.min(
    ...(Array.isArray(bubble?.sourceRanges) ? bubble.sourceRanges : [])
      .map((range) => range?.start)
      .filter(Number.isSafeInteger),
  );
  if (!Number.isFinite(sourceStart)) return null;
  return interpolateSourceTimeAtOffset(segments, sourceStart);
}

function kineticPopPhraseTimeline(snapshot, lines, lineIndex, presentation) {
  const line = lines[lineIndex];
  const displayText = displayableLyricsText(line?.text);
  const segments = authoredSegmentsForDisplay(
    line,
    effectiveLineEnd(snapshot, lines, lineIndex),
    displayText,
  );
  const phrases = Array.isArray(presentation?.phrases)
    ? presentation.phrases
    : [];
  if (!segments || phrases.length <= 1) return null;
  const timeline = phrases.map((phrase) => ({
    startMs: interpolateSourceTimeAtOffset(segments, phrase.sourceStart),
  }));
  return timeline.every(({ startMs }) => Number.isFinite(startMs))
    ? timeline
    : null;
}

function liveStagePageTimeline(
  snapshot,
  lines,
  lineIndex,
  analysis,
  lyricsPresentationPolicyId,
) {
  const line = lines[lineIndex];
  const displayText = displayableLyricsText(line?.text);
  const segments = authoredSegmentsForDisplay(
    line,
    effectiveLineEnd(snapshot, lines, lineIndex),
    displayText,
  );
  if (!segments) return null;
  const presentation = adaptLiveStageLyricsPresentation(
    analysis?.sourceText === displayText
      ? analysis
      : analyzeLyricsSource(displayText),
    { lyricsPresentationPolicyId },
  );
  if (presentation.pages.length <= 1) return null;
  const sourceRanges = alignDisplayTextsToSourceRanges(
    displayText,
    presentation.pages.map((page) => page.lines.join(' ')),
  );
  if (!sourceRanges) return null;
  const timeline = sourceRanges.map(({ sourceStart }) => ({
    startMs: interpolateSourceTimeAtOffset(segments, sourceStart),
  }));
  return timeline.every(({ startMs }) => Number.isFinite(startMs))
    ? timeline
    : null;
}

function mangaBubbleTimeline(snapshot, lines, lineIndex, analysis, language) {
  const line = lines[lineIndex];
  const displayText = displayableLyricsText(line?.text);
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  const segments = authoredSegmentsForDisplay(line, lineEndMs, displayText);
  if (!segments) return null;
  const presentation = adaptMangaLyricsPresentation(
    analysis?.sourceText === displayText
      ? analysis
      : analyzeLyricsSource(displayText),
    { language },
  );
  if (presentation.bubbles.length <= 1) return null;
  const timeline = presentation.bubbles.map((bubble) => ({
    startMs: mangaBubbleStartMs(bubble, segments),
  }));
  return timeline.every(({ startMs }) => Number.isFinite(startMs))
    ? timeline
    : null;
}

function projectMangaBubbleTiming(
  snapshot,
  lines,
  lineIndex,
  analysis,
  language,
  positionMs,
) {
  const timeline = mangaBubbleTimeline(
    snapshot,
    lines,
    lineIndex,
    analysis,
    language,
  );
  return timeline?.map(({ startMs }) => ({
    startMs,
    state: positionMs >= startMs ? 'revealed' : 'upcoming',
  }));
}

export function playbackPositionMs(snapshot, nowMs) {
  const playback = snapshot?.playback;
  const basePosition = Number.isFinite(playback?.positionMs)
    ? Math.max(0, playback.positionMs)
    : 0;
  if (playback?.status !== 'playing') return basePosition;

  const generatedAtMs = Date.parse(snapshot?.generatedAt ?? '');
  const displayDelayMs = Number.isSafeInteger(snapshot?.displayDelayMs)
    ? snapshot.displayDelayMs
    : 0;
  const elapsedMs = Number.isFinite(generatedAtMs)
    ? Math.max(0, nowMs - generatedAtMs - displayDelayMs)
    : 0;
  const projectedPosition = basePosition + elapsedMs * playbackRate(snapshot);
  const durationMs = playback?.durationMs;
  return Number.isFinite(durationMs)
    ? Math.min(projectedPosition, Math.max(0, durationMs))
    : projectedPosition;
}

export function selectLiveStageFrame(snapshot, options = {}) {
  const track = snapshot?.playback?.track;
  const trackId = text(track?.id);
  const title = text(track?.title);
  const active = Boolean(trackId && title);
  const positionMs = playbackPositionMs(snapshot, options.nowMs ?? Date.now());

  return {
    active,
    cardVisible:
      active &&
      positionMs >= LIVE_STAGE_CARD_START_MS &&
      positionMs < LIVE_STAGE_CARD_END_MS,
    trackId,
    title,
    artist: text(track?.artist),
  };
}

function nextLiveStageBoundaryDelayMs(snapshot, options = {}) {
  if (snapshot?.playback?.status !== 'playing') return null;
  const stage = selectLiveStageFrame(snapshot, options);
  if (!stage.active) return null;

  const nowMs = options.nowMs ?? Date.now();
  const positionMs = playbackPositionMs(snapshot, nowMs);
  const boundaryMs =
    positionMs < LIVE_STAGE_CARD_START_MS
      ? LIVE_STAGE_CARD_START_MS
      : positionMs < LIVE_STAGE_CARD_END_MS
        ? LIVE_STAGE_CARD_END_MS
        : null;
  const durationMs = snapshot?.playback?.durationMs;
  const boundaryFallsAfterTrack =
    Number.isFinite(durationMs) &&
    boundaryMs !== null &&
    boundaryMs > durationMs;
  return boundaryMs === null || boundaryFallsAfterTrack
    ? null
    : Math.max(
        1,
        Math.ceil((boundaryMs - positionMs) / playbackRate(snapshot)),
      );
}

function nextLiveStageCaptionBoundaryDelayMs(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  if (
    snapshot?.playback?.status !== 'playing' ||
    !trackId ||
    lyrics?.trackId !== trackId ||
    lyrics?.synced !== true
  ) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const lineIndex = activeLyricIndex(snapshot, lines, nowMs);
  const line = lines[lineIndex];
  if (!line || !Number.isFinite(line.startMs)) return null;
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  if (!Number.isFinite(lineEndMs) || lineEndMs <= line.startMs) return null;

  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineProgress = boundedProgress(positionMs, line.startMs, lineEndMs);
  const analysis = analyzeLyricsSource(text(line.text));
  const exactTimeline = liveStagePageTimeline(
    snapshot,
    lines,
    lineIndex,
    analysis,
    options.lyricsPresentationPolicyId,
  );
  const nextExactBoundaryMs = exactTimeline
    ?.map(({ startMs }) => startMs)
    .find((startMs) => startMs > positionMs);
  if (exactTimeline) {
    return Number.isFinite(nextExactBoundaryMs)
      ? Math.max(
          1,
          Math.ceil(
            (nextExactBoundaryMs - positionMs) / playbackRate(snapshot),
          ),
        )
      : null;
  }
  const presentation = adaptLiveStageLyricsPresentation(analysis, {
    lineProgress,
    lyricsPresentationPolicyId: options.lyricsPresentationPolicyId,
  });
  const nextBoundary = presentation.pageBreakProgresses.find(
    (boundary) => boundary > lineProgress,
  );
  if (!Number.isFinite(nextBoundary)) return null;

  const boundaryMs = line.startMs + (lineEndMs - line.startMs) * nextBoundary;
  return Math.max(
    1,
    Math.ceil((boundaryMs - positionMs) / playbackRate(snapshot)),
  );
}

function nextKineticPopPhraseBoundaryDelayMs(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  if (
    snapshot?.playback?.status !== 'playing' ||
    !trackId ||
    lyrics?.trackId !== trackId ||
    lyrics?.synced !== true
  ) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const lineIndex = activeLyricIndex(snapshot, lines, nowMs);
  const line = lines[lineIndex];
  if (!line || !Number.isFinite(line.startMs)) return null;
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  if (!Number.isFinite(lineEndMs) || lineEndMs <= line.startMs) return null;

  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineProgress = boundedProgress(positionMs, line.startMs, lineEndMs);
  const presentation = adaptKineticPopLyricsPresentation(
    displayableLyricsText(line.text),
    { lineProgress },
  );
  const exactTimeline = kineticPopPhraseTimeline(
    snapshot,
    lines,
    lineIndex,
    presentation,
  );
  const nextExactBoundaryMs = exactTimeline
    ?.map(({ startMs }) => startMs)
    .find((startMs) => startMs > positionMs);
  if (exactTimeline) {
    return Number.isFinite(nextExactBoundaryMs)
      ? Math.max(
          1,
          Math.ceil(
            (nextExactBoundaryMs - positionMs) / playbackRate(snapshot),
          ),
        )
      : null;
  }
  const nextBoundary = presentation.phraseBreakProgresses.find(
    (boundary) => boundary > lineProgress,
  );
  if (!Number.isFinite(nextBoundary)) return null;

  const boundaryMs = line.startMs + (lineEndMs - line.startMs) * nextBoundary;
  return Math.max(
    1,
    Math.ceil((boundaryMs - positionMs) / playbackRate(snapshot)),
  );
}

export function activeLyricIndex(snapshot, lines, nowMs) {
  const lyrics = snapshot?.lyrics;
  if (lyrics?.synced === true) {
    const lyricPositionMs = lyricsPositionMs(snapshot, nowMs);
    return lines.findIndex((line, index) => {
      if (!Number.isFinite(line?.startMs)) return false;
      const nextStartMs = nextFiniteLineStart(lines, index);
      const endMs = Number.isFinite(line.endMs)
        ? line.endMs
        : (nextStartMs ?? Infinity);
      return lyricPositionMs >= line.startMs && lyricPositionMs < endMs;
    });
  }
  return Number.isSafeInteger(lyrics?.activeLineIndex)
    ? lyrics.activeLineIndex
    : -1;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hiddenKtvFrame(snapshot) {
  return {
    revision: revision(snapshot),
    visible: false,
    currentText: '',
    nextText: '',
    language: '',
    lineIndex: null,
    currentVisibleLineIndex: null,
    nextVisibleLineIndex: null,
    lineProgress: null,
    countIn: null,
  };
}

function timedVisibleLyricsLines(lines, presentationDocument = null) {
  return lines
    .map((line, sourceLineIndex) => ({
      line,
      sourceLineIndex,
      presentationLine:
        presentationDocument?.lines?.[sourceLineIndex]?.sourceText ===
        text(line?.text)
          ? presentationDocument.lines[sourceLineIndex]
          : null,
    }))
    .filter(
      ({ line }) =>
        Number.isFinite(line?.startMs) &&
        Boolean(displayableLyricsText(line?.text)),
    );
}

function typicalKtvLineIntervalMs(timedLines) {
  const intervals = timedLines
    .slice(1)
    .map(({ line }, index) => line.startMs - timedLines[index].line.startMs)
    .filter(
      (interval) =>
        interval >= KTV_MIN_LINE_DURATION_MS && interval <= KTV_LONG_GAP_MIN_MS,
    );
  return median(intervals) ?? KTV_DEFAULT_LINE_DURATION_MS;
}

function ktvLinePhrases(line, language, presentationLine = null) {
  const compiledPhrases = presentationLine?.presentation?.phrases;
  return Array.isArray(compiledPhrases)
    ? compiledPhrases
    : parseKtvDisplayPhrases(analyzeLyricsSource(text(line?.text)), {
        language,
      });
}

function ktvLineVisualWeight(line, language, presentationLine = null) {
  return ktvLinePhrases(line, language, presentationLine).reduce(
    (total, phrase) => total + phrase.visualWeight,
    0,
  );
}

function estimatedKtvLineDurationMs(
  line,
  language,
  typicalIntervalMs,
  medianWeight,
  presentationLine = null,
) {
  const lineWeight = ktvLineVisualWeight(line, language, presentationLine);
  const weightRatio =
    Number.isFinite(medianWeight) && medianWeight > 0 && lineWeight > 0
      ? lineWeight / medianWeight
      : 1;
  return clamp(
    typicalIntervalMs * clamp(weightRatio, 0.65, 1.35),
    KTV_MIN_LINE_DURATION_MS,
    KTV_MAX_LINE_DURATION_MS,
  );
}

function confidentInstrumentalStartMs(snapshot, lineStartMs, nextStartMs) {
  const offsetMs = lyricsOffsetMs(snapshot);
  const document = musicStructureDocument(snapshot);
  if (document?.level !== 'M2') return null;
  const section = (
    Array.isArray(document.sections) ? document.sections : []
  ).find((candidate) => {
    const startMs = candidate?.startMs + offsetMs;
    return (
      candidate?.role === 'instrumental' &&
      isConfident(candidate?.confidence) &&
      Number.isFinite(startMs) &&
      startMs > lineStartMs &&
      (!Number.isFinite(nextStartMs) || startMs < nextStartMs)
    );
  });
  return section ? section.startMs + offsetMs : null;
}

function resolvedKtvLineEndMs(
  snapshot,
  timedLines,
  timedLineIndex,
  language,
  typicalIntervalMs,
  medianWeight,
) {
  const { line, presentationLine } = timedLines[timedLineIndex];
  const nextStartMs = timedLines[timedLineIndex + 1]?.line?.startMs;
  const hasFiniteLineEnd =
    Number.isFinite(line.endMs) && line.endMs > line.startMs;
  const hasInferredLineEnd = line.endInferred === true && hasFiniteLineEnd;
  if (hasFiniteLineEnd && !hasInferredLineEnd) {
    return line.endMs;
  }
  const finalSegment = Array.isArray(line.segments)
    ? line.segments.at(-1)
    : null;
  const finalSegmentEndMs = Number.isFinite(finalSegment?.endMs)
    ? finalSegment.endMs
    : null;
  const hasInferredFinalSegmentEnd =
    hasInferredLineEnd && finalSegmentEndMs === line.endMs;
  if (
    Number.isFinite(finalSegmentEndMs) &&
    finalSegmentEndMs > line.startMs &&
    !hasInferredFinalSegmentEnd
  ) {
    return finalSegmentEndMs;
  }

  const finalSegmentStartMs =
    (hasInferredFinalSegmentEnd || finalSegmentEndMs === null) &&
    Number.isFinite(finalSegment?.startMs)
      ? finalSegment.startMs
      : null;
  const estimateAnchorMs = Number.isFinite(finalSegmentStartMs)
    ? Math.max(line.startMs, finalSegmentStartMs)
    : line.startMs;
  const sourceBoundaryMs = hasInferredLineEnd ? line.endMs : nextStartMs;

  const instrumentalStartMs = confidentInstrumentalStartMs(
    snapshot,
    line.startMs,
    sourceBoundaryMs,
  );
  if (
    Number.isFinite(instrumentalStartMs) &&
    instrumentalStartMs > estimateAnchorMs
  ) {
    return instrumentalStartMs;
  }

  const estimatedDurationMs = estimatedKtvLineDurationMs(
    line,
    language,
    typicalIntervalMs,
    medianWeight,
    presentationLine,
  );
  if (!Number.isFinite(sourceBoundaryMs)) {
    const durationEndMs = Number.isFinite(snapshot?.playback?.durationMs)
      ? snapshot.playback.durationMs + lyricsOffsetMs(snapshot)
      : Infinity;
    return Math.min(durationEndMs, estimateAnchorMs + estimatedDurationMs);
  }
  const sourceGapMs = sourceBoundaryMs - line.startMs;
  const longGapThresholdMs = Math.max(
    KTV_LONG_GAP_MIN_MS,
    typicalIntervalMs * KTV_LONG_GAP_FACTOR,
  );
  return sourceGapMs >= longGapThresholdMs
    ? Math.min(
        sourceBoundaryMs,
        estimateAnchorMs +
          clamp(
            typicalIntervalMs,
            KTV_MIN_LINE_DURATION_MS,
            KTV_MAX_LINE_DURATION_MS,
          ),
      )
    : sourceBoundaryMs;
}

function exactKtvPhraseSegments(line, phrase, lineEndMs, contentStart) {
  const segments = authoredLineSegments(line);
  if (!segments) return null;

  let sourceOffset = 0;
  const ranged = segments.map((segment, index) => {
    const sourceStart = sourceOffset;
    sourceOffset += segment.text.length;
    const nextStartMs = segments[index + 1]?.startMs;
    return {
      ...segment,
      sourceStart,
      sourceEnd: sourceOffset,
      endMs: Number.isFinite(segment.endMs)
        ? line.endInferred === true &&
          index === segments.length - 1 &&
          segment.endMs === line.endMs
          ? Math.max(segment.startMs + 1, lineEndMs)
          : segment.endMs
        : Number.isFinite(nextStartMs)
          ? nextStartMs
          : lineEndMs,
    };
  });
  const content = line.text.slice(contentStart);
  const outerLeadingWhitespace = content.match(/^\s+/u)?.[0].length ?? 0;
  const outerTrailingWhitespace = content.match(/\s+$/u)?.[0].length ?? 0;
  const displaySourceStart = contentStart + outerLeadingWhitespace;
  const displaySourceEnd = line.text.length - outerTrailingWhitespace;
  const normalizedRanges = ranged
    .map((segment) => {
      const sourceStart = Math.max(segment.sourceStart, displaySourceStart);
      const sourceEnd = Math.min(segment.sourceEnd, displaySourceEnd);
      const textStart = Math.max(0, sourceStart - segment.sourceStart);
      const textEnd = Math.max(textStart, sourceEnd - segment.sourceStart);
      return {
        ...segment,
        text: segment.text.slice(textStart, textEnd),
        sourceStart,
        sourceEnd,
      };
    })
    .filter((segment) => segment.text.length > 0);
  const selected = normalizedRanges
    .filter(
      (segment) =>
        segment.sourceEnd > phrase.sourceStart &&
        segment.sourceStart < phrase.sourceEnd,
    )
    .map((segment) => {
      const sourceStart = Math.max(segment.sourceStart, phrase.sourceStart);
      const sourceEnd = Math.min(segment.sourceEnd, phrase.sourceEnd);
      return {
        ...segment,
        text: segment.text.slice(
          sourceStart - segment.sourceStart,
          sourceEnd - segment.sourceStart,
        ),
        sourceStart,
        sourceEnd,
      };
    });
  if (
    selected.length === 0 ||
    selected[0].sourceStart !== phrase.sourceStart ||
    selected.at(-1).sourceEnd !== phrase.sourceEnd ||
    selected.map((segment) => segment.text).join('') !== phrase.text
  ) {
    return null;
  }
  return selected.map((segment) => ({
    segmentId: segment.segmentId,
    text: segment.text,
    startMs: segment.startMs,
    endMs: segment.endMs,
  }));
}

function projectKtvDisplayTimeline(
  snapshot,
  lines,
  presentationDocument = null,
) {
  const language = text(snapshot?.lyrics?.source?.language);
  const timedLines = timedVisibleLyricsLines(lines, presentationDocument);
  const typicalIntervalMs = typicalKtvLineIntervalMs(timedLines);
  const weights = timedLines
    .map(({ line, presentationLine }) =>
      ktvLineVisualWeight(line, language, presentationLine),
    )
    .filter((weight) => weight > 0);
  const medianWeight = median(weights);
  const units = [];

  timedLines.forEach(
    ({ line, sourceLineIndex, presentationLine }, timedLineIndex) => {
      const analysis =
        presentationLine?.analysis ?? analyzeLyricsSource(text(line.text));
      const presentation =
        presentationLine?.presentation ??
        adaptKtvLyricsPresentation(analysis, { language });
      const phrases = ktvLinePhrases(line, language, presentationLine);
      if (phrases.length === 0) return;
      const lineEndMs = resolvedKtvLineEndMs(
        snapshot,
        timedLines,
        timedLineIndex,
        language,
        typicalIntervalMs,
        medianWeight,
      );
      if (!Number.isFinite(lineEndMs) || lineEndMs <= line.startMs) return;

      const contentStart = presentation.speaker
        ? (analysis.units[0]?.sourceStart ?? text(line.text).length)
        : 0;
      const exactSegments = phrases.map((phrase) =>
        exactKtvPhraseSegments(line, phrase, lineEndMs, contentStart),
      );
      const exactSegmentIds = exactSegments.flatMap(
        (segments) => segments?.map((segment) => segment.segmentId) ?? [],
      );
      const hasExactPhraseTiming =
        exactSegments.every(Boolean) &&
        new Set(exactSegmentIds).size === exactSegmentIds.length;
      const totalWeight = phrases.reduce(
        (total, phrase) => total + phrase.visualWeight,
        0,
      );
      let elapsedWeight = 0;

      phrases.forEach((phrase, phraseIndex) => {
        const segments = exactSegments[phraseIndex];
        const estimatedStartMs =
          line.startMs +
          ((lineEndMs - line.startMs) * elapsedWeight) / totalWeight;
        elapsedWeight += phrase.visualWeight;
        const estimatedEndMs =
          phraseIndex === phrases.length - 1
            ? lineEndMs
            : line.startMs +
              ((lineEndMs - line.startMs) * elapsedWeight) / totalWeight;
        const startMs = hasExactPhraseTiming
          ? segments[0].startMs
          : estimatedStartMs;
        const endMs = hasExactPhraseTiming
          ? (segments.at(-1).endMs ?? estimatedEndMs)
          : estimatedEndMs;
        units.push({
          displayUnitIndex: units.length,
          sourceLineIndex,
          phraseIndex,
          text: phrase.text,
          role: presentation.role,
          startMs,
          endMs,
          timingSource: hasExactPhraseTiming ? 't2' : 'line-estimate',
          ...(hasExactPhraseTiming ? { segments } : {}),
        });
      });
    },
  );

  let previousUnit = null;
  let laneIndex = 0;
  return units.map((unit) => {
    const entrance = previousUnit
      ? ktvCountInBoundaries(snapshot, unit.startMs, previousUnit.endMs)
      : null;
    const sharesPreviousPage =
      previousUnit &&
      (!entrance || entrance.visibleStartMs < previousUnit.endMs);
    laneIndex = sharesPreviousPage ? laneIndex + 1 : 0;
    previousUnit = unit;
    return { ...unit, laneIndex };
  });
}

function hasKtvEntranceWindow(lineStartMs, earliestStartMs) {
  return lineStartMs - KTV_COUNT_IN_WINDOW_MS >= earliestStartMs;
}

function musicalCountInBoundaries(snapshot, lineStartMs) {
  const offsetMs = lyricsOffsetMs(snapshot);
  const document = musicStructureDocument(snapshot);
  const confidentBeats = (Array.isArray(document?.beats) ? document.beats : [])
    .map((beat, sourceIndex) => ({ beat, sourceIndex }))
    .filter(
      ({ beat }) =>
        Number.isFinite(beat?.timeMs) &&
        isConfident(beat.confidence) &&
        beat.timeMs + offsetMs < lineStartMs,
    )
    .slice(-LYRICS_COUNT_IN_BEATS);

  if (confidentBeats.length === LYRICS_COUNT_IN_BEATS) {
    const consecutiveSourceBeats = confidentBeats.every(
      ({ sourceIndex }, index) =>
        index === 0 ||
        sourceIndex === confidentBeats[index - 1].sourceIndex + 1,
    );
    const beatTimes = confidentBeats.map(({ beat }) => beat.timeMs + offsetMs);
    const intervals = beatTimes
      .slice(1)
      .map((timeMs, index) => timeMs - beatTimes[index]);
    const finalGapMs = lineStartMs - beatTimes.at(-1);
    const allIntervals = [...intervals, finalGapMs];
    const typicalIntervalMs = median(allIntervals);
    const regularIntervals = allIntervals.every(
      (intervalMs) =>
        intervalMs >= typicalIntervalMs * 0.75 &&
        intervalMs <= typicalIntervalMs * 1.25,
    );
    if (
      consecutiveSourceBeats &&
      Number.isFinite(typicalIntervalMs) &&
      typicalIntervalMs > 0 &&
      finalGapMs > 0 &&
      regularIntervals
    ) {
      return {
        boundaries: [...beatTimes, lineStartMs],
        timingSource: 'beat-grid',
      };
    }
  }

  const tempo = document?.tempo;
  const hasConfidentTempo =
    Number.isFinite(tempo?.bpm) &&
    tempo.bpm > 0 &&
    isConfident(tempo.confidence);
  const beatDurationMs = hasConfidentTempo
    ? 60000 / tempo.bpm
    : LYRICS_COUNT_IN_FALLBACK_BEAT_MS;
  return {
    boundaries: Array.from(
      { length: LYRICS_COUNT_IN_BEATS + 1 },
      (_, index) =>
        lineStartMs - (LYRICS_COUNT_IN_BEATS - index) * beatDurationMs,
    ),
    timingSource: hasConfidentTempo ? 'tempo' : 'fallback',
  };
}

function ktvCountInBoundaries(snapshot, lineStartMs, earliestStartMs) {
  if (!hasKtvEntranceWindow(lineStartMs, earliestStartMs)) return null;
  const countIn = musicalCountInBoundaries(snapshot, lineStartMs);
  return {
    visibleStartMs: Math.min(
      lineStartMs - KTV_COUNT_IN_WINDOW_MS,
      countIn.boundaries[0],
    ),
    ...countIn,
  };
}

function ktvEntrances(snapshot, units) {
  return units.flatMap((unit, index) => {
    const previousEndMs = index === 0 ? -Infinity : units[index - 1].endMs;
    const countIn = ktvCountInBoundaries(snapshot, unit.startMs, previousEndMs);
    return countIn ? [{ unit, previousEndMs, ...countIn }] : [];
  });
}

function activeKtvDisplayUnit(units, positionMs) {
  return units.find(
    (unit) => positionMs >= unit.startMs && positionMs < unit.endMs,
  );
}

function ktvCountInForEntrance(entrance, positionMs) {
  if (!entrance) return null;
  const nextBoundaryIndex = entrance.boundaries.findIndex(
    (boundaryMs) => boundaryMs > positionMs,
  );
  const elapsedBeatCount = Math.max(0, nextBoundaryIndex - 1);
  return {
    remainingBeats: Math.max(1, LYRICS_COUNT_IN_BEATS - elapsedBeatCount),
    totalBeats: LYRICS_COUNT_IN_BEATS,
    timingSource: entrance.timingSource,
    visibleLineIndex: entrance.unit.displayUnitIndex,
    laneIndex: entrance.unit.laneIndex,
    role: entrance.unit.role,
  };
}

function nextKtvDisplayUnit(units, unit) {
  const candidate = units[unit.displayUnitIndex + 1] ?? null;
  if (!candidate || hasKtvEntranceWindow(candidate.startMs, unit.endMs)) {
    return null;
  }
  return candidate;
}

function ktvCompletedHoldMs(units, unit) {
  if (!unit) return KTV_COMPLETED_HANDOFF_HOLD_MS;
  const nextUnit = units[unit.displayUnitIndex + 1] ?? null;
  return !nextUnit || hasKtvEntranceWindow(nextUnit.startMs, unit.endMs)
    ? KTV_SECTION_TAIL_HOLD_MS
    : KTV_COMPLETED_HANDOFF_HOLD_MS;
}

function ktvTailCompanionUnit(units, unit) {
  if (ktvCompletedHoldMs(units, unit) !== KTV_SECTION_TAIL_HOLD_MS) {
    return null;
  }
  const previousUnit = units[unit.displayUnitIndex - 1] ?? null;
  return previousUnit && nextKtvDisplayUnit(units, previousUnit) === unit
    ? previousUnit
    : null;
}

function presentationKtvSegments(unit) {
  const authored = Array.isArray(unit?.segments) ? unit.segments : [];
  if (authored.length > 0) return authored;
  return estimatedPresentationSegments(
    unit?.text,
    unit?.startMs,
    unit?.endMs,
    `ktv-estimate-${unit?.sourceLineIndex?.toString(36) ?? 'x'}-${unit?.phraseIndex?.toString(36) ?? 'x'}`,
  );
}

function projectKtvSegments(snapshot, unit, positionMs) {
  const segments = presentationKtvSegments(unit);
  return segments
    ? projectSegmentStates(snapshot, segments, positionMs, unit.endMs)
    : null;
}

function ktvFrameForUnit(snapshot, units, unit, positionMs, options = {}) {
  const nextUnit = Object.hasOwn(options, 'nextUnit')
    ? options.nextUnit
    : options.completed
      ? null
      : nextKtvDisplayUnit(units, unit);
  const companionUnit = options.companionUnit ?? null;
  const secondaryUnit = companionUnit ?? nextUnit;
  const lineProgress = options.completed
    ? 1
    : options.preRoll
      ? 0
      : boundedProgress(positionMs, unit.startMs, unit.endMs);
  const currentSegments = projectKtvSegments(snapshot, unit, positionMs);
  const nextSegments = projectKtvSegments(snapshot, secondaryUnit, positionMs);
  return {
    revision: revision(snapshot),
    visible: true,
    currentText: unit.text,
    nextText: secondaryUnit?.text ?? '',
    language: text(snapshot?.lyrics?.source?.language),
    lineIndex: unit.sourceLineIndex,
    currentVisibleLineIndex: unit.displayUnitIndex,
    nextVisibleLineIndex: secondaryUnit?.displayUnitIndex ?? null,
    currentLaneIndex: unit.laneIndex,
    nextLaneIndex: secondaryUnit?.laneIndex ?? null,
    lineProgress,
    lineRemainingMs:
      !options.preRoll &&
      !options.completed &&
      !currentSegments &&
      snapshot?.playback?.status === 'playing'
        ? Math.max(0, (unit.endMs - positionMs) / playbackRate(snapshot))
        : null,
    currentRole: unit.role,
    nextRole: secondaryUnit?.role ?? 'solo',
    nextHeld: companionUnit !== null,
    currentTimingSource: unit.timingSource,
    ...(currentSegments ? { currentSegments } : {}),
    ...(nextSegments ? { nextSegments } : {}),
    ...(Number.isFinite(options.laneReplacementDelayMs)
      ? { laneReplacementDelayMs: options.laneReplacementDelayMs }
      : {}),
    countIn: options.countIn ?? null,
  };
}

function selectKtvLyricsFrame(
  snapshot,
  lines,
  nowMs,
  presentationDocument = null,
) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  if (!trackId || lyrics?.trackId !== trackId || lyrics?.synced !== true) {
    return hiddenKtvFrame(snapshot);
  }
  const units = projectKtvDisplayTimeline(
    snapshot,
    lines,
    presentationDocument,
  );
  if (units.length === 0) return hiddenKtvFrame(snapshot);
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const entrance = ktvEntrances(snapshot, units).find(
    ({ visibleStartMs, unit }) =>
      positionMs >= visibleStartMs && positionMs < unit.startMs,
  );
  const activeUnit = activeKtvDisplayUnit(units, positionMs);
  if (activeUnit) {
    const overlappingEntrance =
      entrance?.unit.displayUnitIndex === activeUnit.displayUnitIndex + 1
        ? entrance
        : null;
    return ktvFrameForUnit(snapshot, units, activeUnit, positionMs, {
      ...(overlappingEntrance
        ? {
            nextUnit: overlappingEntrance.unit,
            countIn: ktvCountInForEntrance(overlappingEntrance, positionMs),
          }
        : { companionUnit: ktvTailCompanionUnit(units, activeUnit) }),
    });
  }

  if (entrance) {
    const previousUnit = units[entrance.unit.displayUnitIndex - 1] ?? null;
    return ktvFrameForUnit(snapshot, units, entrance.unit, positionMs, {
      preRoll: true,
      laneReplacementDelayMs: Number.isFinite(entrance.previousEndMs)
        ? Math.max(
            0,
            entrance.previousEndMs +
              ktvCompletedHoldMs(units, previousUnit) -
              positionMs,
          )
        : 0,
      countIn: ktvCountInForEntrance(entrance, positionMs),
    });
  }

  const completedUnit = units.findLast(
    (unit) =>
      positionMs >= unit.endMs &&
      positionMs < unit.endMs + ktvCompletedHoldMs(units, unit),
  );
  return completedUnit
    ? ktvFrameForUnit(snapshot, units, completedUnit, positionMs, {
        completed: true,
        companionUnit: ktvTailCompanionUnit(units, completedUnit),
        nextUnit: nextKtvDisplayUnit(units, completedUnit),
      })
    : hiddenKtvFrame(snapshot);
}

function nextKtvBoundaryDelayMs(
  snapshot,
  lines,
  nowMs,
  presentationDocument = null,
) {
  if (
    snapshot?.playback?.status !== 'playing' ||
    !snapshot?.playback?.track?.id ||
    snapshot?.lyrics?.trackId !== snapshot.playback.track.id ||
    snapshot?.lyrics?.synced !== true
  ) {
    return null;
  }
  const units = projectKtvDisplayTimeline(
    snapshot,
    lines,
    presentationDocument,
  );
  if (units.length === 0) return null;
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const boundaries = units.flatMap((unit) => {
    const segments = presentationKtvSegments(unit) ?? [];
    return [
      unit.startMs,
      unit.endMs,
      unit.endMs + ktvCompletedHoldMs(units, unit),
      ...segments.flatMap((segment) => [segment.startMs, segment.endMs]),
    ];
  });
  for (const entrance of ktvEntrances(snapshot, units)) {
    boundaries.push(entrance.visibleStartMs, ...entrance.boundaries);
  }
  const nextBoundaryMs = Math.min(
    ...boundaries.filter(
      (boundaryMs) => Number.isFinite(boundaryMs) && boundaryMs > positionMs,
    ),
  );
  return Number.isFinite(nextBoundaryMs)
    ? Math.max(
        1,
        Math.ceil((nextBoundaryMs - positionMs) / playbackRate(snapshot)),
      )
    : null;
}

export function nextLyricsBoundaryDelayMs(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  if (
    snapshot?.playback?.status !== 'playing' ||
    !trackId ||
    lyrics?.trackId !== trackId ||
    lyrics?.synced !== true
  ) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const lyricPositionMs = lyricsPositionMs(snapshot, nowMs);
  const lines = Array.isArray(lyrics.lines) ? lyrics.lines : [];
  const boundaries = lines
    .flatMap((line, lineIndex) => {
      if (options.includeSegments === false) {
        return [line?.startMs, line?.endMs];
      }
      const projection = presentationLineSegments(snapshot, lines, lineIndex);
      return [
        line?.startMs,
        line?.endMs,
        ...(projection?.segments.flatMap((segment) => [
          segment.startMs,
          segment.endMs,
        ]) ?? []),
      ];
    })
    .filter(
      (boundary) => Number.isFinite(boundary) && boundary > lyricPositionMs,
    );
  if (boundaries.length === 0) return null;

  const nextBoundaryMs = Math.min(...boundaries);
  return Math.max(
    1,
    Math.ceil((nextBoundaryMs - lyricPositionMs) / playbackRate(snapshot)),
  );
}

function nextMangaBubbleBoundaryDelayMs(snapshot, options = {}) {
  const lines = Array.isArray(snapshot?.lyrics?.lines)
    ? snapshot.lyrics.lines
    : [];
  const nowMs = options.nowMs ?? Date.now();
  const lineIndex = activeLyricIndex(snapshot, lines, nowMs);
  if (!Number.isSafeInteger(lineIndex) || lineIndex < 0) return null;
  const displayText = displayableLyricsText(lines[lineIndex]?.text);
  const cachedLine = options.presentationDocument?.lines?.[lineIndex];
  const analysis =
    cachedLine?.sourceText === displayText
      ? cachedLine.analysis
      : analyzeLyricsSource(displayText);
  const timeline = mangaBubbleTimeline(
    snapshot,
    lines,
    lineIndex,
    analysis,
    text(snapshot?.lyrics?.source?.language),
  );
  if (!timeline) return null;
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const nextBoundaryMs = Math.min(
    ...timeline
      .map(({ startMs }) => startMs)
      .filter((startMs) => startMs > positionMs),
  );
  return Number.isFinite(nextBoundaryMs)
    ? Math.max(
        1,
        Math.ceil((nextBoundaryMs - positionMs) / playbackRate(snapshot)),
      )
    : null;
}

function confidence(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function musicStructureDocument(snapshot) {
  const document = snapshot?.musicStructure;
  const trackId = snapshot?.playback?.track?.id;
  if (
    !document ||
    !trackId ||
    document.trackId !== trackId ||
    !['M1', 'M2'].includes(document.level) ||
    typeof document.documentId !== 'string'
  ) {
    return null;
  }
  return document;
}

export function selectLyricsRhythmFrame(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  const nowMs = options.nowMs ?? Date.now();
  const lineIndex = Number.isSafeInteger(options.lineIndex)
    ? options.lineIndex
    : activeLyricIndex(snapshot, lines, nowMs);
  const document = musicStructureDocument(snapshot);
  if (
    !trackId ||
    lyrics?.trackId !== trackId ||
    !document ||
    !Number.isSafeInteger(lineIndex) ||
    lineIndex < 0 ||
    lineIndex >= lines.length
  ) {
    return null;
  }

  return createLyricsRhythmPresentation({
    beats: document.beats,
    lineEndMs: effectiveLineEnd(snapshot, lines, lineIndex),
    lineStartMs: lines[lineIndex]?.startMs,
    lyricsOffsetMs: lyricsOffsetMs(snapshot),
    playbackRate: playbackRate(snapshot),
    positionMs: lyricsPositionMs(snapshot, nowMs),
    tempo: document.tempo,
  });
}

function currentBeatIndexAtOrBefore(beats, positionMs) {
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const timeMs = beats[middle]?.timeMs;
    if (!Number.isFinite(timeMs)) return -1;
    if (timeMs <= positionMs) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function selectMusicStructureFrame(snapshot, options = {}) {
  const document = musicStructureDocument(snapshot);
  if (!document) return null;

  const positionMs = playbackPositionMs(snapshot, options.nowMs ?? Date.now());
  const sections = Array.isArray(document.sections) ? document.sections : [];
  const section = sections.find(
    (candidate) =>
      Number.isFinite(candidate?.startMs) &&
      Number.isFinite(candidate?.endMs) &&
      candidate.startMs <= positionMs &&
      positionMs < candidate.endMs &&
      CANONICAL_SECTION_ROLES.has(candidate.role),
  );
  const activeSection = section
    ? {
        sectionId: section.sectionId,
        role: section.role,
        confidence: confidence(section.confidence),
      }
    : null;

  const beats = Array.isArray(document.beats) ? document.beats : [];
  const currentBeatIndex = currentBeatIndexAtOrBefore(beats, positionMs);
  const beat = currentBeatIndex >= 0 ? beats[currentBeatIndex] : null;
  const currentBeat = beat
    ? {
        beatIndex: currentBeatIndex,
        timeMs: beat.timeMs,
        elapsedMs: Math.max(0, positionMs - beat.timeMs),
        positionInBar:
          Number.isSafeInteger(beat.positionInBar) && beat.positionInBar > 0
            ? beat.positionInBar
            : null,
        downbeat: beat.downbeat === true,
        confidence: confidence(beat.confidence),
      }
    : null;

  return {
    documentId: document.documentId,
    level: document.level,
    activeSection,
    currentBeat,
  };
}

function isConfident(value) {
  return confidence(value) !== null && value >= MIN_PRESENTATION_CONFIDENCE;
}

export function nextPresentationBoundaryDelayMs(snapshot, options = {}) {
  if (snapshot?.playback?.status !== 'playing') return null;

  const nowMs = options.nowMs ?? Date.now();
  const rate = playbackRate(snapshot);
  const delays = [];
  const templateId =
    typeof options.templateId === 'string' ? options.templateId : null;
  const lyricsPresentationPolicyId =
    templateId === 'live-stage'
      ? normalizeLyricsPresentationPolicyId(
          templateId,
          options.lyricsPresentationPolicyId,
        )
      : null;
  const legacyAllTemplates = templateId === null;
  const schedulerCapabilities = legacyAllTemplates
    ? null
    : new Set(lyricsTemplateCapabilities(templateId).scheduler);
  if (
    legacyAllTemplates ||
    schedulerCapabilities.has('lyrics-lines') ||
    schedulerCapabilities.has('lyrics-segments')
  ) {
    const lyricsDelay = nextLyricsBoundaryDelayMs(snapshot, {
      nowMs,
      includeSegments:
        legacyAllTemplates || schedulerCapabilities.has('lyrics-segments'),
    });
    if (lyricsDelay !== null) delays.push(lyricsDelay);
  }
  if (legacyAllTemplates || schedulerCapabilities.has('manga-bubbles')) {
    const mangaDelay = nextMangaBubbleBoundaryDelayMs(snapshot, {
      nowMs,
      presentationDocument: options.presentationDocument,
    });
    if (mangaDelay !== null) delays.push(mangaDelay);
  }
  if (legacyAllTemplates || schedulerCapabilities.has('kinetic-phrases')) {
    const kineticPopPhraseDelay = nextKineticPopPhraseBoundaryDelayMs(
      snapshot,
      { nowMs },
    );
    if (kineticPopPhraseDelay !== null) delays.push(kineticPopPhraseDelay);
  }
  if (legacyAllTemplates || schedulerCapabilities.has('ktv')) {
    const ktvDelay = nextKtvBoundaryDelayMs(
      snapshot,
      Array.isArray(snapshot?.lyrics?.lines) ? snapshot.lyrics.lines : [],
      nowMs,
      options.presentationDocument,
    );
    if (ktvDelay !== null) delays.push(ktvDelay);
  }
  if (legacyAllTemplates || schedulerCapabilities.has('live-stage-card')) {
    const liveStageDelay = nextLiveStageBoundaryDelayMs(snapshot, { nowMs });
    if (liveStageDelay !== null) delays.push(liveStageDelay);
  }
  if (legacyAllTemplates || schedulerCapabilities.has('live-stage-captions')) {
    const liveStageCaptionDelay = nextLiveStageCaptionBoundaryDelayMs(
      snapshot,
      { lyricsPresentationPolicyId, nowMs },
    );
    if (liveStageCaptionDelay !== null) delays.push(liveStageCaptionDelay);
  }

  const lyricsRhythm = selectLyricsRhythmFrame(snapshot, { nowMs });
  if (
    (legacyAllTemplates || schedulerCapabilities.has('beat-phase')) &&
    lyricsRhythm?.timingSource === 'beat-grid' &&
    Number.isFinite(lyricsRhythm.nextBeat?.delayMs) &&
    lyricsRhythm.nextBeat.delayMs > 0
  ) {
    delays.push(Math.max(1, Math.ceil(lyricsRhythm.nextBeat.delayMs)));
  }

  const document = musicStructureDocument(snapshot);
  if (
    document &&
    (legacyAllTemplates || schedulerCapabilities.has('music-sections'))
  ) {
    const positionMs = playbackPositionMs(snapshot, nowMs);
    let nextMusicBoundaryMs = Infinity;
    const considerBoundary = (boundary) => {
      if (
        Number.isFinite(boundary) &&
        boundary > positionMs &&
        boundary < nextMusicBoundaryMs
      ) {
        nextMusicBoundaryMs = boundary;
      }
    };
    for (const beat of Array.isArray(document.beats) ? document.beats : []) {
      if (isConfident(beat?.confidence)) considerBoundary(beat.timeMs);
    }
    for (const section of Array.isArray(document.sections)
      ? document.sections
      : []) {
      if (
        isConfident(section?.confidence) &&
        CANONICAL_SECTION_ROLES.has(section?.role) &&
        section.role !== 'unknown'
      ) {
        considerBoundary(section.startMs);
        considerBoundary(section.endMs);
      }
    }
    if (Number.isFinite(nextMusicBoundaryMs)) {
      delays.push(
        Math.max(1, Math.ceil((nextMusicBoundaryMs - positionMs) / rate)),
      );
    }
  }

  return delays.length > 0 ? Math.min(...delays) : null;
}

export function selectLyricsFrame(snapshot, options = {}) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  const nowMs = options.nowMs ?? Date.now();
  const activeIndex = activeLyricIndex(snapshot, lines, nowMs);
  if (
    !trackId ||
    lyrics?.trackId !== trackId ||
    !Number.isSafeInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= lines.length
  ) {
    return hiddenLyricsFrame(snapshot);
  }

  const currentText = displayableLyricsText(lines[activeIndex]?.text);
  const readingLine = lyrics?.reading?.lines?.[activeIndex];
  const currentReading =
    readingLine?.text === lines[activeIndex]?.text &&
    Array.isArray(readingLine.segments)
      ? readingLine
      : null;
  let nextText = '';
  let nextIndex = null;
  for (let index = activeIndex + 1; index < lines.length; index += 1) {
    nextText = displayableLyricsText(lines[index]?.text);
    if (nextText) {
      nextIndex = index;
      break;
    }
  }

  const currentSegmentProjection = projectCurrentSegments(
    snapshot,
    lines,
    activeIndex,
    nowMs,
  );
  const currentSegments = currentSegmentProjection?.segments ?? null;
  const lineEndMs = effectiveLineEnd(snapshot, lines, activeIndex);
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineProgress =
    lyrics?.synced === true && Number.isFinite(lines[activeIndex]?.startMs)
      ? boundedProgress(positionMs, lines[activeIndex].startMs, lineEndMs)
      : null;
  const lineRemainingMs =
    !currentSegments &&
    lineProgress !== null &&
    snapshot?.playback?.status === 'playing' &&
    Number.isFinite(lineEndMs)
      ? Math.max(0, (lineEndMs - positionMs) / playbackRate(snapshot))
      : null;
  const musicStructure = selectMusicStructureFrame(snapshot, options);
  const lyricsRhythm = selectLyricsRhythmFrame(snapshot, {
    lineIndex: activeIndex,
    nowMs,
  });
  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
    lineIndex: activeIndex,
    currentVisibleLineIndex: visibleLyricLineIndex(lines, activeIndex),
    nextVisibleLineIndex: visibleLyricLineIndex(lines, nextIndex),
    ...(currentReading ? { currentReading } : {}),
    ...(snapshot?.playback?.status === 'seeking'
      ? { timelineDiscontinuity: true }
      : {}),
    ...(lineProgress !== null ? { lineProgress } : {}),
    ...(lineRemainingMs !== null ? { lineRemainingMs } : {}),
    ...(currentSegments
      ? {
          currentSegments,
          currentTimingSource: currentSegmentProjection.timingSource,
        }
      : {}),
    ...(musicStructure ? { musicStructure } : {}),
    ...(lyricsRhythm ? { lyricsRhythm } : {}),
  };
}

export function selectLyricsOverlayFrame(snapshot, options = {}) {
  const frame = selectLyricsFrame(snapshot, options);
  const lines = Array.isArray(snapshot?.lyrics?.lines)
    ? snapshot.lyrics.lines
    : [];
  const nowMs = options.nowMs ?? Date.now();
  const templateId =
    typeof options.templateId === 'string' ? options.templateId : null;
  const lyricsPresentationPolicyId =
    templateId === 'live-stage'
      ? normalizeLyricsPresentationPolicyId(
          templateId,
          options.lyricsPresentationPolicyId,
        )
      : null;
  const legacyAllTemplates = templateId === null;
  const needsSourceAnalysis =
    legacyAllTemplates || ['manga-frame', 'live-stage'].includes(templateId);
  const sourceAnalysis = needsSourceAnalysis
    ? options.presentationDocument?.lines?.[frame.lineIndex]?.sourceText ===
      frame.currentText
      ? options.presentationDocument.lines[frame.lineIndex].analysis
      : analyzeLyricsSource(frame.currentText)
    : null;
  const mangaBubbleTiming =
    templateId === 'manga-frame' && frame.currentTimingSource === 't2'
      ? projectMangaBubbleTiming(
          snapshot,
          lines,
          frame.lineIndex,
          sourceAnalysis,
          frame.language,
          lyricsPositionMs(snapshot, nowMs),
        )
      : null;
  const kineticPopBase =
    templateId === 'kinetic-pop'
      ? adaptKineticPopLyricsPresentation(frame.currentText, {
          lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex,
          lineProgress: frame.lineProgress,
          kineticMaterial: options.kineticMaterial,
        })
      : null;
  const kineticPopTimeline =
    kineticPopBase && frame.currentTimingSource === 't2'
      ? kineticPopPhraseTimeline(
          snapshot,
          lines,
          frame.lineIndex,
          kineticPopBase,
        )
      : null;
  const kineticPopPhraseIndex = kineticPopTimeline
    ? Math.max(
        0,
        kineticPopTimeline.filter(
          ({ startMs }) => startMs <= lyricsPositionMs(snapshot, nowMs),
        ).length - 1,
      )
    : null;
  const kineticPop =
    kineticPopBase && kineticPopPhraseIndex !== null
      ? adaptKineticPopLyricsPresentation(frame.currentText, {
          lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex,
          kineticMaterial: options.kineticMaterial,
          phraseIndex: kineticPopPhraseIndex,
          phraseTimingSource: 't2',
        })
      : kineticPopBase;
  const liveStageTimeline =
    templateId === 'live-stage' && frame.currentTimingSource === 't2'
      ? liveStagePageTimeline(
          snapshot,
          lines,
          frame.lineIndex,
          sourceAnalysis,
          lyricsPresentationPolicyId,
        )
      : null;
  const liveStagePageIndex = liveStageTimeline
    ? Math.max(
        0,
        liveStageTimeline.filter(
          ({ startMs }) => startMs <= lyricsPositionMs(snapshot, nowMs),
        ).length - 1,
      )
    : null;
  const cachedOrnateLine =
    options.presentationDocument?.lines?.[frame.lineIndex];
  const ornateVertical =
    templateId === 'ornate-vertical'
      ? cachedOrnateLine?.sourceText === frame.currentText
        ? cachedOrnateLine.presentation
        : adaptOrnateVerticalLyricsPresentation(frame.currentText, {
            documentContext: createOrnateVerticalDocumentContext(lines),
            lineIndex: frame.lineIndex,
          })
      : null;
  return {
    ...frame,
    ...(snapshot?.playback?.status === 'seeking'
      ? { timelineDiscontinuity: true }
      : {}),
    ...(needsSourceAnalysis ? { lyricsSourceAnalysis: sourceAnalysis } : {}),
    ...(lyricsPresentationPolicyId ? { lyricsPresentationPolicyId } : {}),
    ...(liveStagePageIndex !== null
      ? {
          liveStagePageIndex,
          liveStagePageTimingSource: 't2',
        }
      : {}),
    ...(mangaBubbleTiming ? { mangaBubbleTiming } : {}),
    ...(kineticPop ? { kineticPop } : {}),
    ...(ornateVertical ? { ornateVertical } : {}),
    ...(legacyAllTemplates || templateId === 'karaoke-stack'
      ? {
          ktv: selectKtvLyricsFrame(
            snapshot,
            lines,
            nowMs,
            options.presentationDocument,
          ),
        }
      : {}),
    ...(legacyAllTemplates || templateId === 'live-stage'
      ? { liveStage: selectLiveStageFrame(snapshot, options) }
      : {}),
  };
}

export function selectNowPlayingFrame(snapshot) {
  const track = snapshot?.playback?.track;
  const nextItem = (
    Array.isArray(snapshot?.queue?.items) ? snapshot.queue.items : []
  ).find((item) => item?.state === 'queued');
  const title = text(track?.title);
  return {
    revision: revision(snapshot),
    visible: Boolean(track && title),
    trackId: text(track?.id),
    title,
    artist: text(track?.artist),
    nextTitle: text(nextItem?.track?.title),
  };
}

export function selectArtworkFrame(snapshot, options = {}) {
  const frame = selectNowPlayingFrame(snapshot);
  const positionMs = playbackPositionMs(snapshot, options.nowMs ?? Date.now());
  const durationMs = Number.isFinite(snapshot?.playback?.durationMs)
    ? Math.max(0, snapshot.playback.durationMs)
    : 0;
  const boundedPositionMs = Math.max(0, positionMs);
  const progress =
    durationMs > 0
      ? Math.min(1, Math.max(0, boundedPositionMs / durationMs))
      : 0;

  return {
    ...frame,
    playbackStatus: ARTWORK_PLAYBACK_STATUSES.has(snapshot?.playback?.status)
      ? snapshot.playback.status
      : 'idle',
    positionMs: boundedPositionMs,
    durationMs,
    progress,
  };
}

export function selectSetlistFrame(snapshot) {
  const items = Array.isArray(snapshot?.queue?.items)
    ? snapshot.queue.items
    : [];
  const projectTrack = (item) => {
    const title = text(item?.track?.title);
    return title
      ? {
          trackId: text(item?.track?.id),
          title,
          artist: text(item?.track?.artist),
        }
      : null;
  };
  const current = projectTrack(items.find((item) => item?.state === 'current'));
  const history = items
    .filter((item) => item?.state === 'played')
    .map(projectTrack)
    .filter(Boolean);

  return {
    revision: revision(snapshot),
    visible: Boolean(current || history.length),
    sourceName: text(snapshot?.queue?.sourceName),
    current,
    history,
  };
}
