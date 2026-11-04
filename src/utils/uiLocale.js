import uiLocaleValues from '../../shared/uiLocaleValues.json';
import { PSEUDO_LOCALE } from '../../shared/pseudoLocale.mjs';

const { fallbackLocale, supportedLocales } = uiLocaleValues;

function initialUiLocale() {
  const bridge = globalThis.Utawakui ?? globalThis.UtawakuiPerformer;
  const locale = bridge?.initialUiLocale;
  if (import.meta.env.DEV && locale === PSEUDO_LOCALE) return locale;
  return supportedLocales.includes(locale) ? locale : fallbackLocale;
}

// Fixed per launch by main; collation and formatting follow it, not the OS.
export const UI_LOCALE = initialUiLocale();
