import {
  analyzeLyricsText,
  isProtectedLyricsBreak,
  isSafeLyricsBreak,
} from './lyricsTextProcessing.mjs';

const GRAPHEME_SEGMENTER =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : null;
const WORD_SEGMENTER =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter('ja', { granularity: 'word' })
    : null;

const HAN_GRAPHEME_RE = /^\p{Script=Han}\p{M}*$/u;
const KANA_GRAPHEME_RE =
  /^(?:[\p{Script=Hiragana}\p{Script=Katakana}\u30fc]\p{M}*)$/u;
const WORD_GRAPHEME_RE = /^[\p{L}\p{M}\p{N}]+$/u;
const ATTACHED_MARK_RE = /^[\s\p{P}]+$/u;
const OPENING_MARK_RE = /^[\p{Ps}\p{Pi}]$/u;
const LIGHTWEIGHT_MARK_RE = /^[\s\p{P}\p{S}]+$/u;
const AUTHORED_BREAK_RE = /(?:\r?\n|\s)$/u;
const PHRASE_PUNCTUATION_RE = /[、，,。．.!！?？;；:：…‥][\p{Pe}\p{Pf}"]*$/u;
const SENTENCE_END_RE = /[。．.!！?？][\p{Pe}\p{Pf}"]*$/u;
const NUMBER_SEPARATOR_RE = /\d[.,，．]$/u;
const JAPANESE_PARTICLE_RE =
  /(?:から|まで|より|けれど|けど|ので|のに|なら|ても|でも|って|とは|には|では|は|が|を|に|へ|で|と|も|の|て)$/u;
const JAPANESE_LYRIC_RE = /\p{Script=Hiragana}/u;
const JAPANESE_PHRASE_END_RE =
  /(?:以外|のほか|だって|たって|ても|けれど|けど|ので|のに)$/u;
const JAPANESE_NOMINAL_END_RE = /以外(?=\p{Script=Han}\p{Script=Hiragana})/gu;
const JAPANESE_VERB_START_RE =
  /^\p{Script=Han}{1,3}(?![のはがをにへと])\p{Script=Hiragana}/u;
const KATAKANA_WORD_RE = /[\p{Script=Katakana}ー]{4,}/gu;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ORNATE_VERTICAL_SPLIT_THRESHOLD = 12;
const ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD = 17;
const ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT = 4;
const ORNATE_VERTICAL_MIN_SEGMENT_RATIO = 0.3;
const ORNATE_VERTICAL_PLACEMENT = 'right';

export const ORNATE_VERTICAL_COLUMN_GAP = '0.5em';
export const ORNATE_VERTICAL_COLUMN_STEP_EM = 1.25;

function splitGraphemes(value) {
  const text = String(value ?? '');
  return GRAPHEME_SEGMENTER
    ? [...GRAPHEME_SEGMENTER.segment(text)].map(({ segment }) => segment)
    : Array.from(text);
}

function graphemeKind(grapheme) {
  if (HAN_GRAPHEME_RE.test(grapheme)) return 'han';
  if (KANA_GRAPHEME_RE.test(grapheme)) return 'kana';
  if (WORD_GRAPHEME_RE.test(grapheme)) return 'word';
  return 'symbol';
}

export function ornateVerticalGlyphGapEm(glyph, nextGlyph) {
  if (!nextGlyph) return 0;
  const kind = graphemeKind(glyph);
  const nextKind = graphemeKind(nextGlyph);
  if (kind === 'han' && nextKind === 'han') return 0.08;
  if (
    (kind === 'han' && nextKind === 'kana') ||
    (kind === 'kana' && nextKind === 'han')
  )
    return 0.12;
  return 0;
}

// One column at a time. Keep Latin runs intact and put the extra space on
// the preceding glyph, in units of the column's base font size.
export function ornateVerticalGlyphParts(units, mixedSizes) {
  const byUnit = units.map((unit) => {
    const split = unit.kind === 'han' || (mixedSizes && unit.kind === 'kana');
    if (!split)
      return mixedSizes ? (unit.parts ?? [{ text: unit.text }]) : unit.parts;
    const parts = unit.parts ?? [{ text: unit.text }];
    return parts.flatMap((part) =>
      splitGraphemes(part.text).map((text) => ({
        ...part,
        text,
        kind: graphemeKind(text),
      })),
    );
  });
  if (!mixedSizes) return byUnit;
  const column = byUnit.flat();
  let index = 0;
  return byUnit.map((parts) =>
    parts.map((part) => {
      const next = column[++index];
      const { kind } = part;
      if (kind !== 'han' && kind !== 'kana') return part;
      const scale = kind === 'han' ? 1.25 : 0.8;
      const gap = ornateVerticalGlyphGapEm(part.text, next?.text);
      return {
        ...part,
        style: {
          fontSize: `${scale}em`,
          ...(gap
            ? { marginInlineEnd: `${Number((gap / scale).toFixed(5))}em` }
            : {}),
        },
      };
    }),
  );
}

function hanKey(unit) {
  return (
    String(unit?.text ?? '')
      .match(/\p{Script=Han}/gu)
      ?.join('') ?? ''
  );
}

export function splitOrnateVerticalUnits(value, { splitHan = false } = {}) {
  const text = String(value ?? '');
  const quoteStarts = new Set(
    text.includes('"')
      ? analyzeLyricsText(text).pairedRanges.map(
          ({ sourceStart }) => sourceStart,
        )
      : [],
  );
  const units = [];
  let offset = 0;
  let leadingText = '';
  let groupedUnit = null;

  const flushGroupedUnit = () => {
    if (!groupedUnit) return;
    units.push(groupedUnit);
    groupedUnit = null;
  };

  for (const grapheme of splitGraphemes(text)) {
    const opens =
      OPENING_MARK_RE.test(grapheme) ||
      (grapheme === '"' && quoteStarts.has(offset));
    offset += grapheme.length;
    if (ATTACHED_MARK_RE.test(grapheme)) {
      if (opens || leadingText) {
        flushGroupedUnit();
        leadingText += grapheme;
      } else if (groupedUnit) {
        groupedUnit.text += grapheme;
        flushGroupedUnit();
      } else if (units.length > 0) {
        units.at(-1).text += grapheme;
      } else {
        leadingText += grapheme;
      }
      continue;
    }

    const kind = graphemeKind(grapheme);
    if (kind === 'kana' || kind === 'symbol' || (splitHan && kind === 'han')) {
      flushGroupedUnit();
      units.push({ kind, text: `${leadingText}${grapheme}` });
      leadingText = '';
      continue;
    }

    if (groupedUnit?.kind !== kind) {
      flushGroupedUnit();
      groupedUnit = { kind, text: leadingText };
      leadingText = '';
    }
    groupedUnit.text += grapheme;
  }

  flushGroupedUnit();
  if (leadingText) {
    if (units.length > 0) units.at(-1).text += leadingText;
    else units.push({ kind: 'symbol', text: leadingText });
  }
  return units;
}

export function splitOrnateVerticalRevealUnit(unit) {
  return unit.kind === 'han'
    ? splitOrnateVerticalUnits(unit.text, { splitHan: true })
    : [unit];
}

function ornateUnitVisualWeight(unit) {
  return splitGraphemes(unit?.text).reduce(
    (total, grapheme) =>
      total + (LIGHTWEIGHT_MARK_RE.test(grapheme) ? 0.45 : 1),
    0,
  );
}

function wordBoundaryOffsets(value) {
  if (!WORD_SEGMENTER) return new Set();
  return new Set(
    [...WORD_SEGMENTER.segment(value)].map(
      ({ index, segment }) => index + segment.length,
    ),
  );
}

function punctuationStrength(before) {
  if (SENTENCE_END_RE.test(before)) return 6;
  return PHRASE_PUNCTUATION_RE.test(before) ? 5 : 0;
}

function ornateColumnBoundary(text, offset, analysis) {
  if (
    isProtectedLyricsBreak(analysis, offset) ||
    !isSafeLyricsBreak(text, offset) ||
    (/^\d/u.test(text[offset] ?? '') &&
      NUMBER_SEPARATOR_RE.test(text.slice(offset - 2, offset)))
  )
    return null;
  return {
    before: text.slice(0, offset).trimEnd(),
    after: text.slice(offset).trimStart(),
  };
}

function splitBoundaryStrength(
  unit,
  sourceOffset,
  wordBoundaries,
  hardSplit,
  punctuation,
) {
  const source = String(unit?.text ?? '');
  const trimmed = source.trimEnd();
  if (source.includes('\n')) return 7;
  if (punctuation) return punctuation;
  if (AUTHORED_BREAK_RE.test(source)) return 4;
  if (wordBoundaries.has(sourceOffset) && JAPANESE_PARTICLE_RE.test(trimmed)) {
    return 3;
  }
  if (wordBoundaries.has(sourceOffset)) return 2;
  return hardSplit ? 1 : 0;
}

function separateNominalPhrases(text, units) {
  const ends = [...text.matchAll(JAPANESE_NOMINAL_END_RE)].map(
    ({ index, 0: word }) => index + word.length,
  );
  if (!ends.length) return units;
  const wordBoundaries = wordBoundaryOffsets(text);
  let offset = 0;
  return units.flatMap((unit) => {
    const start = offset;
    offset += unit.text.length;
    const end = ends.find(
      (at) => at > start && at < offset && wordBoundaries.has(at),
    );
    return unit.kind === 'han' && end !== undefined
      ? [
          { ...unit, text: unit.text.slice(0, end - start) },
          { ...unit, text: unit.text.slice(end - start) },
        ]
      : [unit];
  });
}

function ornatePhraseColumns(text, units, analysis) {
  const authored = [];
  const punctuated = [];
  const phrases = [];
  const japanese = JAPANESE_LYRIC_RE.test(text);
  const loanwordBreaks = japanese
    ? [...text.matchAll(KATAKANA_WORD_RE)].flatMap(({ index, 0: word }) => {
        const end = index + word.length;
        return text[index - 1] === 'の' &&
          /^を\p{Script=Han}/u.test(text.slice(end))
          ? [index, end]
          : [];
      })
    : [];
  let offset = 0;
  let phraseStart = 0;
  for (const [index, unit] of units.slice(0, -1).entries()) {
    offset += unit.text.length;
    const boundary = ornateColumnBoundary(text, offset, analysis);
    if (!boundary) continue;
    const { before, after } = boundary;
    if (
      AUTHORED_BREAK_RE.test(unit.text) &&
      CJK_RE.test(before.at(-1)) &&
      CJK_RE.test(after[0])
    ) {
      authored.push(index + 1);
    } else if (punctuationStrength(before)) {
      punctuated.push(index + 1);
    } else if (
      japanese &&
      (JAPANESE_PHRASE_END_RE.test(before) ||
        (before.endsWith('を') &&
          offset - phraseStart >= 3 &&
          offset - phraseStart <= 8 &&
          JAPANESE_VERB_START_RE.test(after)) ||
        loanwordBreaks.includes(offset))
    ) {
      phrases.push(index + 1);
      phraseStart = offset;
    }
  }
  const boundaries = authored.length
    ? authored
    : punctuated.length
      ? punctuated
      : phrases;
  if (!boundaries.length || boundaries.length > 2) return null;
  const columns = [0, ...boundaries].map((start, index) =>
    units.slice(start, boundaries[index]),
  );
  return columns.every((column) => {
    const weight = column.reduce(
      (total, unit) => total + ornateUnitVisualWeight(unit),
      0,
    );
    return (
      weight >= 3 &&
      (boundaries !== punctuated || weight <= ORNATE_VERTICAL_SPLIT_THRESHOLD)
    );
  })
    ? columns
    : null;
}

function groupOrnateVerticalColumns(text, units, allowThirdColumn, analysis) {
  if (units.length <= 1) return [units];

  const weights = units.map(ornateUnitVisualWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight < ORNATE_VERTICAL_SPLIT_THRESHOLD) return [units];

  const wordBoundaries = wordBoundaryOffsets(text);
  const hardSplit = totalWeight >= ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD;
  let leftWeight = 0;
  let sourceOffset = 0;
  let best = null;
  let shortOpening = null;

  for (let unitIndex = 0; unitIndex < units.length - 1; unitIndex += 1) {
    leftWeight += weights[unitIndex];
    sourceOffset += units[unitIndex].text.length;
    const boundary = ornateColumnBoundary(text, sourceOffset, analysis);
    if (!boundary) continue;
    const rightWeight = totalWeight - leftWeight;
    const strength = splitBoundaryStrength(
      units[unitIndex],
      sourceOffset,
      wordBoundaries,
      hardSplit,
      punctuationStrength(boundary.before),
    );
    if (
      allowThirdColumn &&
      totalWeight >= 20 &&
      strength >= 4 &&
      leftWeight >= ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT &&
      leftWeight / totalWeight < ORNATE_VERTICAL_MIN_SEGMENT_RATIO
    ) {
      shortOpening = { unitIndex, sourceOffset };
    }
    if (
      leftWeight < ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT ||
      rightWeight < ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT ||
      Math.min(leftWeight, rightWeight) / totalWeight <
        ORNATE_VERTICAL_MIN_SEGMENT_RATIO
    ) {
      continue;
    }

    if (strength === 0) continue;
    const imbalance = Math.abs(leftWeight - rightWeight);
    if (
      !best ||
      strength > best.strength ||
      (strength === best.strength && imbalance < best.imbalance)
    ) {
      best = { imbalance, strength, unitIndex };
    }
  }

  if (shortOpening) {
    const boundary = shortOpening.unitIndex + 1;
    const remainderText = text.slice(shortOpening.sourceOffset);
    const remainder = groupOrnateVerticalColumns(
      remainderText,
      units.slice(boundary),
      false,
      analyzeLyricsText(remainderText),
    );
    if (remainder.length === 2) return [units.slice(0, boundary), ...remainder];
  }
  if (!best) return [units];
  return [units.slice(0, best.unitIndex + 1), units.slice(best.unitIndex + 1)];
}

export function splitOrnateVerticalSegments(value) {
  const source = String(value ?? '');
  const text = source.trim();
  const units = splitOrnateVerticalUnits(text);
  const analysis = analyzeLyricsText(text);
  const columns =
    ornatePhraseColumns(text, separateNominalPhrases(text, units), analysis) ??
    groupOrnateVerticalColumns(text, units, true, analysis);
  let offset = source.length - source.trimStart().length;
  return columns.map((segmentUnits, index) => {
    const raw = segmentUnits.map((unit) => unit.text).join('');
    const sourceStart = offset;
    offset += raw.length;
    return { index, text: raw.trim(), units: segmentUnits, sourceStart };
  });
}

function sourceLineText(line) {
  return typeof line === 'string' ? line : String(line?.text ?? '');
}

const MINIMUM_SECTION_LINES = 3;

function normalizedLine(line) {
  if (!Number.isFinite(line?.startMs)) return '';
  return String(line.text ?? '')
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLowerCase();
}

// Repeated lyrics are evidence for a presentation accent. Keep the original
// line order, and let blanks and untimed lines break a match.
function repeatedLyricsSections(lines) {
  const keys = lines.map(normalizedLine);
  const startsByPhrase = new Map();
  for (let start = 0; start <= keys.length - MINIMUM_SECTION_LINES; start++) {
    const phrase = keys.slice(start, start + MINIMUM_SECTION_LINES);
    if (phrase.includes('') || new Set(phrase).size < MINIMUM_SECTION_LINES)
      continue;
    const key = JSON.stringify(phrase);
    const starts = startsByPhrase.get(key) ?? [];
    if (!starts.length || start - starts.at(-1) >= MINIMUM_SECTION_LINES) {
      starts.push(start);
      startsByPhrase.set(key, starts);
    }
  }

  let best = null;
  for (const starts of startsByPhrase.values()) {
    if (starts.length < 2) continue;
    const maxLength = starts.reduce(
      (shortest, start, index) =>
        Math.min(shortest, (starts[index + 1] ?? keys.length) - start),
      Infinity,
    );
    let length = MINIMUM_SECTION_LINES;
    while (
      length < maxLength &&
      keys[starts[0] + length] &&
      starts.every((start) => keys[start + length] === keys[starts[0] + length])
    ) {
      length++;
    }
    const coverage = length * starts.length;
    if (
      !best ||
      coverage > best.coverage ||
      (coverage === best.coverage && length > best.length)
    ) {
      best = { starts, length, coverage };
    }
  }
  // A repeated verse can be longer than the chorus. Use the total number of
  // matching lines across all occurrences and keep one dominant family.
  const byLine = [];
  if (best) {
    const { starts, length } = best;
    starts.forEach((start, occurrence) => {
      for (let offset = 0; offset < length; offset++) {
        byLine[start + offset] = Object.freeze({
          offset,
          occurrence,
          final: occurrence === starts.length - 1,
        });
      }
    });
  }
  return Object.freeze(byLine);
}

export function createOrnateVerticalDocumentContext(lines = [], options = {}) {
  const sourceLines = Array.isArray(lines) ? lines : [];
  const hanFrequencies = Object.create(null);
  for (const line of sourceLines) {
    for (const unit of splitOrnateVerticalUnits(sourceLineText(line))) {
      if (unit.kind !== 'han') continue;
      const key = hanKey(unit);
      if (!key) continue;
      hanFrequencies[key] = (hanFrequencies[key] ?? 0) + 1;
    }
  }
  return Object.freeze({
    hanFrequencies: Object.freeze(hanFrequencies),
    ...(options.synced === true
      ? { sectionAccents: repeatedLyricsSections(sourceLines) }
      : {}),
  });
}

function selectKeyword(units, documentContext) {
  const frequencies = documentContext?.hanFrequencies ?? {};
  let selected = null;

  for (const [index, unit] of units.entries()) {
    if (unit.kind !== 'han') continue;
    const key = hanKey(unit);
    const length = splitGraphemes(key).length;
    const frequency = Number(frequencies[key] ?? 0);
    const reliable =
      (length >= 2 && length <= 4) || (length === 1 && frequency >= 2);
    if (!reliable) continue;

    const score = frequency * 10 + (length === 2 ? 4 : 5 - length);
    if (!selected || score > selected.score) {
      selected = { index, score, text: key };
    }
  }

  return selected
    ? Object.freeze({ index: selected.index, text: selected.text })
    : null;
}

function sectionAccentRanges(text, startOffset, section) {
  if (!section || !WORD_SEGMENTER) return [];
  const candidates = [];
  for (const { segment, index, isWordLike } of WORD_SEGMENTER.segment(text)) {
    if (!isWordLike) continue;
    let from = startOffset + index;
    const graphemes = splitGraphemes(segment);
    if (
      graphemes.some(
        (glyph) => HAN_GRAPHEME_RE.test(glyph) || KANA_GRAPHEME_RE.test(glyph),
      )
    ) {
      for (const glyph of graphemes) {
        const to = from + glyph.length;
        if (!LIGHTWEIGHT_MARK_RE.test(glyph)) candidates.push({ from, to });
        from = to;
      }
    } else {
      candidates.push({ from, to: from + segment.length });
    }
  }
  if (candidates.length < 2) return [];
  if (section.final) {
    const second = Math.max(2, Math.ceil((candidates.length - 1) / 2));
    return [candidates[0], candidates[second]].filter(Boolean);
  }
  const positions = [0, 0.5, 0, 0.8];
  const position =
    positions[(section.offset + section.occurrence) % positions.length];
  return [candidates[Math.round(position * (candidates.length - 1))]];
}

function accentParts(text, offset, accents) {
  const parts = [];
  let cursor = 0;
  for (const { from, to } of accents) {
    const start = Math.max(0, from - offset);
    const end = Math.min(text.length, to - offset);
    if (end <= start) continue;
    if (cursor < start) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: text.slice(start, end), accent: true });
    cursor = end;
  }
  if (parts.length && cursor < text.length)
    parts.push({ text: text.slice(cursor) });
  return parts;
}

export function adaptOrnateVerticalLyricsPresentation(value, options = {}) {
  const sourceText = String(value ?? '');
  const text = sourceText.trim();
  const sourceSegments = splitOrnateVerticalSegments(sourceText);
  const sourceUnits = sourceSegments.flatMap((segment) => segment.units);
  const keyword = selectKeyword(sourceUnits, options.documentContext);
  let offset = sourceText.length - sourceText.trimStart().length;
  const accents =
    options.sectionAccentRanges ??
    sectionAccentRanges(
      text,
      offset,
      options.documentContext?.sectionAccents?.[options.lineIndex],
    );
  const units = [];
  let layoutUnitIndex = 0;
  let presentedKeyword = null;
  const segments = sourceSegments.map((segment) => {
    const segmentUnits = segment.units.flatMap((layoutUnit) => {
      const emphasized = keyword?.index === layoutUnitIndex;
      layoutUnitIndex += 1;
      if (emphasized) {
        presentedKeyword = Object.freeze({ ...keyword, index: units.length });
      }
      return splitOrnateVerticalRevealUnit(layoutUnit).map((unit) => {
        const parts = accentParts(unit.text, offset, accents);
        offset += unit.text.length;
        const presentedUnit = Object.freeze({
          ...unit,
          emphasis: emphasized ? 'keyword' : 'normal',
          index: units.length,
          reveal: unit.kind === 'word' ? 'group' : 'character',
          ...(parts.length ? { parts } : {}),
        });
        units.push(presentedUnit);
        return presentedUnit;
      });
    });
    return Object.freeze({
      index: segment.index,
      sourceStart: segment.sourceStart,
      text: segment.text,
      units: Object.freeze(segmentUnits),
    });
  });
  return Object.freeze({
    keyword: presentedKeyword,
    ...(accents.length ? { sectionAccentRanges: accents } : {}),
    placement: ORNATE_VERTICAL_PLACEMENT,
    segments: Object.freeze(segments),
    sourceText,
    text,
    units: Object.freeze(units),
  });
}
