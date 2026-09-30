'use strict';

const RECOVERY_DETAILS = Object.freeze({
  'renderer-crashed': '主畫面程序意外停止，請重新啟動以恢復操作。',
  'renderer-unresponsive': '主畫面沒有回應，請重新啟動以恢復操作。',
  'renderer-load-failed': '主畫面載入失敗，請重新啟動以恢復操作。',
  'renderer-preload-failed': '主畫面安全橋接載入失敗，請重新啟動以恢復操作。',
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
        title: 'Utawakui 需要重新啟動',
        message: '主畫面無法繼續運作',
        detail:
          RECOVERY_DETAILS[reason] ?? '主畫面發生無法恢復的錯誤，請重新啟動。',
        buttons: ['重新啟動 Utawakui', '退出'],
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
