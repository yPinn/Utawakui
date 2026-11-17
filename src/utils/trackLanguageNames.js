import { t } from './i18n.js';
import { UI_LOCALE } from './uiLocale.js';

// Broad sung-language groups, in display order; mirrors electron/lib/library/trackLanguages.js.
export const TRACK_LANGUAGE_OPTIONS = Object.freeze([
  'zh',
  'ja',
  'ko',
  'en',
  'other',
  'zxx',
]);

export function trackLanguageName(code) {
  return TRACK_LANGUAGE_OPTIONS.includes(code)
    ? t(`trackLanguage.names.${code}`)
    : code;
}

export function formatTrackLanguages(codes) {
  const names = codes.map(trackLanguageName);
  try {
    return new Intl.ListFormat([UI_LOCALE], { type: 'conjunction' }).format(
      names,
    );
  } catch {
    return names.join(', ');
  }
}
