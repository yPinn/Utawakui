const GRAPHEME_SEGMENTER =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const TIMING_CJK_GRAPHEME_RE =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const WORD_GRAPHEME_RE = /^[\p{L}\p{M}\p{N}]+$/u;
const WHITESPACE_GRAPHEME_RE = /^\s+$/u;
const PUNCTUATION_GRAPHEME_RE = /^\p{P}+$/u;

function splitGraphemes(value) {
  return GRAPHEME_SEGMENTER
    ? [...GRAPHEME_SEGMENTER.segment(value)].map(({ segment }) => segment)
    : Array.from(value);
}

export function estimatedLyricsTextUnits(value) {
  const sourceText = String(value ?? '');
  if (!sourceText.trim()) return [];

  const units = [];
  let currentWord = null;
  let leadingText = '';
  const flushWord = () => {
    if (!currentWord) return;
    units.push(currentWord);
    currentWord = null;
  };

  for (const grapheme of splitGraphemes(sourceText)) {
    if (WHITESPACE_GRAPHEME_RE.test(grapheme)) {
      if (currentWord) {
        currentWord.text += grapheme;
        flushWord();
      } else if (units.length > 0) {
        units.at(-1).text += grapheme;
      } else {
        leadingText += grapheme;
      }
      continue;
    }
    if (TIMING_CJK_GRAPHEME_RE.test(grapheme)) {
      flushWord();
      units.push({ text: `${leadingText}${grapheme}`, weight: 1 });
      leadingText = '';
      continue;
    }
    if (WORD_GRAPHEME_RE.test(grapheme)) {
      if (!currentWord) {
        currentWord = { text: leadingText, weight: 0 };
        leadingText = '';
      }
      currentWord.text += grapheme;
      currentWord.weight += 1;
      continue;
    }
    if (PUNCTUATION_GRAPHEME_RE.test(grapheme)) {
      if (currentWord) currentWord.text += grapheme;
      else if (units.length > 0) units.at(-1).text += grapheme;
      else leadingText += grapheme;
      continue;
    }

    flushWord();
    units.push({ text: `${leadingText}${grapheme}`, weight: 1 });
    leadingText = '';
  }

  flushWord();
  if (leadingText) {
    if (units.length > 0) units.at(-1).text += leadingText;
    else units.push({ text: leadingText, weight: 1 });
  }
  return units;
}
