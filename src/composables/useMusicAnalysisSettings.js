import { computed, reactive, shallowRef } from 'vue';
import { useMusicAnalysisCapability } from './analysis/useMusicAnalysisCapability.js';

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

export function useMusicAnalysisSettings(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const capability = shallowRef(null);
  const autoAnalyze = shallowRef(true);
  const state = reactive({
    capabilityProgress: null,
    capabilityBusy: false,
    capabilityError: '',
    preferenceBusy: false,
    preferenceError: '',
  });
  const capabilityOwner = useMusicAnalysisCapability({
    state,
    capability,
    bridge,
  });
  let initialized = false;

  async function refreshPreference() {
    if (typeof bridge?.getAutoMusicAnalysis !== 'function') {
      state.preferenceError = '目前無法讀取自動分析設定，請重新啟動後再試。';
      return autoAnalyze.value;
    }
    try {
      autoAnalyze.value = (await bridge.getAutoMusicAnalysis()) !== false;
      state.preferenceError = '';
    } catch {
      state.preferenceError = '目前無法讀取自動分析設定，請重新啟動後再試。';
    }
    return autoAnalyze.value;
  }

  async function initialize() {
    if (!initialized) {
      initialized = true;
      capabilityOwner.subscribeProgress();
    }
    await Promise.all([capabilityOwner.refreshStatus(), refreshPreference()]);
  }

  async function setAutoAnalyze(enabled) {
    if (
      typeof enabled !== 'boolean' ||
      state.preferenceBusy ||
      typeof bridge?.setAutoMusicAnalysis !== 'function'
    ) {
      return false;
    }
    const previous = autoAnalyze.value;
    autoAnalyze.value = enabled;
    state.preferenceBusy = true;
    state.preferenceError = '';
    try {
      autoAnalyze.value = (await bridge.setAutoMusicAnalysis(enabled)) === true;
      return true;
    } catch {
      autoAnalyze.value = previous;
      state.preferenceError = '目前無法儲存自動分析設定，請再試一次。';
      return false;
    } finally {
      state.preferenceBusy = false;
    }
  }

  return {
    capability,
    autoAnalyze,
    capabilityBusy: capabilityOwner.busy,
    capabilityError: computed(() => state.capabilityError),
    preferenceBusy: computed(() => state.preferenceBusy),
    preferenceError: computed(() => state.preferenceError),
    progressPercent: capabilityOwner.progressPercent,
    stageLabel: capabilityOwner.stageLabel,
    initialize,
    setAutoAnalyze,
    prepare: capabilityOwner.prepare,
    repair: capabilityOwner.repair,
    remove: capabilityOwner.remove,
    dispose: capabilityOwner.dispose,
  };
}
