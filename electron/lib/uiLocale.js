'use strict';

const {
  fallbackLocale,
  supportedLocales,
} = require('../../shared/uiLocaleValues.json');
const { PSEUDO_LOCALE } = require('../../shared/pseudoLocale.mjs');

const UI_LANGUAGE_PREFERENCES = Object.freeze(['system', ...supportedLocales]);
// 'ui' follows the UI language; Output can be set apart for viewers.
const OUTPUT_LANGUAGE_PREFERENCES = Object.freeze(['ui', ...supportedLocales]);
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

function setUiLocale(locale, { allowPseudo = false } = {}) {
  const allowed =
    supportedLocales.includes(locale) ||
    (allowPseudo && locale === PSEUDO_LOCALE);
  currentUiLocale = allowed ? locale : fallbackLocale;
}

function getUiLocale() {
  return currentUiLocale;
}

// The pseudo locale is a dev aid for the control panel; OBS gets English.
function resolveOutputLocale(preference, uiLocale = currentUiLocale) {
  if (supportedLocales.includes(preference)) return preference;
  if (supportedLocales.includes(uiLocale)) return uiLocale;
  return uiLocale === PSEUDO_LOCALE ? 'en-US' : fallbackLocale;
}

module.exports = {
  OUTPUT_LANGUAGE_PREFERENCES,
  UI_LANGUAGE_PREFERENCES,
  getUiLocale,
  matchSupportedLocale,
  resolveOutputLocale,
  resolveUiLocale,
  setUiLocale,
};
