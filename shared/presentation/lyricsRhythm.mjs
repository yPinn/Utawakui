const MIN_PRESENTATION_CONFIDENCE = 0.5;
const MIN_BPM = 20;
const MAX_BPM = 400;
const LOCAL_GRID_BEAT_COUNT = 4;
const MAX_LINE_BEAT_SCAN = 128;
const MIN_REGULAR_INTERVAL_RATIO = 0.75;
const MAX_REGULAR_INTERVAL_RATIO = 1.25;
const BASELINE_BEAT_DURATION_MS = 500;
const MIN_MOTION_SCALE = 0.75;
const MAX_MOTION_SCALE = 1.35;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function confident(value) {
  return (
    Number.isFinite(value) && value >= MIN_PRESENTATION_CONFIDENCE && value <= 1
  );
}

export function confidentTempo(rawTempo) {
  const bpm = rawTempo?.bpm;
  return Number.isFinite(bpm) &&
    bpm >= MIN_BPM &&
    bpm <= MAX_BPM &&
    confident(rawTempo?.confidence)
    ? bpm
    : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function beatTimeMs(beats, beatIndex, lyricsOffsetMs) {
  const timeMs = beats[beatIndex]?.timeMs;
  return Number.isFinite(timeMs) ? timeMs + lyricsOffsetMs : null;
}

function firstBeatAtOrAfter(beats, targetMs, lyricsOffsetMs) {
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const timeMs = beatTimeMs(beats, middle, lyricsOffsetMs);
    if (!Number.isFinite(timeMs)) return null;
    if (timeMs < targetMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstBeatAfter(beats, targetMs, lyricsOffsetMs) {
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const timeMs = beatTimeMs(beats, middle, lyricsOffsetMs);
    if (!Number.isFinite(timeMs)) return null;
    if (timeMs <= targetMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function beatCandidate(beats, beatIndex, lyricsOffsetMs) {
  if (beatIndex < 0 || beatIndex >= beats.length) return null;
  const beat = beats[beatIndex];
  const lyricsTimeMs = beatTimeMs(beats, beatIndex, lyricsOffsetMs);
  return Number.isFinite(lyricsTimeMs) && confident(beat?.confidence)
    ? { beat, beatIndex, lyricsTimeMs }
    : null;
}

function localRegularGrid(beats, positionMs, lyricsOffsetMs) {
  if (beats.length < LOCAL_GRID_BEAT_COUNT) return null;
  const firstFutureIndex = firstBeatAfter(beats, positionMs, lyricsOffsetMs);
  if (firstFutureIndex === null) return null;
  const pivotIndex =
    firstFutureIndex >= beats.length ? beats.length - 1 : firstFutureIndex;
  const maximumStart = beats.length - LOCAL_GRID_BEAT_COUNT;
  const startIndex = clamp(pivotIndex - 2, 0, maximumStart);
  const window = Array.from({ length: LOCAL_GRID_BEAT_COUNT }, (_, index) =>
    beatCandidate(beats, startIndex + index, lyricsOffsetMs),
  );
  if (window.some((candidate) => candidate === null)) return null;

  const intervals = window
    .slice(1)
    .map(
      (candidate, index) => candidate.lyricsTimeMs - window[index].lyricsTimeMs,
    );
  const typicalIntervalMs = median(intervals);
  if (!Number.isFinite(typicalIntervalMs) || typicalIntervalMs <= 0) {
    return null;
  }
  const regular = intervals.every(
    (intervalMs) =>
      intervalMs >= typicalIntervalMs * MIN_REGULAR_INTERVAL_RATIO &&
      intervalMs <= typicalIntervalMs * MAX_REGULAR_INTERVAL_RATIO,
  );
  return regular
    ? { beatDurationMs: typicalIntervalMs, firstFutureIndex }
    : null;
}

function projectedBeat(candidate, options = {}) {
  if (!candidate) return null;
  const beat = candidate.beat;
  return {
    beatIndex: candidate.beatIndex,
    lyricsTimeMs: candidate.lyricsTimeMs,
    ...(Number.isSafeInteger(beat.positionInBar) && beat.positionInBar > 0
      ? { positionInBar: beat.positionInBar }
      : {}),
    downbeat: beat.downbeat === true,
    confidence: beat.confidence,
    ...(Number.isFinite(options.delayMs) ? { delayMs: options.delayMs } : {}),
  };
}

function lineBeatProjection(
  beats,
  lineStartMs,
  lineEndMs,
  currentBeat,
  lyricsOffsetMs,
) {
  if (
    !Number.isFinite(lineStartMs) ||
    !Number.isFinite(lineEndMs) ||
    lineEndMs <= lineStartMs
  ) {
    return { lineBeatCount: null, lineBeatIndex: null };
  }
  const firstLineBeatIndex = firstBeatAtOrAfter(
    beats,
    lineStartMs,
    lyricsOffsetMs,
  );
  const afterLineBeatIndex = firstBeatAtOrAfter(
    beats,
    lineEndMs,
    lyricsOffsetMs,
  );
  if (firstLineBeatIndex === null || afterLineBeatIndex === null) {
    return { lineBeatCount: null, lineBeatIndex: null };
  }
  if (afterLineBeatIndex - firstLineBeatIndex > MAX_LINE_BEAT_SCAN) {
    return { lineBeatCount: null, lineBeatIndex: null };
  }
  let lineBeatCount = 0;
  let lineBeatIndex = null;
  for (
    let beatIndex = firstLineBeatIndex;
    beatIndex < afterLineBeatIndex;
    beatIndex += 1
  ) {
    if (!confident(beats[beatIndex]?.confidence)) continue;
    if (currentBeat?.beatIndex === beatIndex) lineBeatIndex = lineBeatCount;
    lineBeatCount += 1;
  }
  return {
    lineBeatCount,
    lineBeatIndex,
  };
}

function estimatedLineBeatCount(lineStartMs, lineEndMs, beatDurationMs) {
  if (
    !Number.isFinite(lineStartMs) ||
    !Number.isFinite(lineEndMs) ||
    lineEndMs <= lineStartMs
  ) {
    return null;
  }
  return Math.max(1, Math.round((lineEndMs - lineStartMs) / beatDurationMs));
}

function motionScale(beatDurationMs) {
  return rounded(
    clamp(
      beatDurationMs / BASELINE_BEAT_DURATION_MS,
      MIN_MOTION_SCALE,
      MAX_MOTION_SCALE,
    ),
  );
}

export function scaleLyricsMotionDuration(value, rhythm) {
  const duration = value;
  if (!Number.isFinite(duration) || duration < 0) return 0;
  const scale = rhythm?.motionScale;
  return rounded(
    duration *
      (Number.isFinite(scale)
        ? clamp(scale, MIN_MOTION_SCALE, MAX_MOTION_SCALE)
        : 1),
  );
}

export function createLyricsRhythmPresentation(options = {}) {
  const positionMs = options.positionMs;
  if (!Number.isFinite(positionMs)) return null;

  const bpm = confidentTempo(options.tempo);
  const beats = Array.isArray(options.beats) ? options.beats : [];
  const lyricsOffsetMs = Number.isFinite(options.lyricsOffsetMs)
    ? options.lyricsOffsetMs
    : 0;
  const grid = localRegularGrid(beats, positionMs, lyricsOffsetMs);
  const playbackRate =
    Number.isFinite(options.playbackRate) && options.playbackRate > 0
      ? options.playbackRate
      : 1;

  if (grid) {
    const currentBeat = beatCandidate(
      beats,
      grid.firstFutureIndex - 1,
      lyricsOffsetMs,
    );
    const nextBeat = beatCandidate(
      beats,
      grid.firstFutureIndex,
      lyricsOffsetMs,
    );
    const nextDelayMs = nextBeat
      ? Math.max(
          0,
          Math.ceil((nextBeat.lyricsTimeMs - positionMs) / playbackRate),
        )
      : null;
    const beatProgress =
      currentBeat && nextBeat
        ? clamp(
            (positionMs - currentBeat.lyricsTimeMs) /
              (nextBeat.lyricsTimeMs - currentBeat.lyricsTimeMs),
            0,
            1,
          )
        : null;
    const lineProjection = lineBeatProjection(
      beats,
      options.lineStartMs,
      options.lineEndMs,
      currentBeat,
      lyricsOffsetMs,
    );
    const beatDurationMs = rounded(grid.beatDurationMs);
    return {
      timingSource: 'beat-grid',
      bpm,
      beatDurationMs,
      beatProgress: beatProgress === null ? null : rounded(beatProgress, 4),
      ...lineProjection,
      motionScale: motionScale(beatDurationMs),
      currentBeat: projectedBeat(currentBeat),
      nextBeat: projectedBeat(nextBeat, { delayMs: nextDelayMs }),
    };
  }

  if (bpm === null) return null;
  const beatDurationMs = rounded(60000 / bpm);
  return {
    timingSource: 'tempo',
    bpm,
    beatDurationMs,
    beatProgress: null,
    lineBeatCount: estimatedLineBeatCount(
      options.lineStartMs,
      options.lineEndMs,
      beatDurationMs,
    ),
    lineBeatIndex: null,
    motionScale: motionScale(beatDurationMs),
    currentBeat: null,
    nextBeat: null,
  };
}
