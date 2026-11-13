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
const LIGHTWEIGHT_MARK_RE = /^[\s\p{P}\p{S}]+$/u;
const AUTHORED_BREAK_RE = /(?:\r?\n|\s)$/u;
const PHRASE_PUNCTUATION_RE = /[、，,。．.!！?？;；:：…]$/u;
const JAPANESE_PARTICLE_RE =
  /(?:から|まで|より|けれど|けど|ので|のに|なら|ても|でも|って|とは|には|では|は|が|を|に|へ|で|と|も|の|て)$/u;
const ORNATE_VERTICAL_SPLIT_THRESHOLD = 12;
const ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD = 17;
const ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT = 4;
const ORNATE_VERTICAL_MIN_SEGMENT_RATIO = 0.3;
const ORNATE_VERTICAL_PLACEMENT = 'right';

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

function hanKey(unit) {
  return (
    String(unit?.text ?? '')
      .match(/\p{Script=Han}/gu)
      ?.join('') ?? ''
  );
}

export function splitOrnateVerticalUnits(value) {
  const units = [];
  let leadingText = '';
  let groupedUnit = null;

  const flushGroupedUnit = () => {
    if (!groupedUnit) return;
    units.push(groupedUnit);
    groupedUnit = null;
  };

  for (const grapheme of splitGraphemes(value)) {
    if (ATTACHED_MARK_RE.test(grapheme)) {
      if (groupedUnit) {
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
    if (kind === 'kana' || kind === 'symbol') {
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

function splitBoundaryStrength(unit, sourceOffset, wordBoundaries, hardSplit) {
  const source = String(unit?.text ?? '');
  const trimmed = source.trimEnd();
  if (AUTHORED_BREAK_RE.test(source)) return 5;
  if (PHRASE_PUNCTUATION_RE.test(trimmed)) return 4;
  if (wordBoundaries.has(sourceOffset) && JAPANESE_PARTICLE_RE.test(trimmed)) {
    return 3;
  }
  if (wordBoundaries.has(sourceOffset)) return 2;
  return hardSplit ? 1 : 0;
}

function groupOrnateVerticalColumns(text, units, allowThirdColumn) {
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
    const rightWeight = totalWeight - leftWeight;
    const strength = splitBoundaryStrength(
      units[unitIndex],
      sourceOffset,
      wordBoundaries,
      hardSplit,
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
    const remainder = groupOrnateVerticalColumns(
      text.slice(shortOpening.sourceOffset),
      units.slice(boundary),
      false,
    );
    if (remainder.length === 2) return [units.slice(0, boundary), ...remainder];
  }
  if (!best) return [units];
  return [units.slice(0, best.unitIndex + 1), units.slice(best.unitIndex + 1)];
}

export function splitOrnateVerticalSegments(value) {
  const text = String(value ?? '').trim();
  const units = splitOrnateVerticalUnits(text);
  const columns = groupOrnateVerticalColumns(text, units, true);
  return columns.map((segmentUnits, index) => ({
    index,
    text: segmentUnits
      .map((unit) => unit.text)
      .join('')
      .trim(),
    units: segmentUnits,
  }));
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
  const sourceSegments = splitOrnateVerticalSegments(text);
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
  const segments = sourceSegments.map((segment) => {
    const segmentUnits = segment.units.map((unit) => {
      const index = units.length;
      const parts = accentParts(unit.text, offset, accents);
      offset += unit.text.length;
      const presentedUnit = Object.freeze({
        ...unit,
        emphasis: keyword?.index === index ? 'keyword' : 'normal',
        index,
        reveal: unit.kind === 'han' ? 'group' : 'character',
        ...(parts.length ? { parts } : {}),
      });
      units.push(presentedUnit);
      return presentedUnit;
    });
    return Object.freeze({
      index: segment.index,
      text: segment.text,
      units: Object.freeze(segmentUnits),
    });
  });
  return Object.freeze({
    keyword,
    ...(accents.length ? { sectionAccentRanges: accents } : {}),
    placement: ORNATE_VERTICAL_PLACEMENT,
    segments: Object.freeze(segments),
    sourceText,
    text,
    units: Object.freeze(units),
  });
}
