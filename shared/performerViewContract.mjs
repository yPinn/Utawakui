import timingLimits from './lyricsTimingValues.json' with { type: 'json' };

export const PERFORMER_READING_SCALES = Object.freeze([
  'near',
  'desk',
  'stage',
]);

export const PERFORMER_READING_VARIANTS = Object.freeze([
  'off',
  'furigana',
  'romaji',
]);

export const PERFORMER_LYRICS_OFFSET_ACTIONS = Object.freeze([
  'delay',
  'reset',
  'advance',
  'retry',
]);

const READING_SCALE_SET = new Set(PERFORMER_READING_SCALES);
const READING_VARIANT_SET = new Set(PERFORMER_READING_VARIANTS);
const LYRICS_OFFSET_ACTION_SET = new Set(PERFORMER_LYRICS_OFFSET_ACTIONS);
const MAX_TRACK_ID_LENGTH = 200;

export function isPerformerReadingScale(value) {
  return READING_SCALE_SET.has(value);
}

export function normalizePerformerReadingScale(value) {
  return isPerformerReadingScale(value) ? value : 'desk';
}

export function isPerformerReadingVariant(value) {
  return READING_VARIANT_SET.has(value);
}

export function normalizePerformerReadingVariant(value) {
  return isPerformerReadingVariant(value) ? value : 'off';
}

function parseIntent(value, actions, name) {
  const invalid = (path, reason) => {
    throw new TypeError(`Invalid performer ${name} intent ${path}: ${reason}`);
  };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('root', 'expected an object');
  }
  if (!actions.has(value.action)) {
    invalid('action', 'expected a supported action');
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    invalid('revision', 'expected a non-negative safe integer');
  }
  if (
    typeof value.trackId !== 'string' ||
    value.trackId.length === 0 ||
    value.trackId.length > MAX_TRACK_ID_LENGTH
  ) {
    invalid('trackId', `expected 1-${MAX_TRACK_ID_LENGTH} characters`);
  }
  return {
    action: value.action,
    revision: value.revision,
    trackId: value.trackId,
  };
}

export function parsePerformerLyricsOffsetIntent(value) {
  return parseIntent(value, LYRICS_OFFSET_ACTION_SET, 'lyrics offset');
}

const CONTROL_ACTIONS = new Set([
  'play',
  'pause',
  'reading-off',
  'reading-furigana',
  'reading-romaji',
]);
export function parsePerformerControlIntent(value) {
  return parseIntent(value, CONTROL_ACTIONS, 'control');
}

// A bounded presentation cue for the current published line, never a timing
// document or an authoring intent. Older snapshots simply omit this member.
export function parsePerformerWordCue(value, state) {
  if (value == null) return null;
  const invalid = () => {
    throw new TypeError('Invalid performer snapshot wordCue');
  };
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'endMs,from,lineIndex,startMs,to'
  )
    invalid();
  const { lineIndex, from, to, startMs, endMs } = value;
  const lyrics = state?.lyrics,
    line = lyrics?.lines?.[lineIndex];
  if (
    !Number.isSafeInteger(lineIndex) ||
    lineIndex < 0 ||
    lineIndex !== lyrics?.activeLineIndex ||
    !state?.playback?.track?.id ||
    lyrics.trackId !== state.playback.track.id ||
    lyrics.synced !== true ||
    !line ||
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to <= from ||
    to > line.text.length ||
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    startMs < 0 ||
    endMs > timingLimits.maxTimeMs ||
    endMs <= startMs ||
    !Number.isFinite(line.startMs) ||
    startMs < line.startMs ||
    (Number.isFinite(line.endMs) && endMs > line.endMs)
  )
    invalid();
  const boundaries = new Set([
    0,
    ...Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        line.text,
      ),
      (g) => g.index + g.segment.length,
    ),
  ]);
  if (
    !boundaries.has(from) ||
    !boundaries.has(to) ||
    !line.text.slice(from, to).trim()
  )
    invalid();
  return { lineIndex, from, to, startMs, endMs };
}
