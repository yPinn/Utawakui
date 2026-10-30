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
  };
}
