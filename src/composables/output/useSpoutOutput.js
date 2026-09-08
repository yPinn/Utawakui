import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from '../useAppDiagnostics.js';

const FRAME_RATE_PROFILES = new Set(['reduced', 'standard']);

const state = reactive({
  status: {
    supported: true,
    desired: { running: false, frameRateProfile: 'standard' },
    observed: { lifecycle: 'stopped' },
    effective: { surface: null },
    error: null,
  },
  isRefreshing: false,
  isConfiguring: false,
  isStarting: false,
  isStopping: false,
  error: '',
});
let unsubscribeStatus = null;

function applyStatus(status) {
  if (!status || typeof status !== 'object') return;
  state.status = status;
}

function ensureStatusSubscription() {
  if (
    unsubscribeStatus ||
    typeof globalThis.window?.Utawakui?.onSpoutOutputStatus !== 'function'
  ) {
    return;
  }
  unsubscribeStatus =
    globalThis.window.Utawakui.onSpoutOutputStatus(applyStatus) ?? null;
}

function setFailure(error, operation, code, message) {
  state.error = message;
  const { recordError } = useAppDiagnostics();
  recordError(error, {
    source: 'spout-output',
    operation,
    code,
    title: 'Spout2 輸出未完成',
    message,
    diagnosticMessage: `Spout output ${operation} failed`,
  });
}

export function useSpoutOutput() {
  ensureStatusSubscription();

  async function refresh() {
    state.isRefreshing = true;
    try {
      state.status = await globalThis.window.Utawakui.getSpoutOutputStatus();
      state.error = '';
      return true;
    } catch (error) {
      setFailure(
        error,
        'refresh',
        'SPOUT_OUTPUT_STATUS_FAILED',
        '無法讀取 Spout2 sender 狀態。',
      );
      return false;
    } finally {
      state.isRefreshing = false;
    }
  }

  async function start() {
    if (state.isConfiguring || state.isStarting || state.isStopping) {
      return false;
    }
    state.isStarting = true;
    state.error = '';
    try {
      state.status = await globalThis.window.Utawakui.startSpoutOutput();
      return true;
    } catch (error) {
      setFailure(
        error,
        'start',
        'SPOUT_OUTPUT_START_FAILED',
        'Spout2 sender 未啟動，請再試一次。',
      );
      return false;
    } finally {
      state.isStarting = false;
    }
  }

  async function stop() {
    if (state.isConfiguring || state.isStarting || state.isStopping) {
      return false;
    }
    state.isStopping = true;
    state.error = '';
    try {
      state.status = await globalThis.window.Utawakui.stopSpoutOutput();
      return true;
    } catch (error) {
      setFailure(
        error,
        'stop',
        'SPOUT_OUTPUT_STOP_FAILED',
        'Spout2 sender 未停止，請再試一次。',
      );
      return false;
    } finally {
      state.isStopping = false;
    }
  }

  async function setFrameRateProfile(frameRateProfile) {
    if (
      !FRAME_RATE_PROFILES.has(frameRateProfile) ||
      state.isConfiguring ||
      state.isStarting ||
      state.isStopping
    ) {
      return false;
    }
    state.isConfiguring = true;
    state.error = '';
    try {
      state.status =
        await globalThis.window.Utawakui.setSpoutOutputFrameRateProfile(
          frameRateProfile,
        );
      return true;
    } catch (error) {
      setFailure(
        error,
        'set-frame-rate-profile',
        'SPOUT_OUTPUT_CONFIGURE_FAILED',
        'Spout2 幀率未更新。',
      );
      return false;
    } finally {
      state.isConfiguring = false;
    }
  }

  return {
    state: readonly(state),
    refresh,
    setFrameRateProfile,
    start,
    stop,
  };
}
