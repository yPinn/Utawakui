import { detectLyricsScript } from './lyrics.js';
import {
  JAPANESE_ONLY,
  SIMPLIFIED_ONLY,
  TRADITIONAL_ONLY,
} from './contentLanguageCharSets.js';

// The document default; content in it needs no lang attribute.
export const DEFAULT_CONTENT_LANGUAGE = 'zh-Hant';

const CACHE_LIMIT = 4000;
const cache = new Map();
let charSets = null;

// The katakana middle dot also separates Chinese names and dates (2024 夏・台北),
// so it is punctuation here, never evidence of Japanese.
const NEUTRAL_KANA_BLOCK_MARKS = /・/gu;

function detect(value) {
  const text = value.replace(NEUTRAL_KANA_BLOCK_MARKS, ' ');
  const script = detectLyricsScript(text);
  if (script === 'ja' || script === 'ko') return script;
  if (script !== 'zh') return null;
  charSets ??= {
    japaneseOnly: new Set(JAPANESE_ONLY),
    simplifiedOnly: new Set(SIMPLIFIED_ONLY),
    traditionalOnly: new Set(TRADITIONAL_ONLY),
  };
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
