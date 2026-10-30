'use strict';

const { t } = require('../lib/i18n');

const RECOVERY_DETAIL_KEYS = Object.freeze({
  'renderer-crashed': 'shell.recovery.rendererCrashed',
  'renderer-unresponsive': 'shell.recovery.rendererUnresponsive',
  'renderer-load-failed': 'shell.recovery.rendererLoadFailed',
  'renderer-preload-failed': 'shell.recovery.rendererPreloadFailed',
});

function createRendererRecoveryController({
  dialog,
  getMainWindow,
  restartApp,
  quitApp,
  recordDiagnostic = () => {},
}) {
  let recoveryPromise = null;

  function recordBoundedFailure(code, operation, message) {
    try {
      recordDiagnostic({
        level: 'error',
        source: 'electron',
        operation,
        code,
        message,
      });
    } catch {
      // Recovery must not depend on diagnostics persistence.
    }
  }

  function requestRecovery(reason) {
    if (recoveryPromise) return recoveryPromise;

    recoveryPromise = Promise.resolve().then(async () => {
      const options = {
        type: 'error',
        title: t('shell.recovery.title'),
        message: t('shell.recovery.message'),
        detail: t(RECOVERY_DETAIL_KEYS[reason] ?? 'shell.recovery.unknown'),
        buttons: [t('shell.recovery.restart'), t('shell.recovery.quit')],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };

      let result;
      try {
        const mainWindow = getMainWindow?.();
        result =
          mainWindow && !mainWindow.isDestroyed?.()
            ? await dialog.showMessageBox(mainWindow, options)
            : await dialog.showMessageBox(options);
      } catch {
        recordBoundedFailure(
          'RENDERER_RECOVERY_DIALOG_FAILED',
          'renderer-recovery-dialog',
          'Renderer recovery dialog failed',
        );
        quitApp();
        return 'quit';
      }

      if (result?.response === 0) {
        try {
          restartApp();
          return 'restart';
        } catch {
          recordBoundedFailure(
            'RENDERER_RESTART_FAILED',
            'renderer-restart',
            'Renderer recovery restart failed',
          );
        }
      }

      quitApp();
      return 'quit';
    });

    return recoveryPromise;
  }

  return Object.freeze({ requestRecovery });
}

module.exports = { createRendererRecoveryController };
