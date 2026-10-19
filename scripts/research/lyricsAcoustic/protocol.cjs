'use strict';

const wanakana = require('wanakana');
const recipe = Object.freeze({
  sampleRate: 44100,
  maxWindowMs: 30000,
  maxLineMs: 20000,
  contextMs: 2000,
  paddingMs: 350,
  maxDurationMs: 1800000,
  maxMessageBytes: 2097152,
  silencePeak: 1e-8,
});
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function textCuts(text, language) {
  const cuts = [0];
  let seenWord = false;
  for (const part of new Intl.Segmenter(language, {
    granularity: 'word',
  }).segment(text)) {
    if (!part.isWordLike) continue;
    if (seenWord) cuts.push(part.index);
    seenWord = true;
  }
  if (text.length) cuts.push(text.length);
  return cuts;
}

function lexicalUnits(text, language) {
  if (
    !['zh', 'ja'].includes(language) ||
    typeof text !== 'string' ||
    text.length > 2000
  )
    throw new Error('unsupported-language');
  const allowed =
    language === 'zh'
      ? /^[\p{Script=Han}\p{M}]+$/u
      : /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{M}ー々]+$/u;
  const units = [];
  for (const part of graphemes.segment(text)) {
    if (/^[\p{P}\p{Z}\s]+$/u.test(part.segment)) continue;
    if (!allowed.test(part.segment)) throw new Error('unsupported-language');
    units.push({
      text: part.segment,
      from: part.index,
      to: part.index + part.segment.length,
    });
  }
  if (!units.length) throw new Error('unsupported-language');
  return units;
}

function moraUnits(text) {
  const result = [];
  for (const { segment } of graphemes.segment(text)) {
    if (
      'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ'.includes(segment) &&
      result.length
    )
      result[result.length - 1] += segment;
    else result.push(segment);
  }
  return result;
}

function japaneseWords(text, tokenize) {
  const units = lexicalUnits(text, 'ja');
  const lexical = units.map((u) => u.text).join('');
  const tokens = tokenize(lexical);
  if (tokens.map((t) => t.surface).join('') !== lexical)
    throw new Error('unsupported-language');
  const starts = new Map(),
    ends = new Map();
  let position = 0;
  for (const unit of units) {
    starts.set(position, unit.from);
    position += unit.text.length;
    ends.set(position, unit.to);
  }
  const words = [];
  position = 0;
  let previous = '';
  for (const token of tokens) {
    const kana = /^[ぁ-ゖァ-ヺー\p{M}]+$/u.test(token.surface);
    for (const piece of kana ? moraUnits(token.surface) : [token.surface]) {
      const reading = wanakana
        .toHiragana(kana ? piece : token.reading || '')
        .normalize('NFC');
      if (!reading) throw new Error('unsupported-language');
      const roman = moraUnits(reading).map((mora) => {
        let value = wanakana.toRomaji(mora);
        if (mora === 'っ') value = 'cl';
        if (mora === 'ー') {
          if (!/[aiueo]$/.test(previous))
            throw new Error('unsupported-language');
          value = previous.at(-1);
        }
        previous = value;
        return value;
      });
      const first = starts.get(position);
      position += piece.length;
      const end = ends.get(position);
      if (first === undefined || end === undefined)
        throw new Error('unsupported-language');
      words.push({ text: piece, from: first, to: end, roman });
    }
  }
  return words;
}

function planWindows(lines, durationMs, offsetMs) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > recipe.maxDurationMs ||
    !Number.isSafeInteger(offsetMs) ||
    Math.abs(offsetMs) > 3600000
  )
    throw new Error('invalid research clock');
  const windows = [],
    declined = {};
  const ids = new Set();
  for (const line of [...lines].sort((a, b) => a.startMs - b.startMs)) {
    if (ids.has(line.lineId)) throw new Error('duplicate occurrence');
    ids.add(line.lineId);
    const start = line.startMs - offsetMs,
      end = line.endMs === null ? null : line.endMs - offsetMs;
    if (
      !Number.isSafeInteger(line.startMs) ||
      !Number.isSafeInteger(line.endMs) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      end > durationMs ||
      end - start > recipe.maxLineMs
    ) {
      declined[line.lineId] = 'unresolved-interval';
      continue;
    }
    const left = Math.max(0, start - recipe.contextMs),
      right = Math.min(durationMs, end + recipe.contextMs);
    let window = windows.find((w) => w.startMs <= left && w.endMs >= right);
    if (!window) {
      const begin = Math.max(
        0,
        Math.min(left, durationMs - recipe.maxWindowMs),
      );
      window = {
        index: windows.length,
        startMs: begin,
        endMs: Math.min(durationMs, begin + recipe.maxWindowMs),
        lineIds: [],
      };
      windows.push(window);
    }
    window.lineIds.push(line.lineId);
  }
  return { windows, declined };
}

function mapStarts(words, spans, windowStartMs, offsetMs) {
  const result = new Map();
  let previous = -1;
  let previousStart = -Infinity;
  for (const span of spans) {
    if (
      !Number.isInteger(span.index) ||
      span.index <= previous ||
      !words[span.index] ||
      !Number.isFinite(span.start) ||
      span.start < 0 ||
      span.start < previousStart
    )
      throw new Error('invalid occurrence path');
    result.set(
      words[span.index].from,
      Math.round(span.start * 1000 + windowStartMs + offsetMs),
    );
    previous = span.index;
    previousStart = span.start;
  }
  return result;
}

function scoreCuts(cuts, references, predictions) {
  const requestedCuts = cuts.slice(1, -1),
    errors = [];
  let scorable = 0,
    retained = 0;
  for (const cut of requestedCuts) {
    if (predictions.has(cut)) retained++;
    if (!references.has(cut)) continue;
    scorable++;
    if (predictions.has(cut))
      errors.push(Math.abs(predictions.get(cut) - references.get(cut)));
  }
  const within100 = errors.filter((e) => e <= 100).length;
  return {
    requested: requestedCuts.length,
    scorable,
    noReference: requestedCuts.length - scorable,
    retained,
    within100,
    onset100: scorable ? within100 / scorable : null,
    coverage: scorable ? errors.length / scorable : null,
    errorsMs: errors,
  };
}

module.exports = {
  recipe,
  textCuts,
  lexicalUnits,
  japaneseWords,
  planWindows,
  mapStarts,
  scoreCuts,
};
