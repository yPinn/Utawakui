import { reactive, readonly } from 'vue';
import { notificationKey } from '../constants/notificationKeys.js';
import { normalizeAppError } from '../utils/appErrors.js';
import { useAppNotifications } from './useAppNotifications.js';
import { t } from '../utils/i18n.js';

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

function failureNotice({ title, message = t('common.tryAgain'), operation }) {
  return normalizeAppError(null, {
    code: `DIAGNOSTICS_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title,
    message,
    actionLabel: t('common.retry'),
    source: 'diagnostics',
    operation,
  });
}

function notifyFailure(title, operation, action = null) {
  notifications.notify({
    key: notificationKey.diagnostics(operation),
    title,
    message: t('common.tryAgain'),
    tone: 'danger',
    actionLabel: t('common.retry'),
    action,
  });
}

async function refresh() {
  if (clearing) return false;
  const current = ++readRevision;
  const listRecent = bridgeMethod('listRecentDiagnostics');
  if (!listRecent) {
    state.notice = failureNotice({
      title: t('settings.diagnosticsNotices.restartTitle'),
      message: t('settings.diagnosticsNotices.restartMessage'),
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
      title: t('settings.diagnosticsNotices.readFailed'),
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
    notifyFailure(t('settings.diagnosticsNotices.clearFailed'), 'clear');
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
      key: notificationKey.diagnostics('clear'),
      title: t('settings.diagnosticsNotices.cleared'),
      message: t('settings.diagnosticsNotices.clearedMessage'),
    });
    return true;
  } catch {
    notifyFailure(t('settings.diagnosticsNotices.clearFailed'), 'clear');
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
    notifyFailure(
      t('settings.diagnosticsNotices.openFolderFailed'),
      'open-folder',
      openFolder,
    );
    return false;
  }

  openingFolder = true;
  try {
    const result = await openDiagnosticsFolder();
    if (!result?.ok) throw new Error('diagnostics folder open failed');
    notifications.clear(notificationKey.diagnostics('open-folder'));
    return true;
  } catch {
    notifyFailure(
      t('settings.diagnosticsNotices.openFolderFailed'),
      'open-folder',
      openFolder,
    );
    return false;
  } finally {
    openingFolder = false;
  }
}

async function exportBundle() {
  if (exporting) return false;
  const exportDiagnostics = bridgeMethod('exportDiagnostics');
  if (!exportDiagnostics) {
    notifyFailure(
      t('settings.diagnosticsNotices.exportFailed'),
      'export',
      exportBundle,
    );
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
      key: notificationKey.diagnostics('export'),
      title: t('settings.diagnosticsNotices.exported'),
      message: t('settings.diagnosticsNotices.exportedMessage'),
    });
    return true;
  } catch {
    notifyFailure(
      t('settings.diagnosticsNotices.exportFailed'),
      'export',
      exportBundle,
    );
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
