import { isWindowCloseBehavior } from '../../shared/windowCloseBehaviorContract.mjs';
import { useSettingsPreference } from './useSettingsPreference.js';
import { t } from '../utils/i18n.js';

export function useWindowsIntegrationSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'window-close-behavior',
    initialValue: 'ask',
    read: () => bridge.getWindowCloseBehavior(),
    write: (value) => bridge.setWindowCloseBehavior(value),
    validate: isWindowCloseBehavior,
    readMessage: t('windowClose.settings.readFailed'),
    saveMessage: t('windowClose.settings.saveFailed'),
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
