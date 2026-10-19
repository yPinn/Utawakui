'use strict';
const OpenCC = require('opencc-js/t2cn');
const wanakana = require('wanakana');
const { checkLowCost } = require('./lowCost.cjs');
const { contentRules } = require('./content.cjs');
const simplify = OpenCC.Converter({ from: 'tw', to: 'cn' });
const completenessRules = Object.freeze({
  minAnchorCharacters: 2,
  minInsertionCharacters: 2,
  maxInsertionCharacters: 8,
});
function normalized(text, language) {
  let value = text.normalize('NFKC').toLowerCase();
  value = language === 'zh' ? simplify(value) : wanakana.toHiragana(value);
  return [...value.replace(/[^\p{L}\p{M}\p{N}]/gu, '')];
}
function assessCompleteness(line, evidence, profile = 'script-fold') {
  if (!['script-fold', 'same-script'].includes(profile))
    throw Error('completeness profile');
  // Validate ALL original evidence before optional filtering; ignored text has budgets too.
  const baseline = checkLowCost(line, evidence, 'script-fold');
  const noLatinSource = !/\p{Script=Latin}/u.test(line.text);
  const usable =
    profile === 'same-script' && noLatinSource
      ? {
          ...evidence,
          spans: evidence.spans.filter(
            (s) =>
              !/\p{Script=Latin}/u.test(s.text) ||
              /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
                s.text,
              ),
          ),
        }
      : evidence;
  const decision =
    usable === evidence ? baseline : checkLowCost(line, usable, 'script-fold');
  const source = normalized(line.text, evidence.language);
  const target = usable.spans
    .filter((s) => {
      const clock =
        Math.round(s.start * 1000) + evidence.windowStartMs + evidence.offsetMs;
      return (
        s.boundary !== false &&
        clock >= line.startMs - contentRules.paddingMs &&
        clock <= line.endMs + contentRules.paddingMs
      );
    })
    .flatMap((s) => normalized(s.text, evidence.language));
  const unknown = {
    ...decision,
    insertionWarning: false,
    insertionCharacters: 0,
    insertionState: 'unknown',
  };
  if (source.length < completenessRules.minAnchorCharacters * 2) return unknown;
  const earliest = [],
    latest = [];
  let index = 0;
  for (let j = 0; j < target.length && index < source.length; j++)
    if (source[index] === target[j]) earliest[index++] = j;
  if (index !== source.length) return unknown;
  index = source.length - 1;
  for (let j = target.length - 1; j >= 0 && index >= 0; j--)
    if (source[index] === target[j]) latest[index--] = j;
  // Repeated-phrase ambiguity remains unknown. Never pick a convenient LCS path.
  if (earliest.some((position, i) => position !== latest[i])) return unknown;
  let insertionCharacters = 0;
  for (let i = 1; i < source.length - 2; i++) {
    const gap = earliest[i + 1] - earliest[i] - 1;
    if (
      gap >= completenessRules.minInsertionCharacters &&
      gap <= completenessRules.maxInsertionCharacters &&
      earliest[i] - earliest[i - 1] === 1 &&
      earliest[i + 2] - earliest[i + 1] === 1
    )
      insertionCharacters += gap;
  }
  return {
    ...decision,
    insertionCharacters,
    insertionWarning: insertionCharacters > 0,
    insertionState:
      insertionCharacters > 0 ? 'possible-missing-text' : 'unknown',
  };
}
module.exports = { assessCompleteness, completenessRules };
