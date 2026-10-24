'use strict';

async function recoverReconciliations(tags, reconciliation) {
  const media = await tags.recover();
  const documents = await reconciliation.recover();
  return { recovered: Boolean(media.recovered || documents.recovered) };
}

function registerReconciliationHandlers({
  ipcMain,
  getMainWindow,
  service,
  recordDiagnostic,
}) {
  function allowed(event) {
    const window = getMainWindow();
    return (
      window &&
      !window.isDestroyed() &&
      event?.sender === window.webContents &&
      event?.senderFrame === window.webContents.mainFrame
    );
  }
  const statusByCode = {
    TAGS_BUSY: 'busy',
    RECONCILIATION_INVALID: 'invalid-intent',
    RECONCILIATION_SOURCE_MISSING: 'source-missing',
    RECONCILIATION_STALE: 'stale',
    RECONCILIATION_CONFLICT: 'conflict',
    RECONCILIATION_EXPIRED: 'expired',
    RECONCILIATION_CANCELLED: 'cancelled',
    RECONCILIATION_ASSET_CONFLICT: 'asset-conflict',
    RECONCILIATION_ASSET_LIMIT: 'asset-limit',
    RECONCILIATION_LIMIT: 'limit',
    RECONCILIATION_RECOVERY_REQUIRED: 'recovery-required',
    RECONCILIATION_RECOVERY_CONFLICT: 'recovery-conflict',
    WORKS_STALE: 'conflict',
  };
  for (const operation of [
    'scan',
    'page',
    'preview',
    'commit',
    'decide',
    'undo',
    'cancel',
    'recover',
  ]) {
    ipcMain.handle(
      `library:reconciliation-${operation}`,
      async (event, intent) => {
        if (!allowed(event)) return { status: 'invalid-intent' };
        if (
          ['scan', 'cancel', 'recover'].includes(operation) &&
          intent !== undefined
        )
          return { status: 'invalid-intent' };
        try {
          return await service[operation](intent);
        } catch (error) {
          if (!statusByCode[error.code])
            try {
              recordDiagnostic?.({
                process: 'main',
                level: 'warning',
                source: 'library-reconciliation',
                operation,
                code: 'LIBRARY_RECONCILIATION_FAILED',
                error,
              });
            } catch {
              /* Diagnostics are fail-open. */
            }
          return { status: statusByCode[error.code] ?? 'unavailable' };
        }
      },
    );
  }
}

module.exports = { registerReconciliationHandlers, recoverReconciliations };
