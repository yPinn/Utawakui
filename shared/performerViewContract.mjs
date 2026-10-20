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
