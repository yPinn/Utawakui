import JP_SHINJITAI from 'opencc-js/dict/JPShinjitaiCharacters';
import ST_CHARACTERS from 'opencc-js/dict/STCharacters';
import TS_CHARACTERS from 'opencc-js/dict/TSCharacters';

// Build-time only: scripts/generate-content-language-charsets.mjs turns this
// into contentLanguageCharSets.js so the renderer ships no OpenCC tables.
function parseDictionary(source) {
  return source.split('|').map((row) => row.split(' '));
}

// Derived once from OpenCC's raw character tables, so nothing is hand-kept.
export function buildCharSets() {
  const st = parseDictionary(ST_CHARACTERS);
  const ts = parseDictionary(TS_CHARACTERS);
  const jp = parseDictionary(JP_SHINJITAI);
  const simplifiedKeys = new Set(st.map(([key]) => key));
  const traditionalKeys = new Set(ts.map(([key]) => key));
  const shinjitai = new Set(
    jp.filter(([key, ...forms]) => !forms.includes(key)).map(([key]) => key),
  );
  const isUnique = (keys) => (row) =>
    !row.slice(1).includes(row[0]) && !keys.has(row[0]);
  return {
    // Shinjitai never used in Chinese text (e.g. 桜 広 駅).
    japaneseOnly: new Set(
      [...shinjitai].filter(
        (char) => !simplifiedKeys.has(char) && !traditionalKeys.has(char),
      ),
    ),
    // Shinjitai identical to a simplified form (e.g. 国 会 学) is no evidence.
    simplifiedOnly: new Set(
      st
        .filter(isUnique(traditionalKeys))
        .map(([key]) => key)
        .filter((char) => !shinjitai.has(char)),
    ),
    traditionalOnly: new Set(
      ts.filter(isUnique(simplifiedKeys)).map(([key]) => key),
    ),
  };
}
