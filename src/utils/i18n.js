import { createI18n } from 'vue-i18n';
import uiLocaleValues from '../../shared/uiLocaleValues.json';
import zhTW from '../../shared/locales/zh-TW.json';
import enUS from '../../shared/locales/en-US.json';
import { UI_LOCALE } from './uiLocale.js';

// One global composer: the locale is fixed per launch, so modules and SSR
// tests call t() directly without installing the plugin on each app.
export const i18n = createI18n({
  legacy: false,
  locale: UI_LOCALE,
  fallbackLocale: uiLocaleValues.fallbackLocale,
  messages: { 'zh-TW': zhTW, 'en-US': enUS },
});

export const t = i18n.global.t;
