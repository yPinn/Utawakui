import { useSettingsPreference } from './useSettingsPreference.js';
import { t } from '../utils/i18n.js';

export function useSeparationSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'separation-gpu-acceleration',
    initialValue: true,
    read: () => bridge.getSeparationGpuAcceleration(),
    write: (value) => bridge.setSeparationGpuAcceleration(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: t('capabilities.gpu.readFailed'),
    saveMessage: t('capabilities.gpu.saveFailed'),
  });
  // Shared by key, so Settings and the Import dock show one value.
  const autoSeparation = useSettingsPreference({
    scope: bridge,
    key: 'auto-separation',
    initialValue: false,
    read: () => bridge.getAutoSeparation(),
    write: (value) => bridge.setAutoSeparation(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: t('capabilities.autoSeparation.readFailed'),
    saveMessage: t('capabilities.autoSeparation.saveFailed'),
  });
  return {
    gpuAcceleration: preference.value,
    preferenceBusy: preference.busy,
    preferenceReading: preference.reading,
    preferenceLoaded: preference.loaded,
    preferenceReadError: preference.readError,
    preferenceSaveError: preference.saveError,
    preferenceError: preference.error,
    refreshPreference: preference.refresh,
    setGpuAcceleration: preference.save,
    autoSeparate: autoSeparation.value,
    autoSeparationBusy: autoSeparation.busy,
    autoSeparationReading: autoSeparation.reading,
    autoSeparationLoaded: autoSeparation.loaded,
    autoSeparationReadError: autoSeparation.readError,
    autoSeparationSaveError: autoSeparation.saveError,
    refreshAutoSeparation: autoSeparation.refresh,
    setAutoSeparate: autoSeparation.save,
  };
}
