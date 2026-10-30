import uiLocaleValues from '../../shared/uiLocaleValues.json';

const { fallbackLocale, supportedLocales } = uiLocaleValues;

function initialUiLocale() {
  const bridge = globalThis.Utawakui ?? globalThis.UtawakuiPerformer;
  const locale = bridge?.initialUiLocale;
  return supportedLocales.includes(locale) ? locale : fallbackLocale;
}

// Fixed per launch by main; collation and formatting follow it, not the OS.
export const UI_LOCALE = initialUiLocale();
