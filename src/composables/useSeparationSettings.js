import { useSettingsPreference } from './useSettingsPreference.js';

export function useSeparationSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'separation-gpu-acceleration',
    initialValue: true,
    read: () => bridge.getSeparationGpuAcceleration(),
    write: (value) => bridge.setSeparationGpuAcceleration(value),
    validate: (value) => typeof value === 'boolean',
    readMessage: '目前無法讀取 GPU 加速設定，請重新讀取。',
    saveMessage: '目前無法儲存 GPU 加速設定，已恢復原設定。',
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
