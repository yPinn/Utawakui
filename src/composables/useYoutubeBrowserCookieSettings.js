import { useSettingsPreference } from './useSettingsPreference.js';

export function useYoutubeBrowserCookieSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'youtube-browser-cookies',
    initialValue: false,
    read: () => bridge.getYoutubeBrowserCookies(),
    write: (value) => bridge.setYoutubeBrowserCookies(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: '目前無法讀取登入資料設定，請重新讀取。',
    saveMessage: '目前無法儲存登入資料設定，已恢復原設定。',
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
