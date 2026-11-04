import uiLocaleValues from '../../shared/uiLocaleValues.json';
import { useSettingsPreference } from './useSettingsPreference.js';
import { uiLanguageName } from './useUiLanguageSettings.js';
import { t } from '../utils/i18n.js';

const PREFERENCES = Object.freeze(['ui', ...uiLocaleValues.supportedLocales]);

// Text OBS viewers see; main pushes a change to live overlays right away.
export function useOutputLanguageSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'output-language',
    initialValue: 'ui',
    read: () => bridge.getOutputLanguage(),
    write: (value) => bridge.setOutputLanguage(value),
    validate: (value) => PREFERENCES.includes(value),
    readMessage: t('settings.outputLanguage.readFailed'),
    saveMessage: t('settings.outputLanguage.saveFailed'),
  });
  const items = Object.freeze([
    { value: 'ui', label: t('settings.outputLanguage.ui') },
    ...uiLocaleValues.supportedLocales.map((locale) => ({
      value: locale,
      label: uiLanguageName(locale),
    })),
  ]);
  return {
    preference: preference.value,
    loaded: preference.loaded,
    reading: preference.reading,
    busy: preference.busy,
    readError: preference.readError,
    saveError: preference.saveError,
    items,
    refresh: preference.refresh,
    setPreference: preference.save,
  };
}
