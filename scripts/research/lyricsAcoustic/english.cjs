'use strict';
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
const numbers =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(
    ' ',
  );
const contractions = Object.freeze({
  "can't": ['can', 'not'],
  cannot: ['can', 'not'],
  "won't": ['will', 'not'],
  "i'm": ['i', 'am'],
  "it's": ['it', 'is'],
  "that's": ['that', 'is'],
  "there's": ['there', 'is'],
});
function comparisonWords(text) {
  const value = text.normalize('NFKC').toLowerCase().replaceAll('’', "'");
  return [...value.matchAll(/[a-z]+(?:'[a-z]+)*|\d+/gu)].flatMap(([word]) => {
    if (Object.hasOwn(contractions, word)) return contractions[word];
    if (/n't$/u.test(word)) return [word.slice(0, -3), 'not'];
    if (/'(?:re|ve|ll)$/u.test(word)) {
      const [base, suffix] = word.split("'");
      return [base, { re: 'are', ve: 'have', ll: 'will' }[suffix]];
    }
    return [/^(?:[0-9]|1[0-9]|20)$/u.test(word) ? numbers[Number(word)] : word];
  });
}
function englishUnits(text) {
  if (typeof text !== 'string' || text.length > 2000)
    throw Error('unsupported-language');
  const units = [];
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) {
      if (!/^[\p{P}\p{Z}\s]+$/u.test(part.segment))
        throw Error('unsupported-language');
      continue;
    }
    let key = part.segment.toLowerCase().replaceAll('’', "'");
    if (/^(?:[0-9]|1[0-9]|20)$/u.test(key)) key = numbers[Number(key)];
    if (!/^[a-z]+(?:'[a-z]+)*$/u.test(key)) throw Error('unsupported-language');
    units.push({
      text: part.segment,
      from: part.index,
      to: part.index + part.segment.length,
      roman: [key],
    });
  }
  if (!units.length) throw Error('unsupported-language');
  return units;
}
module.exports = { englishUnits, comparisonWords };
