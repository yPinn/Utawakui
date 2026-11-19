import uiLocaleValues from '../../shared/uiLocaleValues.json';
import { PSEUDO_LOCALE } from '../../shared/pseudoLocale.mjs';

const { fallbackLocale, supportedLocales } = uiLocaleValues;

function initialUiLocale() {
  if (
    globalThis.document?.documentElement?.dataset.uiLocaleSource === 'browser'
  ) {
    const language = globalThis.navigator?.language?.toLowerCase() ?? '';
    return language.startsWith('zh') ? 'zh-TW' : 'en-US';
  }
  const bridge = globalThis.Utawakui ?? globalThis.UtawakuiPerformer;
  const locale = bridge?.initialUiLocale;
  if (import.meta.env.DEV && locale === PSEUDO_LOCALE) return locale;
  return supportedLocales.includes(locale) ? locale : fallbackLocale;
}

// Fixed per launch by main, or derived once from the phone browser.
export const UI_LOCALE = initialUiLocale();
