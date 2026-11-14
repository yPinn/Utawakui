import { normalizeMicrophoneInputOptions } from '../../microphone/inputProcessing.js';

const STORAGE_KEY = 'utawakui.prompter.sing-along';

export function normalizeSingAlongPreferences(value) {
  const mic = value?.microphone;
  const { gainDb, highPassHz, noiseSuppression } =
    normalizeMicrophoneInputOptions(mic);
  const offset = value?.correctionMs;
  return {
    microphone: {
      enabled: mic?.enabled !== false,
      deviceId:
        typeof mic?.deviceId === 'string' && mic.deviceId.length <= 512
          ? mic.deviceId
          : '',
      gainDb,
      highPassHz,
      noiseSuppression,
    },
    // Match the 10 ms slider step.
    correctionMs: Number.isFinite(offset)
      ? Math.max(-500, Math.min(500, Math.round(offset / 10) * 10)) || 0
      : 0,
    showMeter: value?.showMeter !== false,
    showLevelHistory: value?.showLevelHistory !== false,
    showReferencePitch: value?.showReferencePitch !== false,
  };
}

export function loadSingAlongPreferences() {
  try {
    return normalizeSingAlongPreferences(
      JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return normalizeSingAlongPreferences(null);
  }
}

export function saveSingAlongPreferences(value) {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeSingAlongPreferences(value)),
    );
  } catch {
    // Keep the current session usable when local storage is unavailable.
  }
}
