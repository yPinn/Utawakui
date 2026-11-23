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
const LATIN_LETTER_RE = /^\p{Script=Latin}\p{M}*$/u;
const WORD_APOSTROPHE_RE = /^['’]$/u;
const LATIN_OR_DIGIT_RE = /[\p{Script=Latin}0-9]/u;
const WESTERN_INLINE_RUN_RE =
  /([\p{Script=Latin}\p{M}\u0020-\u007e\u00a0-\u00bf\u00d7\u00f7\u2010-\u2015\u2018-\u201f\u2022\u2026\u2032-\u2037\p{Sc}]+)/u;
const INLINE_SPACE_RE = /\r\n|[\t\r\n\f]/gu;
const ATTACHED_MARK_RE = /^[\s\p{P}]+$/u;
const OPENING_MARK_RE = /^[\p{Ps}\p{Pi}]$/u;
const LIGHTWEIGHT_MARK_RE = /^[\s\p{P}\p{S}]+$/u;
const AUTHORED_BREAK_RE = /(?:\r?\n|\s)$/u;
const PHRASE_PUNCTUATION_RE = /[、，,。．.!！?？;；:：…‥][\p{Pe}\p{Pf}"]*$/u;
const SENTENCE_END_RE = /[。．.!！?？][\p{Pe}\p{Pf}"]*$/u;
const NUMBER_SEPARATOR_RE = /\d[.,，．]$/u;
const JAPANESE_PARTICLE_RE =
  /(?:から|まで|より|けれど|けど|ので|のに|なら|ても|でも|って|とは|には|では|は|が|を|に|へ|で|と|も|て)$/u;
const JAPANESE_PHRASE_END_RE =
  /(?:以外|のほか|だって|たって|ても|けれど|けど|ので|のに|たら)$/u;
const JAPANESE_NOMINAL_END_RE = /以外(?=\p{Script=Han}\p{Script=Hiragana})/gu;
const JAPANESE_VERB_START_RE =
  /^\p{Script=Han}{1,3}(?![のはがをにへと])\p{Script=Hiragana}/u;
const KATAKANA_WORD_RE = /[\p{Script=Katakana}ー]{4,}/gu;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CAUSAL_CLAUSE_RE = /(?:[うくぐすつぬぶむるだたい]から|ので)[、，,]?$/u;
const ORNATE_VERTICAL_SPLIT_THRESHOLD = 12;
const ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD = 17;
const ORNATE_VERTICAL_MIN_COLUMN_WEIGHT = 3;
const ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT = 4;
const ORNATE_VERTICAL_LAYOUT_CANDIDATES = 3;
const ORNATE_VERTICAL_REFERENCE_HEIGHT_EM = 16;
const ORNATE_VERTICAL_PLACEMENT = 'right';

export const ORNATE_VERTICAL_COLUMN_GAP = '0.5em';
const ORNATE_VERTICAL_CONTINUATION_STEP_EM = 1.25;
const ORNATE_VERTICAL_BATCH_STEP_EM = 2;
export const ORNATE_VERTICAL_REGION_EXTRA_GAP_EM = 2;

export function ornateVerticalColumnSpacing(
  { regionIndex, regionColumnIndex = 0 },
  { timedContinuation = false } = {},
) {
  const stepEm = timedContinuation
    ? ORNATE_VERTICAL_CONTINUATION_STEP_EM
    : ORNATE_VERTICAL_BATCH_STEP_EM;
  return {
    topEm: regionColumnIndex * stepEm,
    extraGapEm:
      regionIndex > 0 && regionColumnIndex === 0
        ? ORNATE_VERTICAL_REGION_EXTRA_GAP_EM
        : 0,
  };
}

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
  const byUnit = units.map((unit, index) => {
    const split = unit.kind === 'han' || (mixedSizes && unit.kind === 'kana');
    const trimEnd = index === units.length - 1 && /\s$/u.test(unit.text);
    const hasLineWhitespace = /[\t\r\n\f]/u.test(unit.text);
    const western =
      LATIN_OR_DIGIT_RE.test(unit.text) ||
      (unit.kind === 'symbol' &&
        (LATIN_OR_DIGIT_RE.test(units[index - 1]?.text ?? '') ||
          LATIN_OR_DIGIT_RE.test(units[index + 1]?.text ?? '')));
    if (!split && !trimEnd && !mixedSizes && !hasLineWhitespace && !western)
      return unit.parts;
    let parts = unit.parts ?? [{ text: unit.text }];
    if (trimEnd) {
      const last = parts.findLastIndex(({ text }) => text.trimEnd());
      parts = parts.slice(0, last + 1);
      if (last >= 0) {
        parts[last] = { ...parts[last], text: parts[last].text.trimEnd() };
      }
    }
    if (hasLineWhitespace) {
      parts = parts.map((part) => ({
        ...part,
        text: part.text.replace(INLINE_SPACE_RE, ' '),
      }));
    }
    if (western) {
      parts = parts.flatMap((part) =>
        part.text
          .split(WESTERN_INLINE_RUN_RE)
          .map((text, index) =>
            index % 2
              ? {
                  ...part,
                  text,
                  style: { ...part.style, textOrientation: 'sideways' },
                }
              : { ...part, text },
          )
          .filter(({ text }) => text),
      );
    }
    if (!split) return parts;
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

  const graphemes = splitGraphemes(text);
  for (const [index, grapheme] of graphemes.entries()) {
    const opens =
      OPENING_MARK_RE.test(grapheme) ||
      (grapheme === '"' && quoteStarts.has(offset));
    offset += grapheme.length;
    if (
      groupedUnit?.kind === 'word' &&
      WORD_APOSTROPHE_RE.test(grapheme) &&
      LATIN_LETTER_RE.test(graphemes[index - 1] ?? '') &&
      LATIN_LETTER_RE.test(graphemes[index + 1] ?? '')
    ) {
      groupedUnit.text += grapheme;
      continue;
    }
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
  return text.slice(0, offset).trimEnd();
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
  if (JAPANESE_PHRASE_END_RE.test(trimmed)) return 4;
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

function ornateColumnCuts(text, units, analysis) {
  const weights = units.map(ornateUnitVisualWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const wordBoundaries = wordBoundaryOffsets(text);
  const loanwordBreaks = new Set(
    [...text.matchAll(KATAKANA_WORD_RE)].flatMap(({ index, 0: word }) => {
      const end = index + word.length;
      return text[index - 1] === 'の' &&
        /^を\p{Script=Han}/u.test(text.slice(end))
        ? [index, end]
        : [];
    }),
  );
  const cuts = [];
  let offset = 0;
  let weight = 0;
  let phraseStart = 0;
  for (const [index, unit] of units.slice(0, -1).entries()) {
    offset += unit.text.length;
    weight += weights[index];
    if (Math.min(weight, total - weight) < ORNATE_VERTICAL_MIN_COLUMN_WEIGHT)
      continue;
    if (
      wordBoundaries.has(offset + 1) &&
      /^(?:[にで][はも]|とは)$/u.test(text.slice(offset - 1, offset + 1))
    )
      continue;
    const before = ornateColumnBoundary(text, offset, analysis);
    if (before === null) continue;
    const after = text.slice(offset).trimStart();
    const punctuation = punctuationStrength(before);
    const authored =
      unit.text.includes('\n') ||
      (AUTHORED_BREAK_RE.test(unit.text) &&
        CJK_RE.test(before.at(-1)) &&
        CJK_RE.test(after[0]));
    const phrase =
      JAPANESE_PHRASE_END_RE.test(before) ||
      loanwordBreaks.has(offset) ||
      (before.endsWith('を') &&
        offset - phraseStart >= 3 &&
        offset - phraseStart <= 8 &&
        JAPANESE_VERB_START_RE.test(after));
    if (phrase) phraseStart = offset;
    const strength =
      loanwordBreaks.has(offset) || authored
        ? 7
        : splitBoundaryStrength(
            unit,
            offset,
            wordBoundaries,
            total >= ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD,
            punctuation,
          );
    if (strength === 0) continue;
    cuts.push({
      at: index + 1,
      offset,
      weight,
      strength,
      authored,
      punctuation,
      phrase,
      continuation: authored && CAUSAL_CLAUSE_RE.test(before),
    });
  }
  return { cuts, total };
}

function rankedOrnateCuts(cuts, start, end, minWeight) {
  const midpoint = (start + end) / 2;
  const balanced = cuts.filter(({ weight, authored, phrase }) => {
    const minimum = Math.max(
      minWeight,
      authored ? 0 : (end - start) * (phrase ? 0.2 : 0.25),
    );
    return weight - start >= minimum && end - weight >= minimum;
  });
  return balanced
    .sort(
      (a, b) =>
        b.strength - a.strength ||
        Math.abs(a.weight - midpoint) - Math.abs(b.weight - midpoint),
    )
    .slice(0, ORNATE_VERTICAL_LAYOUT_CANDIDATES);
}

function preferredOrnateCuts(cuts, total) {
  const authored = cuts.filter((cut) => cut.authored);
  const sentences = cuts.filter((cut) => cut.punctuation === 6);
  const phrases = cuts.filter((cut) => cut.phrase);
  const punctuated = cuts.filter((cut) => cut.punctuation);
  for (const group of [authored, sentences, punctuated, phrases]) {
    if (!group.length || group.length > 2) continue;
    const starts = [0, ...group.map(({ weight }) => weight)];
    if (
      starts.every(
        (start, index) =>
          (group[index]?.weight ?? total) - start >=
          ORNATE_VERTICAL_MIN_COLUMN_WEIGHT,
      )
    ) {
      // A short introductory pause stays inside the clause unless it already
      // has enough visual weight or was explicitly set apart in the source.
      if (
        group === punctuated &&
        group.some(
          ({ weight }) => Math.min(weight, total - weight) < total * 0.25,
        )
      )
        continue;
      if (
        group === phrases &&
        group.length === 2 &&
        group[1].weight - group[0].weight < 5
      )
        continue;
      return group;
    }
  }
  return [];
}

function ornateSegments(units, regions, sourceStart) {
  let offset = sourceStart;
  let start = 0;
  let index = 0;
  return regions.flatMap((ends, regionIndex) =>
    ends.map((end, regionColumnIndex) => {
      const segmentUnits = units.slice(start, end);
      const raw = segmentUnits.map((unit) => unit.text).join('');
      const segment = {
        index: index++,
        regionIndex,
        regionColumnIndex,
        text: raw.trim(),
        units: segmentUnits,
        sourceStart: offset,
      };
      start = end;
      offset += raw.length;
      return segment;
    }),
  );
}

function fitsReferenceHeight(columns) {
  return columns.every(
    (column) =>
      column.units.reduce(
        (total, unit) => total + ornateUnitVisualWeight(unit),
        0,
      ) +
        ornateVerticalColumnSpacing(column).topEm <=
      ORNATE_VERTICAL_REFERENCE_HEIGHT_EM,
  );
}

export function splitOrnateVerticalSegments(
  value,
  { fits = fitsReferenceHeight, continuationOffset } = {},
) {
  const source = String(value ?? '');
  const text = source.trim();
  const units = separateNominalPhrases(text, splitOrnateVerticalUnits(text));
  if (!units.length) return [];
  const analysis = analyzeLyricsText(text);
  const sourceStart = source.length - source.trimStart().length;
  const { cuts, total } = ornateColumnCuts(text, units, analysis);
  const end = units.length;
  const makeColumns = (...regions) =>
    ornateSegments(units, regions, sourceStart);
  const authored = cuts.filter((cut) => cut.authored);
  const continuation =
    continuationOffset === undefined
      ? authored.length === 1 && authored[0].continuation
        ? authored[0]
        : null
      : cuts.find(({ offset }) => offset + sourceStart === continuationOffset);
  if (continuation) {
    const pair = makeColumns([continuation.at, end]);
    if (fits(pair)) return pair;
    for (const { at } of rankedOrnateCuts(
      cuts,
      continuation.weight,
      total,
      ORNATE_VERTICAL_MIN_COLUMN_WEIGHT,
    )) {
      const wrapped = makeColumns([continuation.at], [at, end]);
      if (fits(wrapped)) return wrapped;
    }
    if (continuationOffset !== undefined) return pair;
  }
  const semantic = preferredOrnateCuts(cuts, total);
  const first = makeColumns([...semantic.map(({ at }) => at), end]);
  if (
    (semantic.length || total < ORNATE_VERTICAL_SPLIT_THRESHOLD) &&
    fits(first)
  )
    return first;
  const pivots = rankedOrnateCuts(
    cuts,
    0,
    total,
    ORNATE_VERTICAL_MIN_COLUMN_WEIGHT,
  );
  if (!pivots.length) return first;

  const preferred = makeColumns([pivots[0].at, end]);
  for (const { at } of pivots) {
    const candidate = makeColumns([at, end]);
    if (fits(candidate)) return candidate;
  }

  // The main semantic break becomes the gutter. Only the parts that need
  // vertical room wrap inside their respective right or left region.
  for (const pivot of pivots) {
    const right = rankedOrnateCuts(
      cuts,
      0,
      pivot.weight,
      ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT,
    );
    const left = rankedOrnateCuts(
      cuts,
      pivot.weight,
      total,
      ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT,
    );
    for (const { at } of right) {
      const candidate = makeColumns([at, pivot.at], [end]);
      if (fits(candidate)) return candidate;
    }
    for (const { at } of left) {
      const candidate = makeColumns([pivot.at], [at, end]);
      if (fits(candidate)) return candidate;
    }
    for (const first of right) {
      for (const second of left) {
        const candidate = makeColumns([first.at, pivot.at], [second.at, end]);
        if (fits(candidate)) return candidate;
      }
    }
  }
  const single = makeColumns([end]);
  return fits(single) ? single : semantic.length ? first : preferred;
}

export function ornateVerticalContinuationLine(lines, lineIndex, trackEndMs) {
  const pairAt = (index) => {
    const first = lines[index];
    const second = lines[index + 1];
    const right = first?.text?.trim() ?? '';
    const left = second?.text?.trim() ?? '';
    if (
      !CAUSAL_CLAUSE_RE.test(right) ||
      !/\p{Script=Hiragana}/u.test(left) ||
      CAUSAL_CLAUSE_RE.test(left) ||
      first.vocalParts?.length ||
      second.vocalParts?.length
    )
      return null;
    const startMs = first.startMs;
    const continuationStartMs = second.startMs;
    const endMs = second.endMs ?? lines[index + 2]?.startMs ?? trackEndMs;
    const gapMs = continuationStartMs - (first.endMs ?? continuationStartMs);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(continuationStartMs) ||
      !Number.isFinite(endMs) ||
      continuationStartMs - startMs < 380 ||
      continuationStartMs - startMs > 3000 ||
      Math.abs(gapMs) > 100 ||
      endMs - continuationStartMs < 380
    )
      return null;
    return {
      lineId: first.lineId ?? `ornate:${index}:${startMs}`,
      text: `${right}\n${left}`,
      startMs,
      endMs,
      continuation: {
        startMs: continuationStartMs,
        offset: right.length + 1,
        index,
      },
    };
  };
  return pairAt(lineIndex - 1) ?? pairAt(lineIndex);
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
  const sourceSegments =
    options.segments ?? splitOrnateVerticalSegments(sourceText);
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
      regionIndex: segment.regionIndex,
      regionColumnIndex: segment.regionColumnIndex,
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
