import { computed, reactive, readonly } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { useTaskNotification } from './useTaskNotification.js';
import { useAppView } from './useAppView.js';
import { formatDownloadProgress } from '../utils/appUpdateProgress.js';
import { useSettingsPreference } from './useSettingsPreference.js';
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

const autoCheck = useSettingsPreference({
  initialValue: true,
  read: () => window.Utawakui.getAppUpdateAutoCheck(),
  write: (enabled) => window.Utawakui.setAppUpdateAutoCheck(enabled),
  validate: (value) => typeof value === 'boolean',
  readMessage: '無法讀取自動檢查設定，請重新讀取。',
  saveMessage: '自動檢查設定未儲存，已恢復原設定。',
});
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
  get autoCheckEnabled() {
    return autoCheck.value.value;
  },
  get autoCheckBusy() {
    return autoCheck.busy.value;
  },
  get autoCheckError() {
    return autoCheck.error.value || null;
  },
  get autoCheckReadError() {
    return autoCheck.readError.value;
  },
  get autoCheckSaveError() {
    return autoCheck.saveError.value;
  },
  get autoCheckLoaded() {
    return autoCheck.loaded.value;
  },
  get autoCheckReading() {
    return autoCheck.reading.value;
  },
  statusReadError: '',
  actionError: '',
  actionOperation: '',
});

// True whenever the user has something to act on — drives the passive
// navigation indicator, which must stay lit through the download and until the
// update is actually installed.
const updateReady = computed(
  () => state.phase === 'available' || state.phase === 'downloaded',
);

let unsubscribe = null;
let downloadFeedback = null;
let downloadRequest = null;
let statusEventRevision = 0;
function beginDownloadFeedback() {
  if (downloadFeedback) return;
  downloadFeedback = useTaskNotification({
    key: NOTIFICATION_KEYS.TASK_APP_UPDATE,
    title: 'Utawakui 更新下載中',
    action: () => useAppView().openSettings('application'),
  });
}
function finishDownloadFeedback(failed = false) {
  if (!downloadFeedback) return;
  downloadFeedback.finish(
    failed
      ? {
          title: '更新下載未完成',
          message: '請檢查網路連線後再試一次。',
          tone: 'danger',
          actionLabel: '重試下載',
          action: downloadAppUpdate,
        }
      : {
          title: '更新已下載，可安裝',
          message: '安裝會重新啟動 Utawakui，請在適合的時間操作。',
          actionLabel: '查看更新',
          action: () => useAppView().openSettings('application'),
        },
  );
  downloadFeedback = null;
}

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
  if (state.phase === 'downloading') {
    beginDownloadFeedback();
    downloadFeedback.progress(formatDownloadProgress(state), state.progress);
  } else if (state.phase === 'downloaded') finishDownloadFeedback();
  else if (state.phase === 'error') finishDownloadFeedback(true);
}

function ensureSubscription() {
  if (unsubscribe || !hasBridge('onAppUpdateStatus')) return;
  unsubscribe = window.Utawakui.onAppUpdateStatus((status) => {
    statusEventRevision += 1;
    applyStatus(status);
  });
}

async function invoke(method) {
  ensureSubscription();
  if (!hasBridge(method)) {
    if (method === 'getAppUpdateStatus')
      state.statusReadError = '無法讀取更新狀態，請重新啟動後再試。';
    else state.actionError = '請重新啟動 Utawakui 後再試。';
    if (method === 'downloadAppUpdate') finishDownloadFeedback(true);
    state.error = '請重新啟動 Utawakui 後再試。';
    return;
  }
  const revision = statusEventRevision;
  try {
    const status = await window.Utawakui[method]();
    if (!status || !PHASES.has(status.phase))
      throw new TypeError('invalid update status');
    if (revision === statusEventRevision) applyStatus(status);
    if (method === 'getAppUpdateStatus') state.statusReadError = '';
    else if (state.actionOperation === method) {
      state.actionError = '';
      state.actionOperation = '';
    }
  } catch (error) {
    // A newer authoritative completion supersedes this request's transport
    // failure. Do not pair a successful download with an obsolete error.
    if (
      revision !== statusEventRevision &&
      (method === 'getAppUpdateStatus' ||
        (method === 'downloadAppUpdate' && state.phase === 'downloaded'))
    )
      return;
    if (method === 'downloadAppUpdate') finishDownloadFeedback(true);
    const message = recordError(error, {
      code: 'APP_UPDATE_ACTION_FAILED',
      title: '更新失敗',
      message: '更新失敗，請再試一次。',
      source: 'app-update',
      operation: method,
    }).message;
    state.error = message;
    if (method === 'getAppUpdateStatus')
      state.statusReadError = '無法讀取更新狀態，請重新讀取。';
    else {
      state.actionError = message;
      state.actionOperation = method;
    }
  }
}

function refreshAppUpdateStatus() {
  return invoke('getAppUpdateStatus');
}

function checkForAppUpdate() {
  return invoke('checkForAppUpdate');
}

function downloadAppUpdate() {
  if (downloadRequest) return downloadRequest;
  if (state.phase === 'downloading') return Promise.resolve();
  beginDownloadFeedback();
  downloadRequest = invoke('downloadAppUpdate').finally(() => {
    downloadRequest = null;
    if (!['downloading', 'downloaded', 'error'].includes(state.phase)) {
      downloadFeedback?.discard();
      downloadFeedback = null;
    }
  });
  return downloadRequest;
}

function installAppUpdate() {
  return invoke('installAppUpdate');
}

const refreshAppUpdateAutoCheck = autoCheck.refresh;
const setAppUpdateAutoCheck = autoCheck.save;

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
