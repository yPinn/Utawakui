// App-wide presentation contract shared by renderer previews and Browser Source.
export const MANGA_FRAME_VIEW_BOX = '0 0 400 600';
export const DEFAULT_MANGA_FRAME_ID = 'spoken';

const MANGA_TEXT_SIZE_EM = Object.freeze({
  short: 2.9,
  medium: 2.55,
  long: 2.15,
});
const MANGA_COUNT_SIZE_CAP_EM = Object.freeze({ 1: 2.9, 2: 2.35, 3: 1.9 });
const MANGA_COUNT_GLYPH_CAPACITY = Object.freeze({ 2: 22, 3: 18 });
const MANGA_LENGTH_GLYPH_CAPACITY = Object.freeze({
  short: 12,
  medium: 24,
  long: 60,
});
const MANGA_PLACEMENT_PATTERNS = Object.freeze({
  1: Object.freeze([
    Object.freeze({ side: 'right', anchorYPercent: 50, jitterYPercent: 4 }),
  ]),
  2: Object.freeze([
    Object.freeze({ side: 'right', anchorYPercent: 46, jitterYPercent: 1 }),
    Object.freeze({ side: 'left', anchorYPercent: 54, jitterYPercent: 1 }),
  ]),
  3: Object.freeze([
    Object.freeze({ side: 'right', anchorYPercent: 33, jitterYPercent: 1 }),
    Object.freeze({ side: 'left', anchorYPercent: 50, jitterYPercent: 2 }),
    Object.freeze({ side: 'right', anchorYPercent: 67, jitterYPercent: 1 }),
  ]),
});
const MANGA_INLINE_JITTER_REM = Object.freeze([0, 0.5, 1]);

function frame(id, label, usage, elements, options = {}) {
  return Object.freeze({
    id,
    label,
    usage,
    elements: Object.freeze(
      elements.map((element) =>
        Object.freeze({
          tag: element.tag,
          attrs: Object.freeze({ ...element.attrs }),
        }),
      ),
    ),
    ...options,
  });
}

export const MANGA_FRAMES = Object.freeze([
  frame('spoken', '一般對話', '一般演唱與普通語氣。', [
    {
      tag: 'path',
      attrs: {
        d: 'M200 22C94 22 34 112 34 278C34 440 88 536 184 556C228 565 270 550 302 520L342 568L330 486C356 438 368 370 368 286C368 116 306 22 200 22Z',
      },
    },
  ]),
  frame(
    'shout',
    '爆發對話',
    '吶喊、強烈語氣與明確的情緒高點。',
    [
      {
        tag: 'path',
        attrs: {
          d: 'M199 13L225 50L258 21L274 64L315 40L319 88L361 78L346 127L385 142L354 179L389 207L347 233L380 269L337 287L373 329L328 340L358 389L310 394L330 446L280 439L290 498L241 479L236 549L198 516L165 576L144 513L95 545L94 478L42 494L65 434L17 419L55 373L12 341L61 311L20 270L70 248L31 202L85 186L55 133L111 127L99 74L154 92Z',
        },
      },
    ],
    { lineJoin: 'miter' },
  ),
  frame(
    'whisper',
    '耳語對話',
    '耳語、氣音或刻意降低存在感的句子。',
    [
      {
        tag: 'path',
        attrs: {
          d: 'M200 22C94 22 34 112 34 278C34 440 88 536 184 556C228 565 270 550 302 520L342 568L330 486C356 438 368 370 368 286C368 116 306 22 200 22Z',
          'stroke-dasharray': '14 12',
        },
      },
    ],
    { strokeWidth: 5 },
  ),
  frame('thought', '思考對話', '內心話與情緒性的思考。', [
    {
      tag: 'path',
      attrs: {
        d: 'M123 66C154 25 215 23 247 58C290 33 340 66 340 117C378 137 383 196 349 223C377 258 366 316 325 334C348 377 323 429 278 438C272 484 222 513 181 491C145 523 88 505 78 459C33 448 15 394 43 358C6 330 10 272 50 249C20 214 34 160 77 145C69 111 87 79 123 66Z',
      },
    },
    { tag: 'circle', attrs: { cx: '286', cy: '493', r: '18' } },
    { tag: 'circle', attrs: { cx: '319', cy: '540', r: '10' } },
  ]),
  frame('narration', '旁白方框', '旁白、抽離敘述或明確的說明語氣。', [
    {
      tag: 'path',
      attrs: { d: 'M48 28H352V572H48Z' },
    },
  ]),
  frame(
    'mechanical',
    '機械聲雙框',
    '電話、廣播、電子裝置或非自然聲源。',
    [
      {
        tag: 'path',
        attrs: { d: 'M200 24L352 105L366 472L216 576L48 500L34 126Z' },
      },
      {
        tag: 'path',
        attrs: { d: 'M200 48L329 117L341 459L214 550L72 486L59 141Z' },
      },
    ],
    { lineJoin: 'miter' },
  ),
  frame('frameless', '無框獨白', '安靜獨白、極輕聲句子或留白。', []),
]);

const MANGA_FRAME_BY_ID = new Map(
  MANGA_FRAMES.map((definition) => [definition.id, definition]),
);

export function resolveMangaFrame(frameId) {
  return (
    MANGA_FRAME_BY_ID.get(frameId) ??
    MANGA_FRAME_BY_ID.get(DEFAULT_MANGA_FRAME_ID)
  );
}

export function mangaFrameLengthTier(text) {
  const length = Array.from(String(text ?? '').replace(/\s/gu, '')).length;
  if (length <= 12) return 'short';
  if (length <= 24) return 'medium';
  return 'long';
}

export function mangaFrameTextFitEm(text, bubbleCount = 1) {
  const normalizedText = String(text ?? '')
    .trim()
    .replace(/\s+/gu, ' ');
  const glyphCount = Math.max(1, Array.from(normalizedText).length);
  const count = Math.min(
    3,
    Math.max(1, Number.isSafeInteger(bubbleCount) ? bubbleCount : 1),
  );
  const lengthTier = mangaFrameLengthTier(text);
  const maximumSize = Math.min(
    MANGA_TEXT_SIZE_EM[lengthTier],
    MANGA_COUNT_SIZE_CAP_EM[count],
  );
  const capacity =
    MANGA_COUNT_GLYPH_CAPACITY[count] ??
    MANGA_LENGTH_GLYPH_CAPACITY[lengthTier];
  const fittedSize =
    glyphCount <= capacity
      ? maximumSize
      : maximumSize * Math.sqrt(capacity / glyphCount);
  return Math.round(Math.max(0.65, fittedSize) * 100) / 100;
}

function stableFraction(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function roundHundredths(value) {
  return Math.round(value * 100) / 100;
}

export function mangaFramePlacementForBubble(options = {}) {
  const bubbleCount = Math.min(
    3,
    Math.max(
      1,
      Number.isSafeInteger(options.bubbleCount) ? options.bubbleCount : 1,
    ),
  );
  const bubbleIndex = Math.min(
    bubbleCount - 1,
    Math.max(
      0,
      Number.isSafeInteger(options.bubbleIndex) ? options.bubbleIndex : 0,
    ),
  );
  const pattern = MANGA_PLACEMENT_PATTERNS[bubbleCount][bubbleIndex];
  const lineIndex = Number.isSafeInteger(options.lineIndex)
    ? options.lineIndex
    : -1;
  const seed = `${lineIndex}\0${bubbleCount}\0${bubbleIndex}\0${String(options.text ?? '')}`;
  const verticalOffset =
    (stableFraction(`${seed}\0vertical`) * 2 - 1) * pattern.jitterYPercent;
  const inlineJitterIndex = Math.min(
    MANGA_INLINE_JITTER_REM.length - 1,
    Math.floor(
      stableFraction(`${seed}\0inline`) * MANGA_INLINE_JITTER_REM.length,
    ),
  );
  const inlineJitterRem = MANGA_INLINE_JITTER_REM[inlineJitterIndex];

  return Object.freeze({
    side:
      bubbleCount === 1
        ? mangaFrameSideForLine(options.lineIndex)
        : pattern.side,
    anchorYPercent: roundHundredths(pattern.anchorYPercent + verticalOffset),
    inlineJitterRem: roundHundredths(inlineJitterRem),
  });
}

export function mangaFrameSideForLine(lineIndex) {
  if (!Number.isSafeInteger(lineIndex)) return 'right';
  return ((lineIndex % 4) + 4) % 4 === 3 ? 'left' : 'right';
}
