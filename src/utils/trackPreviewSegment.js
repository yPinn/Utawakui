import { findLyricChorusStart } from './trackPreviewLyricChorus.js';

export const PREVIEW_SEGMENT_SECONDS = 30;
const FALLBACK_START_RATIO = 0.3;
// Entry buffer absorbs line-timing error and lets the build-up be heard.
const LEAD_IN_SECONDS = 2;
const MIN_BAR_LEAD_SECONDS = 1;
const MAX_BAR_LEAD_SECONDS = 5;
const MIN_BEAT_CONFIDENCE = 0.5;

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

// Lyrics run on their own clock: lyric time = audio time + offset.
function lyricChorusStartSeconds(lyrics, durationSeconds) {
  const start = findLyricChorusStart(lyrics?.lines, durationSeconds);
  if (start === null) return null;
  const offset = Number.isFinite(lyrics.offsetSeconds)
    ? lyrics.offsetSeconds
    : 0;
  return Math.max(0, start - offset);
}

// Enters on the confident bar start just before the target, else a fixed
// lead-in.
function entrySeconds(target, structure) {
  const beats = Array.isArray(structure?.beats) ? structure.beats : [];
  let entry = null;
  for (const beat of beats) {
    const seconds = beat?.timeMs / 1000;
    if (
      beat?.positionInBar === 1 &&
      beat.confidence >= MIN_BEAT_CONFIDENCE &&
      seconds >= target - MAX_BAR_LEAD_SECONDS &&
      seconds <= target - MIN_BAR_LEAD_SECONDS
    ) {
      entry = Math.max(entry ?? seconds, seconds);
    }
  }
  return entry ?? target - LEAD_IN_SECONDS;
}

// Starts before the first analysed chorus, else a lyric-estimated chorus,
// else 30% in; a short track or a late start slides back to fit the window.
// `source` stays internal to the preview owner.
export function resolvePreviewSegment({
  durationSeconds,
  structure,
  lyrics,
} = {}) {
  const duration =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : null;
  const analysedStart = firstChorusStartSeconds(structure);
  const lyricStart =
    analysedStart === null ? lyricChorusStartSeconds(lyrics, duration) : null;
  const source =
    analysedStart !== null
      ? 'chorus'
      : lyricStart !== null
        ? 'lyrics'
        : 'estimated';
  const target =
    analysedStart ?? lyricStart ?? (duration ?? 0) * FALLBACK_START_RATIO;
  const preferredStart = target > 0 ? entrySeconds(target, structure) : 0;

  if (duration === null) {
    const start = Math.max(0, preferredStart);
    return { start, end: start + PREVIEW_SEGMENT_SECONDS, source };
  }

  const length = Math.min(PREVIEW_SEGMENT_SECONDS, duration);
  const start = Math.max(0, Math.min(preferredStart, duration - length));
  return { start, end: start + length, source };
}
