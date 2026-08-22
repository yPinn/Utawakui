import { reactive, readonly } from 'vue';
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
  releaseDate: null,
  error: null,
});

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
  state.releaseDate =
    typeof status.releaseDate === 'string' ? status.releaseDate : null;
  state.error =
    typeof status.error === 'string' && status.error
      ? '目前無法完成更新操作，請稍後再試。'
      : null;
}

function ensureSubscription() {
  if (unsubscribe || !hasBridge('onAppUpdateStatus')) return;
  unsubscribe = window.Utawakui.onAppUpdateStatus(applyStatus);
}

async function invoke(method) {
  ensureSubscription();
  if (!hasBridge(method)) {
    state.error = '需要重新啟動應用程式才能使用更新功能。';
    return;
  }
  try {
    applyStatus(await window.Utawakui[method]());
  } catch (error) {
    state.error = recordError(error, {
      code: 'APP_UPDATE_ACTION_FAILED',
      title: '更新操作失敗',
      message: '目前無法完成更新操作，請稍後再試。',
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

export function useAppUpdate() {
  ensureSubscription();
  return {
    state: readonly(state),
    refreshAppUpdateStatus,
    checkForAppUpdate,
    downloadAppUpdate,
    installAppUpdate,
  };
}
