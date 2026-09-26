'use strict';

const {
  isWindowCloseBehavior,
} = require('../../shared/windowCloseBehaviorContract.mjs');

const CLOSE_RESPONSE = Object.freeze({
  TRAY: 0,
  QUIT: 1,
  CANCEL: 2,
});

// Owns the Windows notification-area and X-button decision lifecycle without
// owning BrowserWindow creation. Hiding the existing window preserves
// renderer-owned playback, queue, lyrics and Output projections. Every real
// exit flips the sticky flag synchronously so no later close event can be
// mistaken for a user-requested background hide.
function createWindowsTrayController({
  app,
  Tray,
  Menu,
  dialog,
  iconPath,
  appName = 'Utawakui',
  initialBehavior = 'ask',
  requestCloseDecision = null,
  persistWindowCloseBehavior = async () => undefined,
  recordDiagnostic = () => undefined,
}) {
  let behavior = 'ask';
  let quitting = false;
  let destroyed = false;
  let ephemeralTray = false;
  let pendingClosePrompt = null;
  let tray = null;
  let mainWindow = null;

  function beginQuit() {
    quitting = true;
  }

  function isQuitting() {
    return quitting;
  }

  function destroyTray() {
    ephemeralTray = false;
    if (!tray) return;
    const currentTray = tray;
    tray = null;
    currentTray.destroy();
  }

  function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed?.()) return false;
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (ephemeralTray && behavior !== 'tray') destroyTray();
    return true;
  }

  function showSettings() {
    if (!showWindow()) return false;
    if (mainWindow.webContents?.isDestroyed?.()) return false;
    mainWindow.webContents?.send?.('app:navigate', 'settings');
    return true;
  }

  function createTray() {
    if (tray) return tray;
    let nextTray;
    try {
      nextTray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: `開啟 ${appName}`, click: showWindow },
        { label: '設定', click: showSettings },
        { type: 'separator' },
        {
          label: `結束 ${appName}`,
          click: () => {
            beginQuit();
            app.quit();
          },
        },
      ]);
      nextTray.setToolTip(appName);
      nextTray.setContextMenu(contextMenu);
      nextTray.on('double-click', showWindow);
      tray = nextTray;
      return tray;
    } catch (error) {
      nextTray?.destroy?.();
      throw error;
    }
  }

  function setCloseBehavior(nextBehavior) {
    if (!isWindowCloseBehavior(nextBehavior)) {
      throw new TypeError('invalid window close behavior');
    }
    if (destroyed) return behavior;
    if (nextBehavior === 'tray') {
      createTray();
      ephemeralTray = false;
    } else {
      destroyTray();
    }
    behavior = nextBehavior;
    return behavior;
  }

  function canActOnPrompt(sourceWindow) {
    return Boolean(
      !destroyed &&
      !quitting &&
      sourceWindow === mainWindow &&
      !sourceWindow?.isDestroyed?.(),
    );
  }

  async function showBoundedCloseError(
    sourceWindow,
    {
      error,
      operation = 'remember-close-behavior',
      code = 'WINDOW_CLOSE_BEHAVIOR_UPDATE_FAILED',
      message = '無法儲存關閉行為',
      detail = '視窗仍保持開啟，請稍後再試，或在設定頁重新選擇。',
    },
  ) {
    recordDiagnostic({
      source: 'window-close',
      operation,
      code,
      error,
    });
    if (!canActOnPrompt(sourceWindow)) return;
    try {
      await dialog.showMessageBox(sourceWindow, {
        type: 'error',
        title: appName,
        message,
        detail,
        buttons: ['確定'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
    } catch {
      // A native dialog failure must not turn this recovered close request
      // into an unhandled rejection or expose the private persistence error.
    }
  }

  async function rememberBehavior(sourceWindow, nextBehavior) {
    try {
      await persistWindowCloseBehavior(nextBehavior);
      if (!canActOnPrompt(sourceWindow)) return false;
      behavior = nextBehavior;
      if (nextBehavior !== 'tray') destroyTray();
      return true;
    } catch (error) {
      destroyTray();
      await showBoundedCloseError(sourceWindow, { error });
      return false;
    }
  }

  async function showNativeClosePrompt(sourceWindow) {
    try {
      const result = await dialog.showMessageBox(sourceWindow, {
        type: 'question',
        title: appName,
        message: '要讓 Utawakui 在背景繼續執行嗎？',
        detail:
          '背景執行會保留播放、OBS 連線與輸出；你可以從系統匣再次開啟或完整結束。',
        buttons: ['在背景執行', '完全結束', '取消'],
        defaultId: CLOSE_RESPONSE.TRAY,
        cancelId: CLOSE_RESPONSE.CANCEL,
        checkboxLabel: '記住我的選擇',
        checkboxChecked: false,
        noLink: true,
      });
      const action =
        result.response === CLOSE_RESPONSE.TRAY
          ? 'tray'
          : result.response === CLOSE_RESPONSE.QUIT
            ? 'quit'
            : 'cancel';
      return {
        action,
        remember: action === 'cancel' ? false : result.checkboxChecked === true,
      };
    } catch (error) {
      recordDiagnostic({
        source: 'window-close',
        operation: 'show-close-prompt',
        code: 'WINDOW_CLOSE_PROMPT_FAILED',
        error,
      });
      return null;
    }
  }

  async function resolveClosePrompt(sourceWindow) {
    let result = null;
    if (typeof requestCloseDecision === 'function') {
      try {
        result = await requestCloseDecision(sourceWindow);
      } catch (error) {
        recordDiagnostic({
          source: 'window-close',
          operation: 'show-app-close-prompt',
          code: 'WINDOW_CLOSE_APP_PROMPT_FAILED',
          error,
        });
      }
    }
    if (!canActOnPrompt(sourceWindow)) return;
    if (
      !result ||
      !['tray', 'quit', 'cancel'].includes(result.action) ||
      typeof result.remember !== 'boolean'
    ) {
      result = await showNativeClosePrompt(sourceWindow);
    }

    if (!result || !canActOnPrompt(sourceWindow)) return;
    if (result.action === 'cancel') return;

    if (result.action === 'tray') {
      try {
        createTray();
      } catch (error) {
        await showBoundedCloseError(sourceWindow, {
          error,
          operation: 'create-tray',
          code: 'WINDOW_TRAY_CREATE_FAILED',
          message: '無法在背景執行',
          detail: '系統匣目前無法建立，視窗會保持開啟。請稍後再試。',
        });
        return;
      }
      if (result.remember) {
        const remembered = await rememberBehavior(sourceWindow, 'tray');
        if (!remembered) return;
        ephemeralTray = false;
      } else {
        ephemeralTray = true;
      }
      if (canActOnPrompt(sourceWindow)) sourceWindow.hide();
      return;
    }

    if (result.action === 'quit') {
      if (result.remember) {
        const remembered = await rememberBehavior(sourceWindow, 'quit');
        if (!remembered) return;
      }
      if (!canActOnPrompt(sourceWindow)) return;
      beginQuit();
      app.quit();
    }
  }

  function handleWindowClose(event) {
    if (quitting || behavior === 'quit') return;
    event.preventDefault();
    if (behavior === 'tray') {
      mainWindow?.hide();
      return;
    }
    if (pendingClosePrompt) return;
    const sourceWindow = mainWindow;
    const prompt = resolveClosePrompt(sourceWindow);
    pendingClosePrompt = prompt;
    void prompt.finally(() => {
      if (pendingClosePrompt === prompt) pendingClosePrompt = null;
    });
  }

  function detachWindow() {
    if (!mainWindow) return;
    mainWindow.removeListener('close', handleWindowClose);
    mainWindow.removeListener('query-session-end', beginQuit);
    mainWindow.removeListener('session-end', beginQuit);
    mainWindow = null;
  }

  function attachWindow(nextWindow) {
    if (destroyed || nextWindow === mainWindow) return;
    detachWindow();
    mainWindow = nextWindow;
    if (!mainWindow) return;
    mainWindow.on('close', handleWindowClose);
    // Electron may not emit app.before-quit during Windows shutdown/logoff.
    // These native window events must therefore set the same sticky flag.
    mainWindow.on('query-session-end', beginQuit);
    mainWindow.on('session-end', beginQuit);
  }

  function handleBeforeQuit() {
    beginQuit();
  }

  function handleWillQuit() {
    beginQuit();
    destroyTray();
  }

  app.on('before-quit', handleBeforeQuit);
  app.on('will-quit', handleWillQuit);
  setCloseBehavior(initialBehavior);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    destroyTray();
    detachWindow();
    app.removeListener('before-quit', handleBeforeQuit);
    app.removeListener('will-quit', handleWillQuit);
  }

  return {
    attachWindow,
    beginQuit,
    destroy,
    isQuitting,
    setCloseBehavior,
    showWindow,
  };
}

module.exports = { createWindowsTrayController };
