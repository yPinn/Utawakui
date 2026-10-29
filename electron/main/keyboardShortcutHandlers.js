'use strict';
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerKeyboardShortcutHandlers({
  ipcMain,
  getMainWindow,
  store,
  recordDiagnostic,
  getRuntime,
}) {
  for (const operation of ['get', 'set']) {
    ipcMain.handle(`keyboard-shortcuts:${operation}`, async (event, input) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event?.sender !== window.webContents ||
        event?.senderFrame !== window.webContents.mainFrame ||
        (operation === 'get' && input !== undefined)
      )
        return { status: 'invalid-intent' };
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'keyboard-shortcuts',
            operation,
            code: 'KEYBOARD_SHORTCUT_SETTINGS_FAILED',
          },
          publicError: {
            code: 'KEYBOARD_SHORTCUT_SETTINGS_FAILED',
            title: '快捷鍵設定未完成',
            message:
              operation === 'get'
                ? '無法讀取快捷鍵，請重新讀取。'
                : '快捷鍵尚未確認儲存，請重新讀取後再試。',
            context: { retryable: true },
          },
        },
        () => (operation === 'get' ? store.get() : store.set(input)),
      );
    });
  }
  if (getRuntime) {
    ipcMain.handle('keyboard-shortcuts:runtime', (event, input) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event?.sender !== window.webContents ||
        event?.senderFrame !== window.webContents.mainFrame ||
        input !== undefined
      )
        return { status: 'invalid-intent' };
      return getRuntime();
    });
  }
}
module.exports = { registerKeyboardShortcutHandlers };
