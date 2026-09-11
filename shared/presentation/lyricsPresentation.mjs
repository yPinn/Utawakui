// Pure presentation projection shared across renderer and Browser Source.

import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
} from './ornateVerticalPresentation.mjs';
import { outputAppearanceFieldKeysForTemplate } from '../outputAppearance.mjs';

export const MAX_LYRICS_PRESENTATION_BUBBLES = 3;
export const MAX_LIVE_STAGE_CAPTION_LINES = 2;
export const MAX_LIVE_STAGE_CAPTION_PAGES = 2;
export const LYRICS_PRESENTATION_PROFILE_VERSION = 1;

const PARENTHETICAL_RE = /\([^()（）]+\)|（[^()（）]+）/gu;
const PARENTHESIS_MARK_RE = /[()（）]/u;
const SPEAKER_RE = /^\[([^\]\r\n]{1,40})\](?:[ \t]*\r?\n|[ \t]*)/u;
const SEMANTIC_PUNCTUATION_RE = /[,，、。！？!?;；:：]/u;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const CJK_GLYPH_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const HANGUL_RE = /[\uac00-\ud7af]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const HAN_RE = /[\u3400-\u9fff]/u;
const MANGA_BUBBLE_QUOTE_PAIRS = Object.freeze({
  '「': '」',
  '『': '』',
  '“': '”',
});
const MANGA_BUBBLE_QUOTE_CLOSINGS = new Set(
  Object.values(MANGA_BUBBLE_QUOTE_PAIRS),
);
const MANGA_BUBBLE_TRAILING_PUNCTUATION_RE = /[。！？!?…‥．.]/u;
const FILLER_WORDS = new Set(['ah', 'eh', 'hm', 'hmm', 'oh', 'ooh', 'uh']);
const KTV_MALE_LABELS = new Set([
  '男',
  '男聲',
  '男声',
  'male',
  'man',
  'm',
  '♂',
]);
const KTV_FEMALE_LABELS = new Set([
  '女',
  '女聲',
  '女声',
  'female',
  'woman',
  'f',
  '♀',
]);
const KTV_GROUP_LABELS = new Set([
  '合',
  '合唱',
  '男女',
  '全體',
  '全体',
  'duet',
  'both',
  'all',
  'together',
  'group',
]);
const LIVE_STAGE_ROW_WIDTHS = [7, 11, 7, 11];
const LIVE_STAGE_MAX_ROW_WIDTH = Math.max(...LIVE_STAGE_ROW_WIDTHS);
const KOREAN_GENITIVE_PRONOUNS = new Set([
  '나의',
  '너의',
  '저의',
  '우리의',
  '그의',
  '너만의',
  '우리만의',
]);
const KOREAN_PHRASE_END_WORDS = new Set([
  '대로',
  '만큼',
  '처럼',
  '뿐',
  '밖에',
  '조차',
  '마저',
]);
const KINETIC_POP_MATERIALS = Object.freeze([
  'solid-outline',
  'candy-rim',
  'chromatic-depth',
]);
const KINETIC_POP_DEFAULT_MATERIAL = 'candy-rim';
const KINETIC_POP_GRAPHEME_SEGMENTER =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const KINETIC_POP_TRAILING_MARK_RE = /^[\s\p{P}]+$/u;
const KINETIC_POP_MATERIAL_SETTINGS = new Set([
  ...KINETIC_POP_MATERIALS,
  'cycle',
]);
const KINETIC_POP_PUNCH_MAX_WEIGHT = 8;
const LYRICS_PRESENTATION_PROFILES = Object.freeze({
  'generic-caption': Object.freeze({
    id: 'generic-caption',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('focus-line'),
    ),
  }),
  'classic-ktv': Object.freeze({
    id: 'classic-ktv',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('karaoke-stack'),
    ),
  }),
  'kinetic-pop': Object.freeze({
    id: 'kinetic-pop',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('kinetic-pop'),
    ),
  }),
  'ornate-vertical': Object.freeze({
    id: 'ornate-vertical',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('ornate-vertical'),
    ),
  }),
  'manga-frame': Object.freeze({
    id: 'manga-frame',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('manga-frame'),
    ),
  }),
  'live-stage': Object.freeze({
    id: 'live-stage',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: true,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('live-stage'),
    ),
  }),
  'reading-aid': Object.freeze({
    id: 'reading-aid',
    version: LYRICS_PRESENTATION_PROFILE_VERSION,
    available: false,
    editableAppearanceKeys: Object.freeze(
      outputAppearanceFieldKeysForTemplate('reading-aid'),
    ),
  }),
});
const TEMPLATE_PROFILE_IDS = Object.freeze({
  'focus-line': 'generic-caption',
  'quiet-caption': 'generic-caption',
  'karaoke-stack': 'classic-ktv',
  'kinetic-pop': 'kinetic-pop',
  'ornate-vertical': 'ornate-vertical',
  'manga-frame': 'manga-frame',
  'live-stage': 'live-stage',
  'reading-aid': 'reading-aid',
});

function lexicalTokens(value) {
  return [...String(value ?? '').matchAll(WORD_RE)].map((match) => ({
    end: match.index + match[0].length,
    normalized: match[0].toLocaleLowerCase(),
    sourceEnd: match.index + match[0].length,
    sourceStart: match.index,
    start: match.index,
    text: match[0],
  }));
}

function repeatKey(value) {
  return lexicalTokens(value)
    .map((token) => token.normalized)
    .join(' ');
}

function fillerCandidate(value) {
  const tokens = lexicalTokens(value);
  return (
    tokens.length > 0 &&
    tokens.every((token) => FILLER_WORDS.has(token.normalized))
  );
}

function trimmedRange(sourceText, start, end) {
  let sourceStart = start;
  let sourceEnd = end;
  while (sourceStart < sourceEnd && /\s/u.test(sourceText[sourceStart])) {
    sourceStart += 1;
  }
  while (sourceEnd > sourceStart && /\s/u.test(sourceText[sourceEnd - 1])) {
    sourceEnd -= 1;
  }
  return { sourceEnd, sourceStart };
}

function semanticUnit(sourceText, kind, start, end, breakBefore = null) {
  const range = trimmedRange(sourceText, start, end);
  const rawText = sourceText.slice(range.sourceStart, range.sourceEnd);
  const isParenthetical = kind === 'parenthetical';
  const contentStart = isParenthetical
    ? range.sourceStart + 1
    : range.sourceStart;
  const contentEnd = isParenthetical ? range.sourceEnd - 1 : range.sourceEnd;
  const contentRange = trimmedRange(sourceText, contentStart, contentEnd);
  const text = sourceText
    .slice(contentRange.sourceStart, contentRange.sourceEnd)
    .replace(/[ \t]+/gu, ' ')
    .trim();
  return {
    kind,
    text,
    sourceText: rawText,
    sourceStart: range.sourceStart,
    sourceEnd: range.sourceEnd,
    contentStart: contentRange.sourceStart,
    contentEnd: contentRange.sourceEnd,
    breakBefore,
    fillerCandidate: fillerCandidate(text),
    repeatKey: repeatKey(text),
  };
}

function splitMainRange(sourceText, start, end, initialBreak = null) {
  const units = [];
  let unitStart = null;
  let breakBefore = initialBreak;

  const pushUnit = (unitEnd) => {
    if (unitStart === null) return;
    const unit = semanticUnit(
      sourceText,
      'main',
      unitStart,
      unitEnd,
      breakBefore,
    );
    if (unit.text) units.push(unit);
    unitStart = null;
  };

  for (let index = start; index < end; index += 1) {
    const character = sourceText[index];
    if (character === '\r' || character === '\n') {
      pushUnit(index);
      if (character === '\r' && sourceText[index + 1] === '\n') index += 1;
      breakBefore = 'authored';
      continue;
    }
    if (unitStart === null && !/\s/u.test(character)) unitStart = index;
    if (unitStart !== null && SEMANTIC_PUNCTUATION_RE.test(character)) {
      pushUnit(index + 1);
      breakBefore = 'punctuation';
    }
  }
  pushUnit(end);
  return units;
}

export function analyzeLyricsSource(value) {
  const sourceText = String(value ?? '');
  const significantStart = sourceText.search(/\S/u);
  const significantEnd =
    significantStart === -1
      ? 0
      : sourceText.length - (sourceText.match(/\s*$/u)?.[0].length ?? 0);
  const significantText =
    significantStart === -1
      ? ''
      : sourceText.slice(significantStart, significantEnd);
  const speakerMatch = significantText.match(SPEAKER_RE);
  const speaker = speakerMatch?.[1]?.trim() ?? '';
  const contentStart =
    significantStart === -1
      ? 0
      : significantStart + (speakerMatch?.[0]?.length ?? 0);
  const contentText = sourceText.slice(contentStart, significantEnd);
  const parentheticals = [...contentText.matchAll(PARENTHETICAL_RE)];
  const residualText = contentText.replace(PARENTHETICAL_RE, ' ');
  const malformedParenthetical = PARENTHESIS_MARK_RE.test(residualText);
  if (significantStart === -1) {
    return {
      sourceText,
      speaker,
      units: [],
      malformedParenthetical: false,
    };
  }

  if (malformedParenthetical) {
    return {
      sourceText,
      speaker,
      units: [semanticUnit(sourceText, 'main', contentStart, significantEnd)],
      malformedParenthetical: true,
    };
  }

  const units = [];
  let cursor = contentStart;
  let nextBreak = speakerMatch?.[0]?.includes('\n') ? 'authored' : null;
  for (const match of parentheticals) {
    const start = contentStart + match.index;
    units.push(...splitMainRange(sourceText, cursor, start, nextBreak));
    units.push(
      semanticUnit(
        sourceText,
        'parenthetical',
        start,
        start + match[0].length,
        'parenthetical',
      ),
    );
    cursor = start + match[0].length;
    nextBreak = 'parenthetical';
  }
  units.push(...splitMainRange(sourceText, cursor, significantEnd, nextBreak));

  return {
    sourceText,
    speaker,
    units,
    malformedParenthetical: false,
  };
}

function ktvVocalRole(speaker) {
  const label = String(speaker ?? '')
    .trim()
    .toLocaleLowerCase();
  if (KTV_MALE_LABELS.has(label)) return 'male';
  if (KTV_FEMALE_LABELS.has(label)) return 'female';
  if (KTV_GROUP_LABELS.has(label)) return 'group';
  return 'solo';
}

function phraseFromUnit(unit) {
  return {
    text: unit.kind === 'parenthetical' ? unit.sourceText : unit.text,
    sourceStart: unit.sourceStart,
    sourceEnd: unit.sourceEnd,
    visualWeight: Math.max(1, visualWidth(unit.text)),
  };
}

export function parseKtvDisplayPhrases(analysis, options = {}) {
  const units = Array.isArray(analysis?.units) ? analysis.units : [];
  const phrases = [];

  for (const unit of units) {
    if (
      unit.kind !== 'main' ||
      !CJK_GLYPH_RE.test(unit.text) ||
      lineSpacingMode(unit.text, options.language) !== 'phrase'
    ) {
      phrases.push(phraseFromUnit(unit));
      continue;
    }

    const authoredChunks = [...unit.sourceText.matchAll(/\S+/gu)];
    if (authoredChunks.length <= 1) {
      phrases.push(phraseFromUnit(unit));
      continue;
    }

    for (const match of authoredChunks) {
      const text = match[0].trim();
      if (!text) continue;
      phrases.push({
        text,
        sourceStart: unit.sourceStart + match.index,
        sourceEnd: unit.sourceStart + match.index + match[0].length,
        visualWeight: Math.max(1, visualWidth(text)),
      });
    }
  }

  return phrases;
}

export function adaptKtvLyricsPresentation(analysis, options = {}) {
  const sourceText = String(analysis?.sourceText ?? '');
  const units = Array.isArray(analysis?.units) ? analysis.units : [];
  const contentStart = analysis?.speaker
    ? (units[0]?.sourceStart ?? sourceText.length)
    : 0;
  return {
    sourceText,
    text: sourceText.slice(contentStart).trim(),
    speaker: analysis?.speaker ?? '',
    role: ktvVocalRole(analysis?.speaker),
    phrases: parseKtvDisplayPhrases(analysis, options).map(
      (phrase) => phrase.text,
    ),
    contentStart,
  };
}

function kineticPopVisualUnits(value) {
  const graphemes = KINETIC_POP_GRAPHEME_SEGMENTER
    ? [...KINETIC_POP_GRAPHEME_SEGMENTER.segment(value)].map(
        ({ segment }) => segment,
      )
    : Array.from(value);
  const units = [];
  let leadingText = '';
  for (const grapheme of graphemes) {
    if (KINETIC_POP_TRAILING_MARK_RE.test(grapheme)) {
      if (units.length > 0) units.at(-1).text += grapheme;
      else leadingText += grapheme;
      continue;
    }
    const text = `${leadingText}${grapheme}`;
    leadingText = '';
    units.push({ text, weight: Math.max(1, visualWidth(grapheme)) });
  }
  if (leadingText) {
    units.push({
      text: leadingText,
      weight: Math.max(1, visualWidth(leadingText)),
    });
  }
  return units;
}

function kineticPopPhrases(text) {
  return text
    .split(/\s+/gu)
    .filter(Boolean)
    .map((phraseText) => {
      const units = kineticPopVisualUnits(phraseText);
      return {
        text: phraseText,
        units,
        weight: Math.max(
          1,
          units.reduce((total, unit) => total + unit.weight, 0),
        ),
      };
    });
}

function kineticPopPhraseBreakProgresses(phrases) {
  const totalWeight = phrases.reduce(
    (total, phrase) => total + phrase.weight,
    0,
  );
  if (phrases.length <= 1 || totalWeight <= 0) return [];
  let elapsedWeight = 0;
  return phrases.slice(0, -1).map((phrase) => {
    elapsedWeight += phrase.weight;
    return elapsedWeight / totalWeight;
  });
}

export function adaptKineticPopLyricsPresentation(value, options = {}) {
  const sourceText = String(value ?? '');
  const text = sourceText.trim().replace(/\s+/gu, ' ');
  const sourceUnits = kineticPopVisualUnits(text);
  const phrases = kineticPopPhrases(text);
  const phraseBreakProgresses = kineticPopPhraseBreakProgresses(phrases);
  const lineProgress = Number.isFinite(options.lineProgress)
    ? Math.min(1, Math.max(0, options.lineProgress))
    : null;
  const phraseIndex =
    lineProgress === null || phrases.length <= 1
      ? null
      : Math.min(
          phrases.length - 1,
          phraseBreakProgresses.filter((boundary) => lineProgress >= boundary)
            .length,
        );
  const displayPhrase =
    phraseIndex === null
      ? { text, units: sourceUnits }
      : (phrases[phraseIndex] ?? { text, units: sourceUnits });
  const visualWeight = sourceUnits.reduce(
    (total, unit) => total + unit.weight,
    0,
  );
  const rows = displayPhrase.text
    ? [{ text: displayPhrase.text, units: displayPhrase.units }]
    : [];
  const lineIndex = Number.isSafeInteger(options.lineIndex)
    ? Math.max(0, options.lineIndex)
    : 0;
  const materialSetting = KINETIC_POP_MATERIAL_SETTINGS.has(
    options.kineticMaterial,
  )
    ? options.kineticMaterial
    : KINETIC_POP_DEFAULT_MATERIAL;
  return {
    sourceText,
    text,
    displayText: displayPhrase.text,
    phrases,
    phraseIndex,
    phraseBreakProgresses,
    material:
      materialSetting === 'cycle'
        ? KINETIC_POP_MATERIALS[lineIndex % KINETIC_POP_MATERIALS.length]
        : materialSetting,
    composition:
      visualWeight > 0 && visualWeight <= KINETIC_POP_PUNCH_MAX_WEIGHT
        ? 'punch'
        : 'caption',
    units: displayPhrase.units,
    rows,
  };
}

function lineSpacingMode(text, language) {
  const normalizedLanguage = String(language ?? '').toLocaleLowerCase();
  if (normalizedLanguage.startsWith('ko')) return 'word';
  if (normalizedLanguage.startsWith('ja')) return 'phrase';
  if (normalizedLanguage.startsWith('zh')) return 'phrase';
  if (normalizedLanguage.startsWith('en')) return 'word';
  if (HANGUL_RE.test(text)) return 'word';
  if (KANA_RE.test(text) || HAN_RE.test(text)) return 'phrase';
  return 'word';
}

function compactBubbles(bubbles, limit) {
  if (bubbles.length <= limit) return bubbles;
  if (limit <= 1) {
    return [
      {
        kind: bubbles[0].kind,
        text: bubbles.map((bubble) => bubble.text).join(' '),
        sourceRanges: bubbles.flatMap((bubble) => bubble.sourceRanges ?? []),
      },
    ];
  }
  return [
    ...bubbles.slice(0, limit - 1),
    {
      kind: bubbles[limit - 1].kind,
      text: bubbles
        .slice(limit - 1)
        .map((bubble) => bubble.text)
        .join(' '),
      sourceRanges: bubbles
        .slice(limit - 1)
        .flatMap((bubble) => bubble.sourceRanges ?? []),
    },
  ];
}

function boundBubbles(mainBubbles, asideBubbles) {
  let asideSlots = Math.min(
    asideBubbles.length,
    MAX_LYRICS_PRESENTATION_BUBBLES,
  );
  if (mainBubbles.length > 0) {
    asideSlots = Math.min(asideSlots, MAX_LYRICS_PRESENTATION_BUBBLES - 1);
  }
  const mainSlots = Math.min(
    mainBubbles.length,
    MAX_LYRICS_PRESENTATION_BUBBLES - asideSlots,
  );
  return [
    ...compactBubbles(mainBubbles, mainSlots),
    ...compactBubbles(asideBubbles, asideSlots),
  ];
}

function untouchedManga(sourceText) {
  return {
    transformed: false,
    bubbles: [
      {
        kind: 'main',
        text: sourceText,
        sourceRanges: sourceText.length
          ? [{ start: 0, end: sourceText.length }]
          : [],
      },
    ],
  };
}

function matchedTopLevelQuoteRanges(text) {
  const ranges = [];
  const stack = [];
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    const characterLength = character.length;
    if (Object.hasOwn(MANGA_BUBBLE_QUOTE_PAIRS, character)) {
      stack.push({
        start: index,
        closing: MANGA_BUBBLE_QUOTE_PAIRS[character],
        topLevel: stack.length === 0,
      });
    } else if (MANGA_BUBBLE_QUOTE_CLOSINGS.has(character)) {
      const opening = stack.at(-1);
      if (!opening || character !== opening.closing) {
        return { valid: false, ranges: [] };
      }
      stack.pop();
      if (opening.topLevel && stack.length === 0) {
        let end = index + characterLength;
        while (end < text.length) {
          const trailingCharacter = String.fromCodePoint(text.codePointAt(end));
          if (!MANGA_BUBBLE_TRAILING_PUNCTUATION_RE.test(trailingCharacter)) {
            break;
          }
          end += trailingCharacter.length;
        }
        ranges.push({ start: opening.start, end });
      }
    }
    index += characterLength;
  }
  return stack.length === 0
    ? { valid: true, ranges }
    : { valid: false, ranges: [] };
}

function phraseBubblesFromQuotedRanges(maskedText, quotedRanges) {
  const bubbles = [];
  const appendUnquoted = (start, end) => {
    for (const match of maskedText.slice(start, end).matchAll(/\S+/gu)) {
      const sourceStart = start + match.index;
      bubbles.push({
        kind: 'main',
        text: match[0],
        sourceRanges: [
          { start: sourceStart, end: sourceStart + match[0].length },
        ],
      });
    }
  };
  let cursor = 0;
  for (const range of quotedRanges) {
    appendUnquoted(cursor, range.start);
    const matches = [
      ...maskedText.slice(range.start, range.end).matchAll(/\S+/gu),
    ];
    if (matches.length > 0) {
      bubbles.push({
        kind: 'main',
        text: matches.map((match) => match[0]).join(' '),
        sourceRanges: matches.map((match) => ({
          start: range.start + match.index,
          end: range.start + match.index + match[0].length,
        })),
      });
    }
    cursor = range.end;
  }
  appendUnquoted(cursor, maskedText.length);
  return bubbles;
}

export function adaptMangaLyricsPresentation(analysis, options = {}) {
  const sourceText = String(analysis?.sourceText ?? '');
  if (!sourceText) return untouchedManga('');
  if (analysis?.malformedParenthetical) return untouchedManga(sourceText);

  const parentheticalUnits = (analysis?.units ?? []).filter(
    (unit) => unit.kind === 'parenthetical',
  );
  const maskedMain = sourceText.split('');
  for (const unit of parentheticalUnits) {
    for (let index = unit.sourceStart; index < unit.sourceEnd; index += 1) {
      maskedMain[index] = ' ';
    }
  }
  const normalizedMain = maskedMain.join('').replace(/\s+/gu, ' ').trim();
  const phraseSpacing = lineSpacingMode(
    normalizedMain || sourceText,
    options.language,
  );
  const mainMatches = [...maskedMain.join('').matchAll(/\S+/gu)];
  const quoteParsing =
    phraseSpacing === 'phrase'
      ? matchedTopLevelQuoteRanges(maskedMain.join(''))
      : { valid: true, ranges: [] };
  if (!quoteParsing.valid) return untouchedManga(sourceText);
  const quotedRanges = quoteParsing.ranges;
  const mainBubbles = normalizedMain
    ? phraseSpacing === 'phrase'
      ? quotedRanges.length > 0
        ? phraseBubblesFromQuotedRanges(maskedMain.join(''), quotedRanges)
        : mainMatches.map((match) => ({
            kind: 'main',
            text: match[0],
            sourceRanges: [
              { start: match.index, end: match.index + match[0].length },
            ],
          }))
      : [
          {
            kind: 'main',
            text: normalizedMain,
            sourceRanges: mainMatches.map((match) => ({
              start: match.index,
              end: match.index + match[0].length,
            })),
          },
        ]
    : [];
  const asideBubbles = parentheticalUnits.map((unit) => ({
    kind: 'aside',
    text: unit.text,
    sourceRanges: [{ start: unit.contentStart, end: unit.contentEnd }],
  }));
  const bubbles = boundBubbles(mainBubbles, asideBubbles);
  const transformed =
    asideBubbles.length > 0 ||
    mainBubbles.length > 1 ||
    bubbles.some((bubble) => bubble.kind !== 'main');

  return transformed
    ? { transformed: true, bubbles }
    : untouchedManga(sourceText);
}

function stripBoundaryFillers(value) {
  let text = String(value ?? '').trim();
  let tokens = lexicalTokens(text);
  if (tokens.length === 0) return text;
  if (tokens.every((token) => FILLER_WORDS.has(token.normalized))) return '';

  const first = tokens[0];
  const second = tokens[1];
  if (
    FILLER_WORDS.has(first.normalized) &&
    second &&
    /[,，、:：;；!?！？]/u.test(text.slice(first.end, second.start))
  ) {
    text = text.slice(second.start).trim();
    tokens = lexicalTokens(text);
  }

  const last = tokens.at(-1);
  const previous = tokens.at(-2);
  if (
    last &&
    previous &&
    FILLER_WORDS.has(last.normalized) &&
    /[,，、:：;；!?！？]/u.test(text.slice(previous.end, last.start))
  ) {
    text = text
      .slice(0, previous.end)
      .replace(/[,，、:：;；!?！？\s]+$/gu, '')
      .trim();
  }
  return text;
}

function collapseRepeatedPhrase(value) {
  const text = String(value ?? '').trim();
  const tokens = lexicalTokens(text);
  for (
    let patternLength = 1;
    patternLength <= tokens.length / 2;
    patternLength += 1
  ) {
    if (tokens.length % patternLength !== 0) continue;
    const repeats = tokens.every(
      (token, index) =>
        token.normalized === tokens[index % patternLength].normalized,
    );
    if (repeats) return text.slice(0, tokens[patternLength - 1].end).trim();
  }
  return text;
}

function visualWidth(value) {
  return Array.from(String(value ?? '')).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (CJK_GLYPH_RE.test(character)) return total + 1;
    if (/[,，、。！？!?;；:：()（）'’]/u.test(character)) return total + 0.35;
    return total + 0.55;
  }, 0);
}

function wordScript(value) {
  const hasCjk = CJK_GLYPH_RE.test(value);
  const hasLatin = /\p{Script=Latin}/u.test(value);
  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'cjk';
  if (hasLatin) return 'latin';
  return 'other';
}

function normalizedWord(value) {
  return lexicalTokens(value)
    .map((token) => token.normalized)
    .join('');
}

function isKoreanPhraseBoundary(words, end) {
  return KOREAN_PHRASE_END_WORDS.has(normalizedWord(words[end - 1]));
}

function isLikelyKoreanGenitiveBoundary(words, end) {
  return KOREAN_GENITIVE_PRONOUNS.has(normalizedWord(words[end - 1]));
}

function isSubstantialScriptBoundary(words, end) {
  if (end <= 0 || end >= words.length) return false;
  const leftScript = wordScript(words[end - 1]);
  const rightScript = wordScript(words[end]);
  if (
    leftScript === rightScript ||
    leftScript === 'other' ||
    rightScript === 'other'
  ) {
    return false;
  }

  let leftStart = end - 1;
  while (leftStart > 0 && wordScript(words[leftStart - 1]) === leftScript) {
    leftStart -= 1;
  }
  let rightEnd = end + 1;
  while (
    rightEnd < words.length &&
    wordScript(words[rightEnd]) === rightScript
  ) {
    rightEnd += 1;
  }
  return (
    visualWidth(words.slice(leftStart, end).join(' ')) >= 3 &&
    visualWidth(words.slice(end, rightEnd).join(' ')) >= 3
  );
}

function compareBreakPriority(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function splitCaptionRows(text, rowCount, startRowIndex = 0) {
  if (rowCount <= 1) return text ? [text] : [];
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length > 1) {
    const rows = [];
    let wordIndex = 0;
    for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
      const remainingRows = rowCount - rowIndex;
      const remainingWords = words.slice(wordIndex);
      const target = Math.min(
        LIVE_STAGE_MAX_ROW_WIDTH,
        visualWidth(remainingWords.join(' ')) / remainingRows,
      );
      const futureCapacity = Array.from(
        { length: remainingRows - 1 },
        (_, index) =>
          LIVE_STAGE_ROW_WIDTHS[
            (startRowIndex + rowIndex + index + 1) %
              LIVE_STAGE_ROW_WIDTHS.length
          ],
      ).reduce((total, width) => total + width, 0);
      const lastCandidate = words.length - (remainingRows - 1);
      let bestEnd = wordIndex + 1;
      let bestPriority = null;
      for (let end = wordIndex + 1; end <= lastCandidate; end += 1) {
        const candidate = words.slice(wordIndex, end).join(' ');
        const candidateWidth = visualWidth(candidate);
        const remainder = words.slice(end).join(' ');
        const remainderWidth = visualWidth(remainder);
        const overflow = Math.max(0, candidateWidth - LIVE_STAGE_MAX_ROW_WIDTH);
        const remainderOverflow = Math.max(0, remainderWidth - futureCapacity);
        const reversedTwoRowHierarchy =
          remainingRows === 2
            ? Math.max(0, candidateWidth - remainderWidth)
            : 0;
        const strongBoundary =
          isKoreanPhraseBoundary(words, end) ||
          isSubstantialScriptBoundary(words, end);
        const priority = [
          overflow + remainderOverflow,
          reversedTwoRowHierarchy,
          isLikelyKoreanGenitiveBoundary(words, end) ? 1 : 0,
          strongBoundary ? 0 : 1,
          Math.abs(candidateWidth - target),
        ];
        if (
          bestPriority === null ||
          compareBreakPriority(priority, bestPriority) < 0
        ) {
          bestPriority = priority;
          bestEnd = end;
        }
      }
      rows.push(words.slice(wordIndex, bestEnd).join(' '));
      wordIndex = bestEnd;
    }
    rows.push(words.slice(wordIndex).join(' '));
    return rows.filter(Boolean);
  }

  const glyphs = Array.from(text);
  const rows = [];
  let offset = 0;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const remaining = glyphs.length - offset;
    const take = Math.ceil(remaining / (rowCount - rowIndex));
    rows.push(glyphs.slice(offset, offset + take).join(''));
    offset += take;
  }
  return rows.filter(Boolean);
}

function captionRowCount(text, startRowIndex, preferKoreanPair = false) {
  const width = visualWidth(text);
  const words = text.split(/\s+/u).filter(Boolean);
  if (
    preferKoreanPair &&
    HANGUL_RE.test(text) &&
    words.length >= 3 &&
    width <= LIVE_STAGE_MAX_ROW_WIDTH
  ) {
    return 2;
  }
  let capacity = 0;
  for (let index = 0; index < LIVE_STAGE_ROW_WIDTHS.length; index += 1) {
    capacity +=
      LIVE_STAGE_ROW_WIDTHS[
        (startRowIndex + index) % LIVE_STAGE_ROW_WIDTHS.length
      ];
    if (width <= capacity) return index + 1;
  }
  return LIVE_STAGE_ROW_WIDTHS.length;
}

function stripLiveStageDisplayPunctuation(value) {
  const text = String(value ?? '');
  const visible = text.replace(
    /[，、。！？；：．…,.!?;:]+/gu,
    (punctuation, offset, source) => {
      let previousIndex = offset - 1;
      while (previousIndex >= 0 && /\s/u.test(source[previousIndex])) {
        previousIndex -= 1;
      }
      let nextIndex = offset + punctuation.length;
      while (nextIndex < source.length && /\s/u.test(source[nextIndex])) {
        nextIndex += 1;
      }
      const previous = source[previousIndex] ?? '';
      const next = source[nextIndex] ?? '';
      const hasCjkPunctuation = /[，、。！？；：．…]/u.test(punctuation);
      return hasCjkPunctuation ||
        CJK_GLYPH_RE.test(previous) ||
        CJK_GLYPH_RE.test(next)
        ? ''
        : punctuation;
    },
  );
  return visible.replace(/\s{2,}/gu, ' ').trim();
}

function liveStageDisplayEntries(analysis) {
  const entries = [];
  let previousKey = '';
  let previousMainKey = '';
  let capitalizeNext = false;

  for (const unit of analysis?.units ?? []) {
    let text = stripBoundaryFillers(unit.text);
    text = collapseRepeatedPhrase(text);
    if (unit.kind === 'main') text = stripLiveStageDisplayPunctuation(text);
    const key = repeatKey(text);
    if (!text || !key || unit.fillerCandidate) {
      if (unit.fillerCandidate) capitalizeNext = true;
      continue;
    }
    if (key === previousKey) continue;
    if (unit.kind === 'parenthetical' && key === previousMainKey) continue;
    if (capitalizeNext && unit.kind === 'main') {
      text = text.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase());
    }

    entries.push({
      kind: unit.kind,
      text: unit.kind === 'parenthetical' ? `(${text})` : text,
      authored: unit.breakBefore === 'authored',
    });
    previousKey = key;
    if (unit.kind === 'main') previousMainKey = key;
    capitalizeNext = false;
  }
  const finalEntry = entries.at(-1);
  if (finalEntry?.kind === 'main') {
    finalEntry.text = finalEntry.text.replace(/[,，]\s*$/u, '').trim();
  }
  return entries;
}

function splitLiveStageContractedLead(text) {
  const match = text.match(/^(I['’]m)\s+(.+)$/iu);
  if (!match) return [];
  const continuation = match[2].replace(/[,，]\s*$/u, '').trim();
  return continuation ? [match[1], continuation] : [];
}

function captionRows(entries) {
  const rows = [];
  const preferKoreanPair = entries.length === 1;
  for (const entry of entries) {
    if (entry.kind === 'main') {
      const editorialRows = splitLiveStageContractedLead(entry.text);
      if (editorialRows.length > 0) {
        rows.push(...editorialRows);
        continue;
      }
    }
    if (entry.kind === 'parenthetical' || entry.authored) {
      rows.push(entry.text);
      continue;
    }
    const rowCount = captionRowCount(entry.text, rows.length, preferKoreanPair);
    rows.push(...splitCaptionRows(entry.text, rowCount, rows.length));
  }
  return rows;
}

function compactRows(rows, limit) {
  if (rows.length <= limit) return rows;
  return [...rows.slice(0, limit - 1), rows.slice(limit - 1).join(' ')];
}

function captionPages(rows) {
  const pageCapacity = MAX_LIVE_STAGE_CAPTION_LINES;
  const boundedRows = compactRows(
    rows,
    pageCapacity * MAX_LIVE_STAGE_CAPTION_PAGES,
  );
  const pages = [];
  for (let index = 0; index < boundedRows.length; index += pageCapacity) {
    const lines = boundedRows.slice(index, index + pageCapacity);
    pages.push({
      lines,
      weight: Math.max(
        1,
        lines.reduce((total, line) => total + visualWidth(line), 0),
      ),
    });
  }
  return pages;
}

function pageBreakProgresses(pages) {
  const totalWeight = pages.reduce((total, page) => total + page.weight, 0);
  if (pages.length <= 1 || totalWeight <= 0) return [];
  let elapsedWeight = 0;
  return pages.slice(0, -1).map((page) => {
    elapsedWeight += page.weight;
    return elapsedWeight / totalWeight;
  });
}

export function adaptLiveStageLyricsPresentation(analysis, options = {}) {
  const sourceText = String(analysis?.sourceText ?? '');
  const entries = liveStageDisplayEntries(analysis);
  const rows = captionRows(entries);
  const pages = captionPages(rows);
  const breaks = pageBreakProgresses(pages);
  const lineProgress = Number.isFinite(options.lineProgress)
    ? Math.min(1, Math.max(0, options.lineProgress))
    : null;
  const pageIndex =
    lineProgress === null
      ? 0
      : Math.min(
          pages.length - 1,
          breaks.filter((boundary) => lineProgress >= boundary).length,
        );
  const lines =
    lineProgress === null && pages.length > 1
      ? compactRows(rows, MAX_LIVE_STAGE_CAPTION_LINES)
      : (pages[pageIndex]?.lines ?? []);
  return {
    sourceText,
    speaker: analysis?.speaker ?? '',
    lines,
    pages,
    pageIndex: Math.max(0, pageIndex),
    pageBreakProgresses: breaks,
    metadataOnly: Boolean(analysis?.speaker && rows.length === 0),
    transformed: Boolean(
      analysis?.speaker || lines.join('\n') !== sourceText || pages.length > 1,
    ),
  };
}

export function lyricsPresentationProfileForTemplate(templateId) {
  const profileId =
    TEMPLATE_PROFILE_IDS[String(templateId ?? '')] ?? 'generic-caption';
  return LYRICS_PRESENTATION_PROFILES[profileId];
}

function compileLinePresentation(sourceText, analysis, profile, options) {
  if (profile.id === 'classic-ktv') {
    const presentation = adaptKtvLyricsPresentation(analysis, options);
    return {
      ...presentation,
      phrases: parseKtvDisplayPhrases(analysis, options),
    };
  }
  if (profile.id === 'manga-frame') {
    return adaptMangaLyricsPresentation(analysis, options);
  }
  if (profile.id === 'live-stage') {
    return adaptLiveStageLyricsPresentation(analysis, options);
  }
  if (profile.id === 'kinetic-pop') {
    return adaptKineticPopLyricsPresentation(sourceText, options);
  }
  if (profile.id === 'ornate-vertical') {
    return adaptOrnateVerticalLyricsPresentation(sourceText, options);
  }
  return { sourceText, text: sourceText };
}

export function compileLyricsPresentationDocument(document = {}, options = {}) {
  const profile = lyricsPresentationProfileForTemplate(options.templateId);
  const language = String(document.language ?? '');
  const lines = Array.isArray(document.lines) ? document.lines : [];
  const ornateDocumentContext =
    profile.id === 'ornate-vertical'
      ? createOrnateVerticalDocumentContext(lines)
      : null;
  return {
    documentId:
      typeof document.documentId === 'string' ? document.documentId : null,
    documentRevision: Number.isSafeInteger(document.documentRevision)
      ? document.documentRevision
      : 0,
    language,
    profile,
    lines: lines.map((line, sourceLineIndex) => {
      const sourceText = String(line?.text ?? '');
      const needsSemanticAnalysis = ![
        'generic-caption',
        'kinetic-pop',
        'ornate-vertical',
        'reading-aid',
      ].includes(profile.id);
      const analysis = needsSemanticAnalysis
        ? analyzeLyricsSource(sourceText)
        : null;
      return {
        sourceLineIndex,
        sourceText,
        ...(analysis ? { analysis } : {}),
        presentation: compileLinePresentation(sourceText, analysis, profile, {
          language,
          lineIndex: sourceLineIndex,
          kineticMaterial: options.kineticMaterial,
          documentContext: ornateDocumentContext,
        }),
      };
    }),
  };
}

function documentCacheKey(document, profile, options = {}) {
  const documentId =
    typeof document?.documentId === 'string' ? document.documentId.trim() : '';
  if (!documentId || !Number.isSafeInteger(document?.documentRevision)) {
    return null;
  }
  return [
    documentId,
    document.documentRevision,
    String(document.language ?? ''),
    profile.id,
    profile.version,
    profile.id === 'kinetic-pop'
      ? KINETIC_POP_MATERIAL_SETTINGS.has(options.kineticMaterial)
        ? options.kineticMaterial
        : KINETIC_POP_DEFAULT_MATERIAL
      : '',
  ].join('\u0000');
}

export function createLyricsPresentationDocumentCache(options = {}) {
  const compile =
    typeof options.compile === 'function'
      ? options.compile
      : compileLyricsPresentationDocument;
  const maxEntries = Number.isSafeInteger(options.maxEntries)
    ? Math.max(1, options.maxEntries)
    : 8;
  const entries = new Map();

  return {
    get(document = {}, compileOptions = {}) {
      const profile = lyricsPresentationProfileForTemplate(
        compileOptions.templateId,
      );
      const cacheKey = documentCacheKey(document, profile, compileOptions);
      if (cacheKey === null) return compile(document, compileOptions);

      const cached = entries.get(cacheKey);
      if (cached) {
        entries.delete(cacheKey);
        entries.set(cacheKey, cached);
        return cached;
      }

      const compiled = compile(document, compileOptions);
      entries.set(cacheKey, compiled);
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
      return compiled;
    },
    clear() {
      entries.clear();
    },
  };
}
