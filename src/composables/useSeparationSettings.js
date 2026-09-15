import { computed, reactive, shallowRef } from 'vue';

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

// Preference-only, unlike useMusicAnalysisSettings.js — there is no
// install/repair/remove lifecycle here: DirectML.dll always ships with
// onnxruntime-node, so this is just a persisted boolean intent (see ADR
// 0017's amendment). Main still owns the actual DirectML-then-CPU-fallback
// logic in vocalSeparation.js regardless of this value.
export function useSeparationSettings(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const gpuAcceleration = shallowRef(true);
  const state = reactive({
    preferenceBusy: false,
    preferenceError: '',
  });

  async function refreshPreference() {
    if (typeof bridge?.getSeparationGpuAcceleration !== 'function') {
      state.preferenceError = '目前無法讀取 GPU 加速設定，請重新啟動後再試。';
      return gpuAcceleration.value;
    }
    try {
      gpuAcceleration.value =
        (await bridge.getSeparationGpuAcceleration()) !== false;
      state.preferenceError = '';
    } catch {
      state.preferenceError = '目前無法讀取 GPU 加速設定，請重新啟動後再試。';
    }
    return gpuAcceleration.value;
  }

  async function setGpuAcceleration(enabled) {
    if (
      typeof enabled !== 'boolean' ||
      state.preferenceBusy ||
      typeof bridge?.setSeparationGpuAcceleration !== 'function'
    ) {
      return false;
    }
    const previous = gpuAcceleration.value;
    gpuAcceleration.value = enabled;
    state.preferenceBusy = true;
    state.preferenceError = '';
    try {
      gpuAcceleration.value =
        (await bridge.setSeparationGpuAcceleration(enabled)) === true;
      return true;
    } catch {
      gpuAcceleration.value = previous;
      state.preferenceError = '目前無法儲存 GPU 加速設定，請再試一次。';
      return false;
    } finally {
      state.preferenceBusy = false;
    }
  }

  return {
    gpuAcceleration,
    preferenceBusy: computed(() => state.preferenceBusy),
    preferenceError: computed(() => state.preferenceError),
    refreshPreference,
    setGpuAcceleration,
  };
}
