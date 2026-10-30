import { createI18n } from 'vue-i18n';
import uiLocaleValues from '../../shared/uiLocaleValues.json';
import { UI_LOCALE } from './uiLocale.js';

// shared/locales/<locale>/<namespace>.json, precompiled by the Vite plugin.
const catalogFiles = import.meta.glob('../../shared/locales/*/*.json', {
  eager: true,
  import: 'default',
});
const messages = {};
for (const [file, catalog] of Object.entries(catalogFiles)) {
  const [, locale, namespace] = file.match(/([^/]+)\/([^/]+)\.json$/u);
  (messages[locale] ??= {})[namespace] = catalog;
}

// One global composer: the locale is fixed per launch, so modules and SSR
// tests call t() directly without installing the plugin on each app.
export const i18n = createI18n({
  legacy: false,
  locale: UI_LOCALE,
  fallbackLocale: uiLocaleValues.fallbackLocale,
  messages,
});

export const t = i18n.global.t;

// Dotted or dashed ids become camelCase keys (player.play-pause → playerPlayPause).
export function catalogKey(id) {
  return id.replace(/[.-]+(\w)/gu, (_, letter) => letter.toUpperCase());
}
