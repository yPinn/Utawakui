// Shared by the real Browser Source and the control-panel preview.
export const MANGA_FRAME_VIEW_BOX = '0 0 400 600';
export const DEFAULT_MANGA_FRAME_ID = 'spoken';

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
  const length = Array.from(String(text ?? '').trim()).length;
  if (length <= 12) return 'short';
  if (length <= 24) return 'medium';
  return 'long';
}
