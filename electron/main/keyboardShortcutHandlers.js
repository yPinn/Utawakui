'use strict';
const { t } = require('../lib/i18n');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const {
  parseReceiverIntent,
} = require('../../shared/globalShortcutReceiver.mjs');

function registerKeyboardShortcutHandlers({
  ipcMain,
  getMainWindow,
  store,
  recordDiagnostic,
  getRuntime,
  receiver,
}) {
  for (const operation of [
    'get',
    'set',
    ...['test', 'enable'].filter(
      (method) => typeof store[method] === 'function',
    ),
  ]) {
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
            title: t('shortcuts.mainErrors.settingsTitle'),
            message: t(
              operation === 'get'
                ? 'shortcuts.errors.readFailed'
                : 'shortcuts.errors.saveUnconfirmed',
            ),
            context: { retryable: true },
          },
        },
        () => (operation === 'get' ? store.get() : store[operation](input)),
      );
    });
  }
  if (receiver) {
    for (const [operation, method] of [
      ['connect', 'connect'],
      ['confirm', 'confirm'],
      ['admit', 'admit'],
      ['release', 'release'],
    ]) {
      ipcMain.handle(
        `keyboard-shortcuts:receiver-${operation}`,
        async (event, input) => {
          const window = getMainWindow();
          if (
            !window ||
            window.isDestroyed() ||
            event?.sender !== window.webContents ||
            event?.senderFrame !== window.webContents.mainFrame ||
            (operation === 'connect' && input !== undefined)
          )
            return { status: 'invalid-intent' };
          let intent;
          try {
            intent =
              operation === 'connect'
                ? undefined
                : parseReceiverIntent(operation, input);
          } catch {
            return { status: 'invalid-intent' };
          }
          return runDiagnosticIpcOperation(
            {
              recordDiagnostic,
              diagnostic: {
                source: 'keyboard-shortcuts',
                operation: `receiver-${operation}`,
                code: 'KEYBOARD_SHORTCUT_RECEIVER_FAILED',
              },
              publicError: {
                code: 'KEYBOARD_SHORTCUT_RECEIVER_FAILED',
                title: t('shortcuts.mainErrors.receiverTitle'),
                message: t('shortcuts.mainErrors.receiverMessage'),
                context: { retryable: true },
              },
            },
            () => receiver[method](intent),
          );
        },
      );
    }
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
