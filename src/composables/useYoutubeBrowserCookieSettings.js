import { useSettingsPreference } from './useSettingsPreference.js';
import { t } from '../utils/i18n.js';

export function useYoutubeBrowserCookieSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'youtube-browser-cookies',
    initialValue: false,
    read: () => bridge.getYoutubeBrowserCookies(),
    write: (value) => bridge.setYoutubeBrowserCookies(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: t('capabilities.cookies.readFailed'),
    saveMessage: t('capabilities.cookies.saveFailed'),
  });
  return {
    allowBrowserCookies: preference.value,
    preferenceBusy: preference.busy,
    preferenceReading: preference.reading,
    preferenceLoaded: preference.loaded,
    preferenceReadError: preference.readError,
    preferenceSaveError: preference.saveError,
    refreshPreference: preference.refresh,
    setAllowBrowserCookies: preference.save,
  };
}
