import { computed, reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const { recordError } = useAppDiagnostics();

const PHASES = new Set([
  'disabled',
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
]);

const state = reactive({
  enabled: false,
  phase: 'disabled',
  currentVersion: '',
  availableVersion: null,
  progress: null,
  downloadBytesPerSecond: null,
  downloadEtaSeconds: null,
  releaseDate: null,
  error: null,
  autoCheckEnabled: true,
  autoCheckBusy: false,
  autoCheckError: null,
});

// True whenever the user has something to act on — drives the passive
// navigation indicator, which must stay lit through the download and until the
// update is actually installed.
const updateReady = computed(
  () => state.phase === 'available' || state.phase === 'downloaded',
);

let unsubscribe = null;

function hasBridge(method) {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.[method] === 'function'
  );
}

function applyStatus(status) {
  if (!status || !PHASES.has(status.phase)) return;
  state.enabled = status.enabled === true;
  state.phase = status.phase;
  state.currentVersion =
    typeof status.currentVersion === 'string' ? status.currentVersion : '';
  state.availableVersion =
    typeof status.availableVersion === 'string'
      ? status.availableVersion
      : null;
  state.progress = Number.isFinite(status.progress) ? status.progress : null;
  state.downloadBytesPerSecond = Number.isFinite(status.downloadBytesPerSecond)
    ? status.downloadBytesPerSecond
    : null;
  state.downloadEtaSeconds = Number.isFinite(status.downloadEtaSeconds)
    ? status.downloadEtaSeconds
    : null;
  state.releaseDate =
    typeof status.releaseDate === 'string' ? status.releaseDate : null;
  state.error =
    typeof status.error === 'string' && status.error
      ? '更新失敗，請再試一次。'
      : null;
}

function ensureSubscription() {
  if (unsubscribe || !hasBridge('onAppUpdateStatus')) return;
  unsubscribe = window.Utawakui.onAppUpdateStatus(applyStatus);
}

async function invoke(method) {
  ensureSubscription();
  if (!hasBridge(method)) {
    state.error = '請重新啟動 Utawakui 後再試。';
    return;
  }
  try {
    applyStatus(await window.Utawakui[method]());
  } catch (error) {
    state.error = recordError(error, {
      code: 'APP_UPDATE_ACTION_FAILED',
      title: '更新失敗',
      message: '更新失敗，請再試一次。',
      source: 'app-update',
      operation: method,
    }).message;
  }
}

function refreshAppUpdateStatus() {
  return invoke('getAppUpdateStatus');
}

function checkForAppUpdate() {
  return invoke('checkForAppUpdate');
}

function downloadAppUpdate() {
  return invoke('downloadAppUpdate');
}

function installAppUpdate() {
  return invoke('installAppUpdate');
}

async function refreshAppUpdateAutoCheck() {
  if (!hasBridge('getAppUpdateAutoCheck')) return state.autoCheckEnabled;
  try {
    state.autoCheckEnabled =
      (await window.Utawakui.getAppUpdateAutoCheck()) !== false;
    state.autoCheckError = null;
  } catch {
    state.autoCheckError = '無法讀取自動檢查設定。請重新啟動後再試。';
  }
  return state.autoCheckEnabled;
}

async function setAppUpdateAutoCheck(enabled) {
  if (
    typeof enabled !== 'boolean' ||
    state.autoCheckBusy ||
    !hasBridge('setAppUpdateAutoCheck')
  ) {
    return false;
  }
  const previous = state.autoCheckEnabled;
  state.autoCheckEnabled = enabled;
  state.autoCheckBusy = true;
  state.autoCheckError = null;
  try {
    state.autoCheckEnabled =
      (await window.Utawakui.setAppUpdateAutoCheck(enabled)) === true;
    return true;
  } catch {
    state.autoCheckEnabled = previous;
    state.autoCheckError = '請再試一次。';
    return false;
  } finally {
    state.autoCheckBusy = false;
  }
}

export function useAppUpdate() {
  ensureSubscription();
  return {
    state: readonly(state),
    updateReady,
    refreshAppUpdateStatus,
    checkForAppUpdate,
    downloadAppUpdate,
    installAppUpdate,
    refreshAppUpdateAutoCheck,
    setAppUpdateAutoCheck,
  };
}
