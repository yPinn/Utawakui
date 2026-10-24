'use strict';

const STATUS = {
  TAGS_BUSY: 'busy',
  RECONCILIATION_CANCELLED: 'cancelled',
  TAGS_UNSUPPORTED: 'unsupported',
  TAGS_LIMIT: 'limit',
  TAGS_SPACE: 'insufficient-space',
  TAGS_VERIFICATION_FAILED: 'verification-failed',
  RECONCILIATION_INVALID: 'invalid-intent',
  RECONCILIATION_EXPIRED: 'expired',
  RECONCILIATION_STALE: 'stale',
  RECONCILIATION_CONFLICT: 'conflict',
  RECONCILIATION_RECOVERY_REQUIRED: 'recovery-required',
  RECONCILIATION_RECOVERY_CONFLICT: 'recovery-conflict',
  WORKS_STALE: 'conflict',
};
function registerTagWritebackHandlers({
  ipcMain,
  getMainWindow,
  service,
  recordDiagnostic,
}) {
  for (const operation of [
    'options',
    'preview',
    'commit',
    'restore',
    'recover',
    'activity',
    'cancel',
  ])
    ipcMain.handle(`library:tags-${operation}`, async (event, intent) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event?.sender !== window.webContents ||
        event?.senderFrame !== window.webContents.mainFrame ||
        (['recover', 'cancel'].includes(operation) && intent !== undefined)
      )
        return { status: 'invalid-intent' };
      try {
        return await service[operation](intent);
      } catch (error) {
        if (!STATUS[error.code])
          try {
            recordDiagnostic?.({
              process: 'main',
              level: 'warning',
              source: 'library-tags',
              operation,
              code: 'LIBRARY_TAGS_WRITEBACK_FAILED',
              error,
            });
          } catch {
            /* Diagnostics are fail-open. */
          }
        return { status: STATUS[error.code] ?? 'unavailable' };
      }
    });
}
module.exports = { registerTagWritebackHandlers };
