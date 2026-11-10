import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from '../useAppDiagnostics.js';
import { t } from '../../utils/i18n.js';

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
  errors: {},
});
let unsubscribeStatus = null;
let statusRevision = 0;
let refreshRevision = 0;

function clearFailure(operation) {
  const message = state.errors[operation];
  delete state.errors[operation];
  if (state.error === message) state.error = '';
}

function applyStatus(status) {
  state.status = status;
  if (status.observed?.lifecycle) clearFailure('refresh');
  if (status.observed?.lifecycle === 'sending') clearFailure('start');
  if (status.observed?.lifecycle === 'stopped') clearFailure('stop');
}

function publishStatus(status, expectedRevision = statusRevision) {
  if (expectedRevision !== statusRevision || !status?.observed?.lifecycle)
    return;
  statusRevision += 1;
  applyStatus(status);
}

function ensureStatusSubscription() {
  if (
    unsubscribeStatus ||
    typeof globalThis.window?.Utawakui?.onSpoutOutputStatus !== 'function'
  ) {
    return;
  }
  unsubscribeStatus =
    globalThis.window.Utawakui.onSpoutOutputStatus((status) =>
      publishStatus(status),
    ) ?? null;
}

function setFailure(error, operation, code, message) {
  state.error = message;
  state.errors[operation] = message;
  const { recordError } = useAppDiagnostics();
  recordError(error, {
    source: 'spout-output',
    operation,
    code,
    title: t('output.spout.failedTitle'),
    message,
    diagnosticMessage: `Spout output ${operation} failed`,
  });
}

export function useSpoutOutput() {
  ensureStatusSubscription();

  async function refresh() {
    const request = ++refreshRevision;
    const observed = statusRevision;
    const isCurrent = () =>
      request === refreshRevision && observed === statusRevision;
    state.isRefreshing = true;
    try {
      const status = await globalThis.window.Utawakui.getSpoutOutputStatus();
      if (!status?.observed?.lifecycle)
        throw new TypeError('invalid Spout status');
      if (isCurrent()) applyStatus(status);
      return true;
    } catch (error) {
      if (isCurrent()) {
        setFailure(
          error,
          'refresh',
          'SPOUT_OUTPUT_STATUS_FAILED',
          t('output.spout.readFailed'),
        );
      }
      return false;
    } finally {
      if (request === refreshRevision) state.isRefreshing = false;
    }
  }

  async function start() {
    if (state.isConfiguring || state.isStarting || state.isStopping) {
      return false;
    }
    state.isStarting = true;
    const request = ++statusRevision;
    try {
      publishStatus(
        await globalThis.window.Utawakui.startSpoutOutput(),
        request,
      );
      clearFailure('start');
      return true;
    } catch (error) {
      setFailure(
        error,
        'start',
        'SPOUT_OUTPUT_START_FAILED',
        t('output.spout.startFailed'),
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
    const request = ++statusRevision;
    try {
      publishStatus(
        await globalThis.window.Utawakui.stopSpoutOutput(),
        request,
      );
      clearFailure('stop');
      return true;
    } catch (error) {
      setFailure(
        error,
        'stop',
        'SPOUT_OUTPUT_STOP_FAILED',
        t('output.spout.stopFailed'),
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
    const request = ++statusRevision;
    try {
      publishStatus(
        await globalThis.window.Utawakui.setSpoutOutputFrameRateProfile(
          frameRateProfile,
        ),
        request,
      );
      clearFailure('set-frame-rate-profile');
      return true;
    } catch (error) {
      setFailure(
        error,
        'set-frame-rate-profile',
        'SPOUT_OUTPUT_CONFIGURE_FAILED',
        t('output.spout.fpsFailed'),
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
