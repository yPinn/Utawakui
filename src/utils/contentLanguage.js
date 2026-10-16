import JP_SHINJITAI from 'opencc-js/dict/JPShinjitaiCharacters';
import ST_CHARACTERS from 'opencc-js/dict/STCharacters';
import TS_CHARACTERS from 'opencc-js/dict/TSCharacters';
import { detectLyricsScript } from './lyrics.js';

// The document default; content in it needs no lang attribute.
export const DEFAULT_CONTENT_LANGUAGE = 'zh-Hant';

const CACHE_LIMIT = 4000;
const cache = new Map();
let charSets = null;

function parseDictionary(source) {
  return source.split('|').map((row) => row.split(' '));
}

// Derived once from OpenCC's raw character tables, so nothing is hand-kept.
function buildCharSets() {
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

// The katakana middle dot also separates Chinese names and dates (2024 夏・台北),
// so it is punctuation here, never evidence of Japanese.
const NEUTRAL_KANA_BLOCK_MARKS = /・/gu;

function detect(value) {
  const text = value.replace(NEUTRAL_KANA_BLOCK_MARKS, ' ');
  const script = detectLyricsScript(text);
  if (script === 'ja' || script === 'ko') return script;
  if (script !== 'zh') return null;
  charSets ??= buildCharSets();
  let simplified = 0;
  let traditional = 0;
  for (const char of text) {
    if (charSets.japaneseOnly.has(char)) return 'ja';
    if (charSets.simplifiedOnly.has(char)) simplified += 1;
    else if (charSets.traditionalOnly.has(char)) traditional += 1;
  }
  return simplified > traditional ? 'zh-Hans' : DEFAULT_CONTENT_LANGUAGE;
}

/**
 * Language of user content, judged once across related fields (title, artist,
 * album) so one field's kana or simplified form decides the whole entity.
 * Returns null for text without CJK script.
 */
export function detectContentLanguage(...fields) {
  const text = fields
    .filter((field) => typeof field === 'string' && field)
    .join('\n');
  if (!text) return null;
  if (cache.has(text)) return cache.get(text);
  const language = detect(text);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, language);
  return language;
}

// Bindable `lang` value: undefined keeps the document language.
export function contentLangAttribute(...fields) {
  const language = detectContentLanguage(...fields);
  return language && language !== DEFAULT_CONTENT_LANGUAGE
    ? language
    : undefined;
}

export function trackContentLang(track) {
  return contentLangAttribute(track?.title, track?.artist, track?.album);
}
