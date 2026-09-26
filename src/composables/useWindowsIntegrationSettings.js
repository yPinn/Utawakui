import { computed, shallowRef } from 'vue';
import { isWindowCloseBehavior } from '../../shared/windowCloseBehaviorContract.mjs';

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

export function useWindowsIntegrationSettings(options = {}) {
  const bridge = resolveBridge(options.bridge);
  const windowCloseBehavior = shallowRef('ask');
  const preferenceBusyState = shallowRef(false);
  const preferenceErrorState = shallowRef('');
  let operationEpoch = 0;

  async function refreshPreference() {
    // A mount/retry refresh must never supersede an optimistic write and leave
    // its busy flag stuck. The write response remains authoritative.
    if (preferenceBusyState.value) return windowCloseBehavior.value;
    const epoch = ++operationEpoch;
    if (typeof bridge?.getWindowCloseBehavior !== 'function') {
      preferenceErrorState.value = '目前無法讀取關閉行為，請重新啟動後再試。';
      return windowCloseBehavior.value;
    }
    try {
      const saved = await bridge.getWindowCloseBehavior();
      if (!isWindowCloseBehavior(saved)) {
        throw new TypeError('invalid preference');
      }
      if (epoch === operationEpoch) {
        windowCloseBehavior.value = saved;
        preferenceErrorState.value = '';
      }
    } catch {
      if (epoch === operationEpoch) {
        preferenceErrorState.value = '目前無法讀取關閉行為，請重新啟動後再試。';
      }
    }
    return windowCloseBehavior.value;
  }

  async function setWindowCloseBehavior(behavior) {
    if (
      !isWindowCloseBehavior(behavior) ||
      preferenceBusyState.value ||
      typeof bridge?.setWindowCloseBehavior !== 'function'
    ) {
      return false;
    }
    const epoch = ++operationEpoch;
    const previous = windowCloseBehavior.value;
    windowCloseBehavior.value = behavior;
    preferenceBusyState.value = true;
    preferenceErrorState.value = '';
    try {
      const saved = await bridge.setWindowCloseBehavior(behavior);
      if (!isWindowCloseBehavior(saved)) {
        throw new TypeError('invalid preference');
      }
      if (epoch === operationEpoch) windowCloseBehavior.value = saved;
      return saved === behavior;
    } catch {
      if (epoch === operationEpoch) {
        windowCloseBehavior.value = previous;
        preferenceErrorState.value = '目前無法儲存關閉行為，請再試一次。';
      }
      return false;
    } finally {
      if (epoch === operationEpoch) preferenceBusyState.value = false;
    }
  }

  return {
    windowCloseBehavior,
    preferenceBusy: computed(() => preferenceBusyState.value),
    preferenceError: computed(() => preferenceErrorState.value),
    refreshPreference,
    setWindowCloseBehavior,
  };
}
