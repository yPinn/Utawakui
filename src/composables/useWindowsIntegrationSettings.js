import { isWindowCloseBehavior } from '../../shared/windowCloseBehaviorContract.mjs';
import { useSettingsPreference } from './useSettingsPreference.js';

export function useWindowsIntegrationSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'window-close-behavior',
    initialValue: 'ask',
    read: () => bridge.getWindowCloseBehavior(),
    write: (value) => bridge.setWindowCloseBehavior(value),
    validate: isWindowCloseBehavior,
    readMessage: '目前無法讀取關閉行為，請重新讀取。',
    saveMessage: '目前無法儲存關閉行為，已恢復原設定。',
  });
  return {
    windowCloseBehavior: preference.value,
    preferenceBusy: preference.busy,
    preferenceReading: preference.reading,
    preferenceLoaded: preference.loaded,
    preferenceReadError: preference.readError,
    preferenceSaveError: preference.saveError,
    preferenceError: preference.error,
    refreshPreference: preference.refresh,
    setWindowCloseBehavior: preference.save,
  };
}
