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

export function splitOrnateVerticalSegments(value) {
  const text = String(value ?? '').trim();
  const units = splitOrnateVerticalUnits(text);
  const singleSegment = () => [
    {
      index: 0,
      text,
      units,
    },
  ];
  if (units.length <= 1) return singleSegment();

  const weights = units.map(ornateUnitVisualWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight < ORNATE_VERTICAL_SPLIT_THRESHOLD) return singleSegment();

  const wordBoundaries = wordBoundaryOffsets(text);
  const hardSplit = totalWeight >= ORNATE_VERTICAL_HARD_SPLIT_THRESHOLD;
  let leftWeight = 0;
  let sourceOffset = 0;
  let best = null;

  for (let unitIndex = 0; unitIndex < units.length - 1; unitIndex += 1) {
    leftWeight += weights[unitIndex];
    sourceOffset += units[unitIndex].text.length;
    const rightWeight = totalWeight - leftWeight;
    if (
      leftWeight < ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT ||
      rightWeight < ORNATE_VERTICAL_MIN_SEGMENT_WEIGHT ||
      Math.min(leftWeight, rightWeight) / totalWeight <
        ORNATE_VERTICAL_MIN_SEGMENT_RATIO
    ) {
      continue;
    }

    const strength = splitBoundaryStrength(
      units[unitIndex],
      sourceOffset,
      wordBoundaries,
      hardSplit,
    );
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

  if (!best) return singleSegment();
  const groupedUnits = [
    units.slice(0, best.unitIndex + 1),
    units.slice(best.unitIndex + 1),
  ];
  return groupedUnits.map((segmentUnits, index) => ({
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

export function createOrnateVerticalDocumentContext(lines = []) {
  const hanFrequencies = Object.create(null);
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const unit of splitOrnateVerticalUnits(sourceLineText(line))) {
      if (unit.kind !== 'han') continue;
      const key = hanKey(unit);
      if (!key) continue;
      hanFrequencies[key] = (hanFrequencies[key] ?? 0) + 1;
    }
  }
  return Object.freeze({ hanFrequencies: Object.freeze(hanFrequencies) });
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

export function adaptOrnateVerticalLyricsPresentation(value, options = {}) {
  const sourceText = String(value ?? '');
  const text = sourceText.trim();
  const sourceSegments = splitOrnateVerticalSegments(text);
  const sourceUnits = sourceSegments.flatMap((segment) => segment.units);
  const keyword = selectKeyword(sourceUnits, options.documentContext);
  const units = [];
  const segments = sourceSegments.map((segment) => {
    const segmentUnits = segment.units.map((unit) => {
      const index = units.length;
      const presentedUnit = Object.freeze({
        ...unit,
        emphasis: keyword?.index === index ? 'keyword' : 'normal',
        index,
        reveal: unit.kind === 'han' ? 'group' : 'character',
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
    placement: ORNATE_VERTICAL_PLACEMENT,
    segments: Object.freeze(segments),
    sourceText,
    text,
    units: Object.freeze(units),
  });
}
