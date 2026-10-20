'use strict';

const ANALYSIS_LANGUAGES = Object.freeze(['auto', 'zh', 'ja', 'en']);
const SKIP_REASONS = Object.freeze([
  'lyrics-missing',
  'language-unknown',
  'language-unsupported',
  'native-t2',
  'untimed-lyrics',
  'unsupported-lyrics',
  'source-changed',
]);
function isAnalysisLanguage(value) {
  return ANALYSIS_LANGUAGES.includes(value);
}
function resolveAnalysisLanguage(metadata, text, requested = 'auto') {
  if (!isAnalysisLanguage(requested)) throw Error('invalid analysis language');
  if (requested !== 'auto') return { language: requested, origin: 'manual' };
  const base = String(metadata ?? '')
    .toLowerCase()
    .split(/[-_]/u)[0];
  if (base === 'zh' || base === 'ja' || base === 'en')
    return { language: base, origin: 'metadata' };
  if (/^[a-z]{2,3}$/u.test(base) && !['und', 'mul'].includes(base))
    return { reason: 'language-unsupported' };
  // Count lyric body only, never provider labels, filenames, titles or timestamps.
  const value = String(text ?? '');
  const count = (pattern) => (value.match(pattern) ?? []).length;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  const hangul = count(/\p{Script=Hangul}/gu);
  const latin = count(/\p{Script=Latin}/gu);
  if (hangul >= 4 && hangul >= kana) return { reason: 'language-unsupported' };
  if (
    hangul === 0 &&
    kana >= 4 &&
    kana / Math.max(1, kana + han + latin) >= 0.05
  )
    return { language: 'ja', origin: 'content' };
  // Han alone is ambiguous. Require substantial Chinese grammatical evidence too.
  const markers = count(/[的了是在我你他她們这這着著没沒把與与嗎吗為为]/gu);
  if (kana === 0 && hangul === 0 && han >= 12 && markers >= 3 && han >= latin)
    return { language: 'zh', origin: 'content' };
  if (
    kana === 0 &&
    han === 0 &&
    hangul === 0 &&
    latin >= 24 &&
    count(/\p{L}/gu) === latin
  ) {
    const words = value.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/gu) ?? [];
    const markers = new Set(
      words.filter((w) =>
        [
          'i',
          'you',
          'the',
          'and',
          'will',
          'not',
          'your',
          'with',
          'are',
          'have',
          'my',
          'never',
        ].includes(w),
      ),
    );
    if (words.length >= 8 && markers.size >= 4)
      return { language: 'en', origin: 'content' };
  }
  return { reason: 'language-unknown' };
}
module.exports = { isAnalysisLanguage, resolveAnalysisLanguage, SKIP_REASONS };
