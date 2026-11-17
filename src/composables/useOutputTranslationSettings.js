import translationValues from '../../shared/lyricsTranslationValues.json';
import { useSettingsPreference } from './useSettingsPreference.js';
import { translationLanguageLabels } from './useLyricsTranslations.js';
import { t } from '../utils/i18n.js';

// Which saved lyrics translation OBS viewers see; applies live.
export function useOutputTranslationSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'output-translation',
    initialValue: 'output',
    read: () => bridge.getOutputTranslation(),
    write: (value) => bridge.setOutputTranslation(value),
    validate: (value) => translationValues.outputPreferences.includes(value),
    readMessage: t('settings.outputTranslation.readFailed'),
    saveMessage: t('settings.outputTranslation.saveFailed'),
  });
  const items = Object.freeze([
    { value: 'output', label: t('settings.outputTranslation.output') },
    { value: 'off', label: t('settings.outputTranslation.off') },
    ...translationValues.languages.map((language) => ({
      value: language,
      label: translationLanguageLabels[language](),
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
