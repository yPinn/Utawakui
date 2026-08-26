// Pure canonical snapshot projection shared across renderer and Browser Source.
import {
  adaptKtvLyricsPresentation,
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
  parseKtvDisplayPhrases,
} from './lyricsPresentation.mjs';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function displayableLyricsText(value) {
  const normalized = text(value);
  if (!normalized) return '';
  const analysis = analyzeLyricsSource(normalized);
  return analysis.speaker && analysis.units.length === 0 ? '' : normalized;
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
const KTV_COMPLETED_HOLD_MS = 600;

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

function projectCurrentSegments(snapshot, lines, lineIndex, nowMs) {
  const line = lines[lineIndex];
  const segments = Array.isArray(line?.segments) ? line.segments : [];
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        typeof segment?.segmentId !== 'string' ||
        typeof segment?.text !== 'string' ||
        !Number.isFinite(segment?.startMs),
    ) ||
    segments.map((segment) => segment.text).join('') !== line.text
  ) {
    return null;
  }

  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const lineEndMs = effectiveLineEnd(snapshot, lines, lineIndex);
  const rate = playbackRate(snapshot);
  const isPlaying = snapshot?.playback?.status === 'playing';
  return segments.map((segment, index) => {
    const nextStartMs = segments[index + 1]?.startMs;
    const endMs = Number.isFinite(segment.endMs)
      ? segment.endMs
      : Number.isFinite(nextStartMs)
        ? nextStartMs
        : lineEndMs;
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
  const presentation = adaptLiveStageLyricsPresentation(
    analyzeLyricsSource(text(line.text)),
    { lineProgress },
  );
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

function timedVisibleLyricsLines(lines) {
  return lines
    .map((line, sourceLineIndex) => ({ line, sourceLineIndex }))
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

function ktvLineVisualWeight(line, language) {
  return parseKtvDisplayPhrases(analyzeLyricsSource(text(line?.text)), {
    language,
  }).reduce((total, phrase) => total + phrase.visualWeight, 0);
}

function estimatedKtvLineDurationMs(
  line,
  language,
  typicalIntervalMs,
  medianWeight,
) {
  const lineWeight = ktvLineVisualWeight(line, language);
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
  const line = timedLines[timedLineIndex].line;
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
  const segments = Array.isArray(line?.segments) ? line.segments : [];
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        typeof segment?.segmentId !== 'string' ||
        typeof segment?.text !== 'string' ||
        !Number.isFinite(segment?.startMs),
    ) ||
    segments.map((segment) => segment.text).join('') !== line.text
  ) {
    return null;
  }

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

function projectKtvDisplayTimeline(snapshot, lines) {
  const language = text(snapshot?.lyrics?.source?.language);
  const timedLines = timedVisibleLyricsLines(lines);
  const typicalIntervalMs = typicalKtvLineIntervalMs(timedLines);
  const weights = timedLines
    .map(({ line }) => ktvLineVisualWeight(line, language))
    .filter((weight) => weight > 0);
  const medianWeight = median(weights);
  const units = [];

  timedLines.forEach(({ line, sourceLineIndex }, timedLineIndex) => {
    const analysis = analyzeLyricsSource(text(line.text));
    const presentation = adaptKtvLyricsPresentation(analysis, { language });
    const phrases = parseKtvDisplayPhrases(analysis, { language });
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
  });

  return units;
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

function projectKtvSegments(snapshot, unit, positionMs) {
  const segments = Array.isArray(unit?.segments) ? unit.segments : [];
  if (segments.length === 0) return null;
  const rate = playbackRate(snapshot);
  const isPlaying = snapshot?.playback?.status === 'playing';
  return segments.map((segment, index) => {
    const endMs = Number.isFinite(segment.endMs)
      ? segment.endMs
      : (segments[index + 1]?.startMs ?? unit.endMs);
    const progress = boundedProgress(positionMs, segment.startMs, endMs);
    const state =
      positionMs < segment.startMs
        ? 'upcoming'
        : positionMs >= endMs
          ? 'past'
          : 'active';
    return {
      segmentId: segment.segmentId,
      text: segment.text,
      state,
      progress: state === 'past' ? 1 : state === 'upcoming' ? 0 : progress,
      remainingMs:
        state === 'active' && isPlaying
          ? Math.max(0, (endMs - positionMs) / rate)
          : null,
    };
  });
}

function ktvFrameForUnit(snapshot, units, unit, positionMs, options = {}) {
  const nextUnit = options.completed
    ? null
    : Object.hasOwn(options, 'nextUnit')
      ? options.nextUnit
      : nextKtvDisplayUnit(units, unit);
  const lineProgress = options.completed
    ? 1
    : options.preRoll
      ? 0
      : boundedProgress(positionMs, unit.startMs, unit.endMs);
  const currentSegments = options.preRoll
    ? null
    : projectKtvSegments(snapshot, unit, positionMs);
  return {
    revision: revision(snapshot),
    visible: true,
    currentText: unit.text,
    nextText: nextUnit?.text ?? '',
    language: text(snapshot?.lyrics?.source?.language),
    lineIndex: unit.sourceLineIndex,
    currentVisibleLineIndex: unit.displayUnitIndex,
    nextVisibleLineIndex: nextUnit?.displayUnitIndex ?? null,
    lineProgress,
    lineRemainingMs:
      !options.preRoll &&
      !options.completed &&
      !currentSegments &&
      snapshot?.playback?.status === 'playing'
        ? Math.max(0, (unit.endMs - positionMs) / playbackRate(snapshot))
        : null,
    currentRole: unit.role,
    nextRole: nextUnit?.role ?? 'solo',
    currentTimingSource: unit.timingSource,
    ...(currentSegments ? { currentSegments } : {}),
    ...(Number.isFinite(options.laneReplacementDelayMs)
      ? { laneReplacementDelayMs: options.laneReplacementDelayMs }
      : {}),
    countIn: options.countIn ?? null,
  };
}

function selectKtvLyricsFrame(snapshot, lines, nowMs) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  if (!trackId || lyrics?.trackId !== trackId || lyrics?.synced !== true) {
    return hiddenKtvFrame(snapshot);
  }
  const units = projectKtvDisplayTimeline(snapshot, lines);
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
        : {}),
    });
  }

  if (entrance) {
    return ktvFrameForUnit(snapshot, units, entrance.unit, positionMs, {
      preRoll: true,
      laneReplacementDelayMs: Number.isFinite(entrance.previousEndMs)
        ? Math.max(
            0,
            entrance.previousEndMs + KTV_COMPLETED_HOLD_MS - positionMs,
          )
        : 0,
      countIn: ktvCountInForEntrance(entrance, positionMs),
    });
  }

  const completedUnit = units.findLast(
    (unit) =>
      positionMs >= unit.endMs &&
      positionMs < unit.endMs + KTV_COMPLETED_HOLD_MS,
  );
  return completedUnit
    ? ktvFrameForUnit(snapshot, units, completedUnit, positionMs, {
        completed: true,
      })
    : hiddenKtvFrame(snapshot);
}

function nextKtvBoundaryDelayMs(snapshot, lines, nowMs) {
  if (
    snapshot?.playback?.status !== 'playing' ||
    !snapshot?.playback?.track?.id ||
    snapshot?.lyrics?.trackId !== snapshot.playback.track.id ||
    snapshot?.lyrics?.synced !== true
  ) {
    return null;
  }
  const units = projectKtvDisplayTimeline(snapshot, lines);
  if (units.length === 0) return null;
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  const boundaries = units.flatMap((unit) => [
    unit.startMs,
    unit.endMs,
    unit.endMs + KTV_COMPLETED_HOLD_MS,
  ]);
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

function firstTimedVisibleLyric(lines) {
  const lineIndex = lines.findIndex(
    (line) =>
      Number.isFinite(line?.startMs) &&
      Boolean(displayableLyricsText(line.text)),
  );
  if (lineIndex < 0) return null;
  return {
    lineIndex,
    line: lines[lineIndex],
    visibleLineIndex: visibleLyricLineIndex(lines, lineIndex),
  };
}

function lyricsCountInTimeline(snapshot, lines) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  if (!trackId || lyrics?.trackId !== trackId || lyrics?.synced !== true) {
    return null;
  }

  const firstLyric = firstTimedVisibleLyric(lines);
  if (!firstLyric) return null;
  const lineStartMs = firstLyric.line.startMs;
  const countIn = musicalCountInBoundaries(snapshot, lineStartMs);

  return {
    ...firstLyric,
    ...countIn,
    lineStartMs,
  };
}

function projectLyricsCountIn(snapshot, lines, nowMs) {
  const timeline = lyricsCountInTimeline(snapshot, lines);
  if (!timeline) return null;
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  if (
    positionMs < timeline.boundaries[0] ||
    positionMs >= timeline.lineStartMs
  ) {
    return null;
  }

  const nextBoundaryIndex = timeline.boundaries.findIndex(
    (boundaryMs) => boundaryMs > positionMs,
  );
  const elapsedBeatCount = Math.max(0, nextBoundaryIndex - 1);
  return {
    text: timeline.line.text,
    lineIndex: timeline.lineIndex,
    visibleLineIndex: timeline.visibleLineIndex,
    remainingBeats: Math.max(1, LYRICS_COUNT_IN_BEATS - elapsedBeatCount),
    totalBeats: LYRICS_COUNT_IN_BEATS,
    timingSource: timeline.timingSource,
  };
}

function nextLyricsCountInBoundaryMs(snapshot, lines, nowMs) {
  const timeline = lyricsCountInTimeline(snapshot, lines);
  if (!timeline) return null;
  const positionMs = lyricsPositionMs(snapshot, nowMs);
  return (
    timeline.boundaries.find((boundaryMs) => boundaryMs > positionMs) ?? null
  );
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
    .flatMap((line) => [
      line?.startMs,
      line?.endMs,
      ...(Array.isArray(line?.segments)
        ? line.segments.flatMap((segment) => [segment?.startMs, segment?.endMs])
        : []),
    ])
    .filter(
      (boundary) => Number.isFinite(boundary) && boundary > lyricPositionMs,
    );
  const countInBoundaryMs = nextLyricsCountInBoundaryMs(snapshot, lines, nowMs);
  if (Number.isFinite(countInBoundaryMs)) boundaries.push(countInBoundaryMs);
  if (boundaries.length === 0) return null;

  const nextBoundaryMs = Math.min(...boundaries);
  return Math.max(
    1,
    Math.ceil((nextBoundaryMs - lyricPositionMs) / playbackRate(snapshot)),
  );
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
  let currentBeatIndex = -1;
  let currentBeatTimeMs = -Infinity;
  for (let index = 0; index < beats.length; index += 1) {
    const timeMs = beats[index]?.timeMs;
    if (
      Number.isFinite(timeMs) &&
      timeMs <= positionMs &&
      timeMs >= currentBeatTimeMs
    ) {
      currentBeatIndex = index;
      currentBeatTimeMs = timeMs;
    }
  }
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
  const lyricsDelay = nextLyricsBoundaryDelayMs(snapshot, { nowMs });
  if (lyricsDelay !== null) delays.push(lyricsDelay);
  const ktvDelay = nextKtvBoundaryDelayMs(
    snapshot,
    Array.isArray(snapshot?.lyrics?.lines) ? snapshot.lyrics.lines : [],
    nowMs,
  );
  if (ktvDelay !== null) delays.push(ktvDelay);
  const liveStageDelay = nextLiveStageBoundaryDelayMs(snapshot, { nowMs });
  if (liveStageDelay !== null) delays.push(liveStageDelay);
  const liveStageCaptionDelay = nextLiveStageCaptionBoundaryDelayMs(snapshot, {
    nowMs,
  });
  if (liveStageCaptionDelay !== null) delays.push(liveStageCaptionDelay);

  const document = musicStructureDocument(snapshot);
  if (document) {
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
  const countIn = projectLyricsCountIn(snapshot, lines, nowMs);
  if (countIn) {
    return {
      ...hiddenLyricsFrame(snapshot),
      language: text(lyrics?.source?.language),
      countIn,
    };
  }
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
  let nextText = '';
  let nextIndex = null;
  for (let index = activeIndex + 1; index < lines.length; index += 1) {
    nextText = displayableLyricsText(lines[index]?.text);
    if (nextText) {
      nextIndex = index;
      break;
    }
  }

  const currentSegments = projectCurrentSegments(
    snapshot,
    lines,
    activeIndex,
    nowMs,
  );
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
  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
    lineIndex: activeIndex,
    currentVisibleLineIndex: visibleLyricLineIndex(lines, activeIndex),
    nextVisibleLineIndex: visibleLyricLineIndex(lines, nextIndex),
    ...(snapshot?.playback?.status === 'seeking'
      ? { timelineDiscontinuity: true }
      : {}),
    ...(lineProgress !== null ? { lineProgress } : {}),
    ...(lineRemainingMs !== null ? { lineRemainingMs } : {}),
    ...(currentSegments ? { currentSegments } : {}),
    ...(musicStructure ? { musicStructure } : {}),
  };
}

export function selectLyricsOverlayFrame(snapshot, options = {}) {
  const frame = selectLyricsFrame(snapshot, options);
  const lines = Array.isArray(snapshot?.lyrics?.lines)
    ? snapshot.lyrics.lines
    : [];
  const nowMs = options.nowMs ?? Date.now();
  return {
    ...frame,
    ...(snapshot?.playback?.status === 'seeking'
      ? { timelineDiscontinuity: true }
      : {}),
    lyricsSourceAnalysis: analyzeLyricsSource(frame.currentText),
    ktv: selectKtvLyricsFrame(snapshot, lines, nowMs),
    liveStage: selectLiveStageFrame(snapshot, options),
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
    playbackStatus: ['playing', 'paused'].includes(snapshot?.playback?.status)
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
  const currentIndex = items.findIndex((item) => item?.state === 'current');
  const start = Math.max(0, currentIndex > 1 ? currentIndex - 1 : 0);
  const rows = items.slice(start, start + 8).flatMap((item) => {
    const title = text(item?.track?.title);
    if (!title || !['played', 'current', 'queued'].includes(item?.state)) {
      return [];
    }
    return [
      {
        state: item.state,
        title,
        artist: text(item?.track?.artist),
      },
    ];
  });

  return {
    revision: revision(snapshot),
    visible: rows.length > 0,
    sourceName: text(snapshot?.queue?.sourceName),
    rows,
  };
}
