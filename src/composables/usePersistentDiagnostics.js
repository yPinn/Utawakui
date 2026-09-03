import { reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';

const RECENT_LIMIT = 100;

const state = reactive({
  recordCount: 0,
  isLoading: false,
  notice: null,
});

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

async function refresh() {
  const listRecent = bridgeMethod('listRecentDiagnostics');
  if (!listRecent) {
    state.notice = failureNotice({
      title: '需要重新啟動',
      message: '重新啟動後即可讀取錯誤紀錄。',
      operation: 'list',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const events = await listRecent(RECENT_LIMIT);
    state.recordCount = Array.isArray(events) ? events.length : 0;
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法讀取錯誤紀錄',
      operation: 'list',
    });
    return false;
  } finally {
    state.isLoading = false;
  }
}

async function clear() {
  const clearDiagnostics = bridgeMethod('clearDiagnostics');
  if (!clearDiagnostics) {
    state.notice = failureNotice({
      title: '無法清除錯誤紀錄',
      operation: 'clear',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const result = await clearDiagnostics();
    if (!result?.ok) throw new Error('diagnostics clear failed');
    state.recordCount = 0;
    state.notice = normalizeAppError(null, {
      code: 'DIAGNOSTICS_CLEARED',
      severity: 'success',
      title: '錯誤紀錄已清除',
      message: '已移除這台電腦上的錯誤紀錄。',
      source: 'diagnostics',
      operation: 'clear',
    });
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法清除錯誤紀錄',
      operation: 'clear',
    });
    return false;
  } finally {
    state.isLoading = false;
  }
}

async function openFolder() {
  const openDiagnosticsFolder = bridgeMethod('openDiagnosticsFolder');
  if (!openDiagnosticsFolder) {
    state.notice = failureNotice({
      title: '無法開啟錯誤紀錄資料夾',
      operation: 'open-folder',
    });
    return false;
  }

  state.notice = null;
  try {
    const result = await openDiagnosticsFolder();
    if (!result?.ok) throw new Error('diagnostics folder open failed');
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法開啟錯誤紀錄資料夾',
      operation: 'open-folder',
    });
    return false;
  }
}

async function exportBundle() {
  const exportDiagnostics = bridgeMethod('exportDiagnostics');
  if (!exportDiagnostics) {
    state.notice = failureNotice({
      title: '無法匯出錯誤紀錄',
      operation: 'export',
    });
    return false;
  }

  state.isLoading = true;
  state.notice = null;
  try {
    const result = await exportDiagnostics();
    // A cancelled save dialog is expected control flow, not a failure — it
    // gets neither a success nor an error notice.
    if (result?.cancelled) return true;
    if (!result?.ok) throw new Error('diagnostics export failed');
    state.notice = normalizeAppError(null, {
      code: 'DIAGNOSTICS_EXPORTED',
      severity: 'success',
      title: '已匯出錯誤紀錄',
      message: '檔案已儲存在你選擇的位置。',
      source: 'diagnostics',
      operation: 'export',
    });
    return true;
  } catch {
    state.notice = failureNotice({
      title: '無法匯出錯誤紀錄',
      operation: 'export',
    });
    return false;
  } finally {
    state.isLoading = false;
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
