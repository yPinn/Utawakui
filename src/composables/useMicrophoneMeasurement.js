import { computed, onScopeDispose, readonly, shallowRef, watch } from 'vue';
import { createMicrophoneMeasurement } from '../microphone/measurement.js';

export function useMicrophoneMeasurement(input) {
  const state = shallowRef(null);
  const owner = createMicrophoneMeasurement({
    publish: (next) => {
      state.value = next;
    },
  });
  const busy = computed(() =>
    ['countdown', 'measuring'].includes(state.value.phase),
  );
  const tick = () => owner.observe(input.value, performance.now());
  const timer = setInterval(tick, 100);
  watch(
    [
      () => input.value.status,
      () => input.value.selectedDeviceId,
      () => input.value.controls,
      () => input.value.inputOptions,
      () => input.value.activityOptions,
      () => input.value.settings,
    ],
    tick,
    { flush: 'sync' },
  );
  const visibilityChanged = () => {
    if (document.hidden && busy.value)
      owner.cancel('視窗已隱藏，這次量測取消，請重測。');
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  onScopeDispose(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibilityChanged);
    owner.cancel();
  });
  return {
    state: readonly(state),
    busy,
    begin: (id) => owner.begin(id, input.value, performance.now()),
    cancel: () => owner.cancel(),
    clear: owner.clear,
    applyCalibration(apply) {
      if (busy.value || typeof apply !== 'function') return false;
      if (apply(state.value.results) !== true) return false;
      owner.clear();
      return true;
    },
  };
}
