// App-wide presentation contract shared by renderer previews and Browser Source.
export const MANGA_FRAME_VIEW_BOX = '0 0 400 600';
export const DEFAULT_MANGA_FRAME_ID = 'spoken';

const MANGA_TEXT_LINE_HEIGHT = 1.16;
const MANGA_RUBY_LANE_WIDTH = 0.46;
const MANGA_TEXT_MAX_INLINE_RATIO = 0.72;
const MANGA_LATIN_TEXT_SCALE = 0.82;
const MANGA_FRAME_BLOCK_TO_INLINE_RATIO = 2 / 3;
const MANGA_JAPANESE_COLUMN_UNIT_CAPACITY = 5;
const MANGA_CJK_COLUMN_UNIT_CAPACITY = Object.freeze({ 1: 8, 2: 7, 3: 4 });
const MANGA_CJK_SINGLE_COLUMN_TOLERANCE = 0.75;
const MANGA_CJK_GLYPH_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const MANGA_KANA_GLYPH_RE = /[\u3040-\u30ff]/u;
const MANGA_LATIN_GLYPH_RE = /\p{Script=Latin}/u;
const MANGA_COMPACT_PUNCTUATION_RE = /[‐‑–—,，、。！？!?…‥;；:：()（）'’-]/u;
const MANGA_SENTENCE_END_RE = /[。！？!?…‥]/u;
const MANGA_PREFERRED_BREAK_RE = /[、，,；;：:]/u;
const MANGA_CLOSING_PUNCTUATION_RE = /^[」』】）》〉〕〗〙〛）)\]}｝}”’"']+$/u;
const MANGA_QUOTE_PAIRS = Object.freeze({
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
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

export function mangaFrameTextScript(text) {
  const value = String(text ?? '');
  const hasCjk = MANGA_CJK_GLYPH_RE.test(value);
  const hasLatin = MANGA_LATIN_GLYPH_RE.test(value);
  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'cjk';
  if (hasLatin) return 'latin';
  return 'other';
}

function mangaFrameVisualInlineUnits(text) {
  return Array.from(text).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (MANGA_CJK_GLYPH_RE.test(character)) return total + 1;
    if (MANGA_COMPACT_PUNCTUATION_RE.test(character)) return total + 0.35;
    return total + 0.55;
  }, 0);
}

function normalizedBubbleCount(value) {
  return Math.min(3, Math.max(1, Number.isSafeInteger(value) ? value : 1));
}

function mangaFrameBalanceTokens(text) {
  return (
    String(text).match(
      /\p{Script=Latin}[\p{Script=Latin}\p{N}'’‐‑–—-]*|[^\p{Script=Latin}]/gu,
    ) ?? []
  );
}

function plainLayoutTokens(text) {
  return mangaFrameBalanceTokens(text).map((value) => ({ text: value }));
}

function normalizedRanges(ranges, sourceLength) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const result = [];
  for (const range of ranges) {
    const start = Number.isSafeInteger(range?.start) ? range.start : -1;
    const end = Number.isSafeInteger(range?.end) ? range.end : -1;
    if (start < 0 || end <= start || end > sourceLength) return [];
    result.push({ start, end });
  }
  return result;
}

function readingLayoutTokens(text, options) {
  const readingLine = options?.readingLine;
  const sourceText = String(readingLine?.text ?? '');
  const segments = Array.isArray(readingLine?.segments)
    ? readingLine.segments
    : [];
  const ranges = normalizedRanges(options?.sourceRanges, sourceText.length);
  if (!sourceText || ranges.length === 0 || segments.length === 0) return null;
  if (segments.map((segment) => segment?.text ?? '').join('') !== sourceText) {
    return null;
  }

  const spans = [];
  let cursor = 0;
  for (const segment of segments) {
    if (!segment || typeof segment.text !== 'string') return null;
    spans.push({
      start: cursor,
      end: cursor + segment.text.length,
      text: segment.text,
      reading:
        typeof segment.reading === 'string' && segment.reading.length > 0
          ? segment.reading
          : null,
    });
    cursor += segment.text.length;
  }

  const tokens = [];
  for (const [rangeIndex, range] of ranges.entries()) {
    if (rangeIndex > 0) tokens.push({ text: ' ' });
    for (const span of spans) {
      const start = Math.max(range.start, span.start);
      const end = Math.min(range.end, span.end);
      if (end <= start) continue;
      const fragment = span.text.slice(start - span.start, end - span.start);
      if (span.reading && start === span.start && end === span.end) {
        tokens.push({ text: fragment, reading: span.reading });
      } else {
        tokens.push(...plainLayoutTokens(fragment));
      }
    }
  }
  const normalizedTokenText = tokens
    .map((token) => token.text)
    .join('')
    .trim()
    .replace(/[ \t]+/gu, ' ');
  return normalizedTokenText === text ? tokens : null;
}

function tokenText(token) {
  return typeof token === 'string' ? token : token.text;
}

function projectedLayoutTokens(text, options) {
  const tokens = readingLayoutTokens(text, options);
  if (!tokens) return plainLayoutTokens(text);
  return options?.includeRuby === false
    ? tokens.map((token) => ({ text: token.text }))
    : tokens;
}

function splitLayoutTokensAtNewlines(tokens) {
  const columns = [[]];
  for (const token of tokens) {
    const value = tokenText(token);
    const parts = value.split(/\r?\n/u);
    for (const [partIndex, part] of parts.entries()) {
      if (part) {
        if (parts.length === 1) {
          columns.at(-1).push(token);
        } else {
          columns.at(-1).push(...plainLayoutTokens(part));
        }
      }
      if (partIndex < parts.length - 1) columns.push([]);
    }
  }
  return columns;
}

function usesJapanesePhraseLayout(text, options) {
  const language = String(options?.language ?? '')
    .trim()
    .toLowerCase();
  if (language === 'ja' || language.startsWith('ja-')) return true;
  if (language && language !== 'und') return false;
  if (MANGA_KANA_GLYPH_RE.test(text)) return true;
  return Array.isArray(options?.readingLine?.segments)
    ? options.readingLine.segments.some(
        (segment) =>
          typeof segment?.reading === 'string' && segment.reading.length > 0,
      )
    : false;
}

function automaticCjkColumnCount(tokens, bubbleCount) {
  const capacity =
    MANGA_CJK_COLUMN_UNIT_CAPACITY[normalizedBubbleCount(bubbleCount)];
  const totalUnits = tokens.reduce(
    (total, token) => total + mangaFrameVisualInlineUnits(tokenText(token)),
    0,
  );
  if (totalUnits <= capacity + MANGA_CJK_SINGLE_COLUMN_TOLERANCE) return 1;
  return Math.max(1, Math.ceil(totalUnits / capacity));
}

function balancedCjkColumns(tokens, bubbleCount) {
  if (tokens.length === 0) return [[]];
  const columnCount = automaticCjkColumnCount(tokens, bubbleCount);
  if (columnCount === 1) return [tokens];

  const columns = [];
  let start = 0;
  let remainingUnits = tokens.reduce(
    (total, token) => total + mangaFrameVisualInlineUnits(tokenText(token)),
    0,
  );
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const remainingColumns = columnCount - columnIndex;
    if (remainingColumns === 1) {
      columns.push(tokens.slice(start));
      break;
    }

    const targetUnits = remainingUnits / remainingColumns;
    let end = start;
    let columnUnits = 0;
    const lastAllowedEnd = tokens.length - (remainingColumns - 1);
    while (end < lastAllowedEnd) {
      const nextUnits = mangaFrameVisualInlineUnits(tokenText(tokens[end]));
      if (
        end > start &&
        Math.abs(targetUnits - columnUnits) <=
          Math.abs(targetUnits - (columnUnits + nextUnits))
      ) {
        break;
      }
      columnUnits += nextUnits;
      end += 1;
    }
    if (end === start) {
      columnUnits = mangaFrameVisualInlineUnits(tokenText(tokens[end]));
      end += 1;
    }
    columns.push(tokens.slice(start, end));
    start = end;
    remainingUnits -= columnUnits;
  }
  return columns;
}

function matchedTopLevelQuoteBoundaries(tokens) {
  const openings = new Set();
  const closings = new Set();
  const stack = [];
  for (const [index, token] of tokens.entries()) {
    const text = tokenText(token);
    if (Object.hasOwn(MANGA_QUOTE_PAIRS, text)) {
      stack.push({
        index,
        closing: MANGA_QUOTE_PAIRS[text],
        topLevel: stack.length === 0,
      });
      continue;
    }
    const opening = stack.at(-1);
    if (!opening || text !== opening.closing) continue;
    stack.pop();
    if (opening.topLevel && stack.length === 0) {
      openings.add(opening.index);
      closings.add(index);
    }
  }
  return { openings, closings };
}

function sentencePhrases(tokens) {
  const phrases = [];
  const quoteBoundaries = matchedTopLevelQuoteBoundaries(tokens);
  let phrase = [];
  let sentenceEnded = false;
  let insideMatchedQuote = false;
  let matchedQuoteEnded = false;
  for (const [index, token] of tokens.entries()) {
    const text = tokenText(token);
    if (
      matchedQuoteEnded &&
      !MANGA_SENTENCE_END_RE.test(text) &&
      !MANGA_CLOSING_PUNCTUATION_RE.test(text)
    ) {
      phrases.push(phrase);
      phrase = [];
      sentenceEnded = false;
      matchedQuoteEnded = false;
    }
    if (quoteBoundaries.openings.has(index)) {
      if (phrase.length > 0) phrases.push(phrase);
      phrase = [token];
      sentenceEnded = false;
      insideMatchedQuote = true;
      matchedQuoteEnded = false;
      continue;
    }
    if (quoteBoundaries.closings.has(index)) {
      phrase.push(token);
      sentenceEnded = false;
      insideMatchedQuote = false;
      matchedQuoteEnded = true;
      continue;
    }
    if (
      sentenceEnded &&
      !MANGA_SENTENCE_END_RE.test(text) &&
      !MANGA_CLOSING_PUNCTUATION_RE.test(text)
    ) {
      phrases.push(phrase);
      phrase = [];
      sentenceEnded = false;
    }
    phrase.push(token);
    if (!insideMatchedQuote && MANGA_SENTENCE_END_RE.test(text)) {
      sentenceEnded = true;
    }
  }
  if (phrase.length > 0) phrases.push(phrase);
  return phrases;
}

function isHangingMangaPunctuation(text) {
  return (
    MANGA_SENTENCE_END_RE.test(text) || MANGA_CLOSING_PUNCTUATION_RE.test(text)
  );
}

function wrapPhraseTokens(tokens, unitCapacity) {
  if (tokens.length === 0) return [[]];
  const columns = [];
  let start = 0;
  while (start < tokens.length) {
    let fittedEnd = start;
    let preferredEnd = null;
    let units = 0;
    let consumedHangingOverflow = false;
    for (let end = start; end < tokens.length; end += 1) {
      const token = tokens[end];
      const text = tokenText(token);
      const tokenUnits = mangaFrameVisualInlineUnits(text);
      const overCapacity = units + tokenUnits > unitCapacity;
      if (
        fittedEnd > start &&
        overCapacity &&
        !isHangingMangaPunctuation(text)
      ) {
        break;
      }
      fittedEnd = end + 1;
      units += tokenUnits;
      if (overCapacity && isHangingMangaPunctuation(text)) {
        consumedHangingOverflow = true;
      }
      if (MANGA_PREFERRED_BREAK_RE.test(text)) {
        preferredEnd = fittedEnd;
      }
      if (units >= unitCapacity) {
        const nextText = tokens[end + 1] ? tokenText(tokens[end + 1]) : null;
        if (nextText && isHangingMangaPunctuation(nextText)) continue;
        break;
      }
    }

    if (fittedEnd >= tokens.length) {
      columns.push(tokens.slice(start));
      break;
    }
    const end =
      !consumedHangingOverflow && preferredEnd && preferredEnd > start
        ? preferredEnd
        : fittedEnd;
    columns.push(tokens.slice(start, Math.max(start + 1, end)));
    start = Math.max(start + 1, end);
  }
  return columns;
}

function phraseFirstColumns(tokens) {
  if (tokens.length === 0) return [[]];
  return sentencePhrases(tokens).flatMap((phrase) =>
    wrapPhraseTokens(phrase, MANGA_JAPANESE_COLUMN_UNIT_CAPACITY),
  );
}

export function mangaFrameTextLayout(text, bubbleCount = 1, options = {}) {
  const sourceText = String(text ?? '');
  const normalizedText = sourceText.trim().replace(/[ \t]+/gu, ' ');
  const script = mangaFrameTextScript(normalizedText);
  const japanesePhraseLayout = usesJapanesePhraseLayout(
    normalizedText,
    options,
  );
  let columnTokens;

  if (/\r?\n/u.test(normalizedText)) {
    const tokens = projectedLayoutTokens(normalizedText, options);
    columnTokens = splitLayoutTokensAtNewlines(tokens).flatMap((column) => {
      const columnScript = mangaFrameTextScript(column.map(tokenText).join(''));
      if (columnScript !== 'cjk' && columnScript !== 'mixed') return [column];
      return japanesePhraseLayout ? phraseFirstColumns(column) : [column];
    });
  } else if (script === 'cjk' || script === 'mixed') {
    const tokens = projectedLayoutTokens(normalizedText, options);
    columnTokens = japanesePhraseLayout
      ? phraseFirstColumns(tokens)
      : balancedCjkColumns(tokens, bubbleCount);
  } else {
    columnTokens = [plainLayoutTokens(normalizedText)];
  }

  const columns = columnTokens.map((column) => column.map(tokenText).join(''));
  const hasRuby = columnTokens.some((column) =>
    column.some((token) => Boolean(token.reading)),
  );

  const scriptScale = script === 'latin' ? MANGA_LATIN_TEXT_SCALE : 1;
  const tallestColumnUnits = Math.max(
    1,
    ...columns.map((column) => mangaFrameVisualInlineUnits(column)),
  );
  const inlineRequiredBlockSize =
    (tallestColumnUnits * scriptScale * MANGA_TEXT_LINE_HEIGHT) /
    MANGA_TEXT_MAX_INLINE_RATIO;
  const columnWidthUnits = columnTokens.reduce(
    (total, column) =>
      total +
      MANGA_TEXT_LINE_HEIGHT +
      (column.some((token) => Boolean(token.reading))
        ? MANGA_RUBY_LANE_WIDTH
        : 0),
    0,
  );
  const widthRequiredBlockSize =
    columns.length > 1 || hasRuby
      ? columnWidthUnits /
        (MANGA_TEXT_MAX_INLINE_RATIO * MANGA_FRAME_BLOCK_TO_INLINE_RATIO)
      : 0;

  return Object.freeze({
    columns: Object.freeze(columns),
    columnTokens: Object.freeze(
      columnTokens.map((column) =>
        Object.freeze(column.map((token) => Object.freeze({ ...token }))),
      ),
    ),
    columnCount: columns.length,
    displayText: columns.join('\n'),
    requiredBlockSizeEm: roundHundredths(
      Math.max(inlineRequiredBlockSize, widthRequiredBlockSize),
    ),
    language: japanesePhraseLayout ? 'ja' : 'other',
    script,
    hasRuby,
  });
}

export function mangaFrameRequiredBlockSizeEm(text, bubbleCount = 1) {
  return mangaFrameTextLayout(text, bubbleCount).requiredBlockSizeEm;
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
