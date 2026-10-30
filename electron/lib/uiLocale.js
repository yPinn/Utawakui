'use strict';

const {
  fallbackLocale,
  supportedLocales,
} = require('../../shared/uiLocaleValues.json');

const UI_LANGUAGE_PREFERENCES = Object.freeze(['system', ...supportedLocales]);
const TRADITIONAL_CHINESE_REGIONS = new Set(['tw', 'hk', 'mo']);

// Maps an OS language tag to a supported UI locale, or null.
function matchSupportedLocale(tag, supported = supportedLocales) {
  if (typeof tag !== 'string') return null;
  const exact = supported.find(
    (locale) => locale.toLowerCase() === tag.toLowerCase(),
  );
  if (exact) return exact;
  const [language, ...rest] = tag.toLowerCase().split(/[-_]/);
  const candidate =
    language === 'zh' &&
    !rest.includes('hans') &&
    rest.some(
      (part) => part === 'hant' || TRADITIONAL_CHINESE_REGIONS.has(part),
    )
      ? 'zh-TW'
      : language === 'en'
        ? 'en-US'
        : null;
  return supported.includes(candidate) ? candidate : null;
}

function resolveUiLocale(
  preference,
  systemLanguages = [],
  supported = supportedLocales,
) {
  if (preference !== 'system' && supported.includes(preference)) {
    return preference;
  }
  for (const tag of Array.isArray(systemLanguages) ? systemLanguages : []) {
    const locale = matchSupportedLocale(tag, supported);
    if (locale) return locale;
  }
  return fallbackLocale;
}

// Resolved once before app ready; the UI language changes only on relaunch.
let currentUiLocale = fallbackLocale;

function setUiLocale(locale) {
  currentUiLocale = supportedLocales.includes(locale) ? locale : fallbackLocale;
}

function getUiLocale() {
  return currentUiLocale;
}

module.exports = {
  UI_LANGUAGE_PREFERENCES,
  getUiLocale,
  matchSupportedLocale,
  resolveUiLocale,
  setUiLocale,
};
