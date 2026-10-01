import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import windowsTrayControllerModule from './windowsTrayController.js';

const { createWindowsTrayController } = windowsTrayControllerModule;

function createWindowDouble({ minimized = false } = {}) {
  const win = new EventEmitter();
  let isMinimized = minimized;
  win.hide = vi.fn();
  win.show = vi.fn();
  win.focus = vi.fn();
  win.restore = vi.fn(() => {
    isMinimized = false;
  });
  win.isMinimized = vi.fn(() => isMinimized);
  win.isDestroyed = vi.fn(() => false);
  win.webContents = { send: vi.fn() };
  return win;
}

function createHarness(overrides = {}) {
  const app = new EventEmitter();
  app.quit = vi.fn();
  let tray;
  const Tray = vi.fn(function Tray() {
    tray = new EventEmitter();
    tray.setToolTip = vi.fn();
    tray.setContextMenu = vi.fn();
    tray.destroy = vi.fn();
    return tray;
  });
  let menuTemplate;
  const contextMenu = { id: 'tray-menu' };
  const Menu = {
    buildFromTemplate: vi.fn((template) => {
      menuTemplate = template;
      return contextMenu;
    }),
  };
  const dialog = {
    showMessageBox: vi.fn().mockResolvedValue({
      response: 2,
      checkboxChecked: false,
    }),
  };
  const persistWindowCloseBehavior = vi.fn().mockResolvedValue(undefined);
  const recordDiagnostic = vi.fn();
  const controller = createWindowsTrayController({
    app,
    Tray,
    Menu,
    dialog,
    iconPath: 'E:\\Utawakui\\app-icon.ico',
    appName: 'Utawakui',
    initialBehavior: 'ask',
    persistWindowCloseBehavior,
    recordDiagnostic,
    ...overrides,
  });
  return {
    app,
    controller,
    contextMenu,
    dialog,
    getMenuTemplate: () => menuTemplate,
    getTray: () => tray,
    Menu,
    persistWindowCloseBehavior,
    recordDiagnostic,
    Tray,
  };
}

function closeEvent() {
  return { preventDefault: vi.fn() };
}

async function flushCloseDecision() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('windowsTrayController', () => {
  it('asks on close by default and leaves the window open when cancelled', async () => {
    const { controller, dialog, Tray } = createHarness();
    const win = createWindowDouble();
    controller.attachWindow(win);

    const event = closeEvent();
    win.emit('close', event);
    await flushCloseDecision();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({
        buttons: ['在背景執行', '完全結束', '取消'],
        cancelId: 2,
        checkboxLabel: '記住我的選擇',
      }),
    );
    expect(Tray).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('uses the app close decision before the native fallback', async () => {
    const requestCloseDecision = vi
      .fn()
      .mockResolvedValue({ action: 'cancel', remember: false });
    const { controller, dialog } = createHarness({ requestCloseDecision });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(requestCloseDecision).toHaveBeenCalledWith(win);
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('falls back to the native prompt when the app modal cannot be presented', async () => {
    const privateError = Object.assign(
      new Error('renderer failed E:\\private\\index.html'),
      { code: 'WINDOW_CLOSE_RENDERER_UNAVAILABLE' },
    );
    const requestCloseDecision = vi.fn().mockRejectedValue(privateError);
    const { controller, dialog, recordDiagnostic } = createHarness({
      requestCloseDecision,
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({
        buttons: ['在背景執行', '完全結束', '取消'],
      }),
    );
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WINDOW_CLOSE_APP_PROMPT_FAILED',
        error: privateError,
      }),
    );
  });

  it('runs in the tray once without changing ask mode when not remembered', async () => {
    const { controller, dialog, getTray, Tray } = createHarness();
    dialog.showMessageBox.mockResolvedValueOnce({
      response: 0,
      checkboxChecked: false,
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(Tray).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledOnce();

    controller.showWindow();
    expect(getTray().destroy).toHaveBeenCalledOnce();

    win.emit('close', closeEvent());
    await flushCloseDecision();
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('persists remembered background mode before hiding', async () => {
    const calls = [];
    const persistWindowCloseBehavior = vi.fn(async (behavior) => {
      calls.push(`save:${behavior}`);
    });
    const { controller, dialog } = createHarness({
      persistWindowCloseBehavior,
    });
    dialog.showMessageBox.mockResolvedValueOnce({
      response: 0,
      checkboxChecked: true,
    });
    const win = createWindowDouble();
    win.hide.mockImplementation(() => calls.push('hide'));
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(persistWindowCloseBehavior).toHaveBeenCalledWith('tray');
    expect(calls).toEqual(['save:tray', 'hide']);

    win.emit('close', closeEvent());
    await flushCloseDecision();
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledTimes(2);
  });

  it('quits once without persisting when the exit choice is not remembered', async () => {
    const { app, controller, dialog, persistWindowCloseBehavior } =
      createHarness();
    dialog.showMessageBox.mockResolvedValueOnce({
      response: 1,
      checkboxChecked: false,
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(controller.isQuitting()).toBe(true);
    expect(persistWindowCloseBehavior).not.toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('persists remembered exit mode before quitting', async () => {
    const calls = [];
    const app = new EventEmitter();
    app.quit = vi.fn(() => calls.push('quit'));
    const persistWindowCloseBehavior = vi.fn(async (behavior) => {
      calls.push(`save:${behavior}`);
    });
    const { controller, dialog } = createHarness({
      app,
      persistWindowCloseBehavior,
    });
    dialog.showMessageBox.mockResolvedValueOnce({
      response: 1,
      checkboxChecked: true,
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(calls).toEqual(['save:quit', 'quit']);
  });

  it('opens only one close prompt when close is requested repeatedly', async () => {
    let resolvePrompt;
    const pendingPrompt = new Promise((resolve) => {
      resolvePrompt = resolve;
    });
    const { controller, dialog } = createHarness();
    dialog.showMessageBox.mockReturnValueOnce(pendingPrompt);
    const win = createWindowDouble();
    controller.attachWindow(win);

    const first = closeEvent();
    const second = closeEvent();
    win.emit('close', first);
    win.emit('close', second);

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();

    resolvePrompt({ response: 2, checkboxChecked: false });
    await flushCloseDecision();
  });

  it('ignores a delayed prompt result after a real quit begins', async () => {
    let resolvePrompt;
    const pendingPrompt = new Promise((resolve) => {
      resolvePrompt = resolve;
    });
    const { app, controller, dialog, persistWindowCloseBehavior, Tray } =
      createHarness();
    dialog.showMessageBox.mockReturnValueOnce(pendingPrompt);
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    controller.beginQuit();
    resolvePrompt({ response: 0, checkboxChecked: true });
    await flushCloseDecision();

    expect(Tray).not.toHaveBeenCalled();
    expect(persistWindowCloseBehavior).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('keeps the window visible and reports a bounded error when remembering fails', async () => {
    const privateError = new Error('failed E:\\private\\config.json');
    const { app, controller, dialog, recordDiagnostic, Tray } = createHarness({
      persistWindowCloseBehavior: vi.fn().mockRejectedValue(privateError),
    });
    dialog.showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: true })
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(win.hide).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WINDOW_CLOSE_BEHAVIOR_UPDATE_FAILED',
        error: privateError,
      }),
    );
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      win,
      expect.objectContaining({
        type: 'error',
        message: '無法儲存關閉行為',
      }),
    );
    expect(JSON.stringify(dialog.showMessageBox.mock.calls)).not.toContain(
      'private',
    );
    expect(Tray).toHaveBeenCalledOnce();
    expect(Tray.mock.results[0].value.destroy).toHaveBeenCalledOnce();
  });

  it('keeps the window visible when one-shot tray creation fails', async () => {
    const privateError = new Error('private shell icon failure');
    const failingTray = vi.fn(function Tray() {
      throw privateError;
    });
    const { app, controller, dialog, recordDiagnostic } = createHarness({
      Tray: failingTray,
    });
    dialog.showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(win.hide).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WINDOW_TRAY_CREATE_FAILED',
        error: privateError,
      }),
    );
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      win,
      expect.objectContaining({
        type: 'error',
        message: '無法在背景執行',
      }),
    );
  });

  it('creates one persistent tray idempotently and hides directly in tray mode', async () => {
    const { contextMenu, controller, dialog, getTray, Menu, Tray } =
      createHarness();
    const win = createWindowDouble();
    controller.attachWindow(win);

    controller.setCloseBehavior('tray');
    controller.setCloseBehavior('tray');

    expect(Tray).toHaveBeenCalledOnce();
    expect(Tray).toHaveBeenCalledWith('E:\\Utawakui\\app-icon.ico');
    expect(Menu.buildFromTemplate).toHaveBeenCalledOnce();
    expect(getTray().setToolTip).toHaveBeenCalledWith('Utawakui');
    expect(getTray().setContextMenu).toHaveBeenCalledWith(contextMenu);

    const event = closeEvent();
    win.emit('close', event);
    await flushCloseDecision();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('allows native close without prompting in remembered quit mode', () => {
    const { controller, dialog, Tray } = createHarness();
    const win = createWindowDouble();
    controller.attachWindow(win);
    controller.setCloseBehavior('quit');

    const event = closeEvent();
    win.emit('close', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(Tray).not.toHaveBeenCalled();
  });

  it('protects active accompaniment work even in remembered quit mode', async () => {
    const requestCloseDecision = vi
      .fn()
      .mockResolvedValue({ action: 'cancel', remember: false });
    const { controller, dialog } = createHarness({
      initialBehavior: 'quit',
      getActiveBackgroundWork: () => 'separation',
      requestCloseDecision,
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    const event = closeEvent();
    win.emit('close', event);
    await flushCloseDecision();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(requestCloseDecision).toHaveBeenCalledWith(win, {
      activeWork: 'separation',
    });
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('uses one-shot destructive copy in the native active-work fallback', async () => {
    const { controller, dialog } = createHarness({
      getActiveBackgroundWork: () => 'separation',
    });
    const win = createWindowDouble();
    controller.attachWindow(win);

    win.emit('close', closeEvent());
    await flushCloseDecision();

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({
        message: '伴奏處理中',
        buttons: ['在背景繼續', '停止並結束', '取消'],
        checkboxLabel: undefined,
      }),
    );
  });

  it('restores, shows, and focuses the same window from the tray and API', () => {
    const { controller, getMenuTemplate, getTray } = createHarness();
    const win = createWindowDouble({ minimized: true });
    controller.attachWindow(win);
    controller.setCloseBehavior('tray');

    getMenuTemplate()[0].click();
    getTray().emit('double-click');
    controller.showWindow();

    expect(win.restore).toHaveBeenCalledOnce();
    expect(win.show).toHaveBeenCalledTimes(3);
    expect(win.focus).toHaveBeenCalledTimes(3);
  });

  it('marks quitting before the tray exit action calls app.quit', () => {
    const { app, controller, getMenuTemplate } = createHarness();
    const win = createWindowDouble();
    const calls = [];
    app.quit.mockImplementation(() => calls.push('quit'));
    controller.attachWindow(win);
    controller.setCloseBehavior('tray');

    getMenuTemplate()
      .find((item) => item.label === '結束 Utawakui')
      .click();
    calls.unshift(controller.isQuitting() ? 'quitting' : 'not-quitting');

    expect(calls).toEqual(['quitting', 'quit']);
    const event = closeEvent();
    win.emit('close', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('opens Settings through a fixed renderer navigation command', () => {
    const { controller, getMenuTemplate } = createHarness();
    const win = createWindowDouble({ minimized: true });
    controller.attachWindow(win);
    controller.setCloseBehavior('tray');

    getMenuTemplate()
      .find((item) => item.label === '設定')
      .click();

    expect(win.restore).toHaveBeenCalledOnce();
    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
    expect(win.webContents.send).toHaveBeenCalledWith(
      'app:navigate',
      'settings',
    );
  });

  it.each(['query-session-end', 'session-end'])(
    'never intercepts close after Windows %s',
    (sessionEvent) => {
      const { controller, dialog } = createHarness();
      const win = createWindowDouble();
      controller.attachWindow(win);

      win.emit(sessionEvent);
      const event = closeEvent();
      win.emit('close', event);

      expect(controller.isQuitting()).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    },
  );

  it('allows update and normal quit paths to synchronously bypass prompting', () => {
    const { app, controller, dialog } = createHarness();
    const win = createWindowDouble();
    controller.attachWindow(win);

    controller.beginQuit();
    const updateClose = closeEvent();
    win.emit('close', updateClose);
    expect(updateClose.preventDefault).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();

    const next = createHarness();
    const nextWindow = createWindowDouble();
    next.controller.attachWindow(nextWindow);
    next.app.emit('before-quit');
    const normalClose = closeEvent();
    nextWindow.emit('close', normalClose);
    expect(normalClose.preventDefault).not.toHaveBeenCalled();
    expect(next.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('detaches an old window and all app listeners when destroyed', () => {
    const { app, controller, getTray } = createHarness();
    const first = createWindowDouble();
    const second = createWindowDouble();
    controller.attachWindow(first);
    controller.setCloseBehavior('tray');
    const tray = getTray();
    controller.attachWindow(second);

    const oldClose = closeEvent();
    first.emit('close', oldClose);
    expect(oldClose.preventDefault).not.toHaveBeenCalled();

    controller.destroy();
    controller.destroy();
    expect(tray.destroy).toHaveBeenCalledOnce();
    expect(app.listenerCount('before-quit')).toBe(0);
    expect(app.listenerCount('will-quit')).toBe(0);
    expect(second.listenerCount('close')).toBe(0);
    expect(second.listenerCount('query-session-end')).toBe(0);
    expect(second.listenerCount('session-end')).toBe(0);
  });
});
