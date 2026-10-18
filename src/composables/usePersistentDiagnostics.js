import { reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';
import { useAppNotifications } from './useAppNotifications.js';

const notifications = useAppNotifications();

const RECENT_LIMIT = 100;

const state = reactive({
  recordCount: 0,
  isLoading: false,
  notice: null,
});
let readRevision = 0;
let clearing = false;
let exporting = false;
let openingFolder = false;
let reading = false;

function syncLoading() {
  state.isLoading = reading || clearing || exporting;
}

function bridgeMethod(name) {
  const method = globalThis.window?.Utawakui?.[name];
  return typeof method === 'function' ? method : null;
}

function failureNotice({ title, message = '請稍後再試一次。', operation }) {
  return normalizeAppError(null, {
    code: `DIAGNOSTICS_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title,
    message,
    actionLabel: '重試',
    source: 'diagnostics',
    operation,
  });
}

function notifyFailure(title, operation, action = null) {
  notifications.notify({
    key: `diagnostics-${operation}`,
    title,
    message: '請稍後再試一次。',
    tone: 'danger',
    actionLabel: '重試',
    action,
  });
}

async function refresh() {
  if (clearing) return false;
  const current = ++readRevision;
  const listRecent = bridgeMethod('listRecentDiagnostics');
  if (!listRecent) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      message: '重新啟動後即可讀取錯誤紀錄。',
      operation: 'list',
    });
    return false;
  }

  reading = true;
  syncLoading();
  state.notice = null;
  try {
    const events = await listRecent(RECENT_LIMIT);
    if (current !== readRevision) return false;
    if (!Array.isArray(events)) throw new TypeError('invalid diagnostics');
    state.recordCount = events.length;
    return true;
  } catch {
    if (current !== readRevision) return false;
    state.notice = failureNotice({
      title: '無法讀取錯誤紀錄',
      operation: 'list',
    });
    return false;
  } finally {
    if (current === readRevision) {
      reading = false;
      syncLoading();
    }
  }
}

async function clear() {
  if (clearing) return false;
  const clearDiagnostics = bridgeMethod('clearDiagnostics');
  if (!clearDiagnostics) {
    notifyFailure('無法清除錯誤紀錄', 'clear');
    return false;
  }

  ++readRevision;
  reading = false;
  clearing = true;
  syncLoading();
  try {
    const result = await clearDiagnostics();
    if (!result?.ok) throw new Error('diagnostics clear failed');
    state.recordCount = 0;
    state.notice = null;
    notifications.notify({
      key: 'diagnostics-clear',
      title: '錯誤紀錄已清除',
      message: '已移除這台電腦上的錯誤紀錄。',
    });
    return true;
  } catch {
    notifyFailure('無法清除錯誤紀錄', 'clear');
    return false;
  } finally {
    clearing = false;
    syncLoading();
  }
}

async function openFolder() {
  if (openingFolder) return false;
  const openDiagnosticsFolder = bridgeMethod('openDiagnosticsFolder');
  if (!openDiagnosticsFolder) {
    notifyFailure('無法開啟錯誤紀錄資料夾', 'open-folder', openFolder);
    return false;
  }

  openingFolder = true;
  try {
    const result = await openDiagnosticsFolder();
    if (!result?.ok) throw new Error('diagnostics folder open failed');
    notifications.clear('diagnostics-open-folder');
    return true;
  } catch {
    notifyFailure('無法開啟錯誤紀錄資料夾', 'open-folder', openFolder);
    return false;
  } finally {
    openingFolder = false;
  }
}

async function exportBundle() {
  if (exporting) return false;
  const exportDiagnostics = bridgeMethod('exportDiagnostics');
  if (!exportDiagnostics) {
    notifyFailure('無法匯出錯誤紀錄', 'export', exportBundle);
    return false;
  }

  exporting = true;
  syncLoading();
  try {
    const result = await exportDiagnostics();
    // A cancelled save dialog is expected control flow, not a failure — it
    // gets neither a success nor an error notice.
    if (result?.cancelled) return true;
    if (!result?.ok) throw new Error('diagnostics export failed');
    notifications.notify({
      key: 'diagnostics-export',
      title: '已匯出錯誤紀錄',
      message: '檔案已儲存在你選擇的位置。',
    });
    return true;
  } catch {
    notifyFailure('無法匯出錯誤紀錄', 'export', exportBundle);
    return false;
  } finally {
    exporting = false;
    syncLoading();
  }
}

export function usePersistentDiagnostics() {
  return {
    state: readonly(state),
    refresh,
    clear,
    openFolder,
    exportBundle,
  };
}
