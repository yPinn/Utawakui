import { computed, onMounted, onUnmounted, reactive, shallowRef } from 'vue';
import { nextLyricsBoundaryDelayMs } from '../../overlay/shared/state.mjs';
import { selectPerformerFrame } from '../utils/performerView.js';

export function usePerformerViewState() {
  const snapshot = shallowRef(null);
  const clockNow = shallowRef(Date.now());
  const windowState = reactive({
    open: true,
    fullScreen: false,
    alwaysOnTop: false,
  });
  const error = shallowRef('');

  let boundaryTimer = null;
  let unsubscribeSnapshot = null;
  let unsubscribeWindowState = null;

  const frame = computed(() =>
    selectPerformerFrame(snapshot.value, { nowMs: clockNow.value }),
  );

  function bridgeMethod(name) {
    const method = window.UtawakuiPerformer?.[name];
    if (typeof method !== 'function') {
      throw new Error('表演者畫面橋接 API 尚未載入。');
    }
    return method;
  }

  function applyWindowState(value = {}) {
    windowState.open = value.open !== false;
    windowState.fullScreen = value.fullScreen === true;
    windowState.alwaysOnTop = value.alwaysOnTop === true;
  }

  function scheduleBoundary() {
    clearTimeout(boundaryTimer);
    boundaryTimer = null;
    const state = snapshot.value?.state;
    if (!state) return;
    const nowMs = Date.now();
    const delay = nextLyricsBoundaryDelayMs(state, { nowMs });
    if (delay === null) return;
    boundaryTimer = setTimeout(() => {
      clockNow.value = Date.now();
      scheduleBoundary();
    }, delay + 1);
  }

  function applySnapshot(value) {
    const nextRevision = value?.state?.revision;
    const currentRevision = snapshot.value?.state?.revision;
    if (
      Number.isSafeInteger(currentRevision) &&
      Number.isSafeInteger(nextRevision) &&
      nextRevision < currentRevision
    ) {
      return;
    }
    snapshot.value = value;
    clockNow.value = Date.now();
    scheduleBoundary();
  }

  async function runWindowCommand(name) {
    try {
      applyWindowState(await bridgeMethod(name)());
      error.value = '';
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  onMounted(async () => {
    try {
      unsubscribeSnapshot = bridgeMethod('onSnapshot')(applySnapshot);
      unsubscribeWindowState = bridgeMethod('onWindowState')(applyWindowState);
      applySnapshot(await bridgeMethod('getSnapshot')());
      applyWindowState(await bridgeMethod('getWindowState')());
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  });

  onUnmounted(() => {
    clearTimeout(boundaryTimer);
    unsubscribeSnapshot?.();
    unsubscribeWindowState?.();
  });

  return {
    error,
    frame,
    windowState,
    close: () => runWindowCommand('close'),
    minimize: () => runWindowCommand('minimize'),
    toggleAlwaysOnTop: () => runWindowCommand('toggleAlwaysOnTop'),
    toggleFullScreen: () => runWindowCommand('toggleFullScreen'),
  };
}
