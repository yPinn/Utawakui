import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import windowCloseDecisionBridgeModule from './windowCloseDecisionBridge.js';

const { createWindowCloseDecisionBridge } = windowCloseDecisionBridgeModule;
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

function createIpcMain() {
  const handlers = new Map();
  return {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel) => handlers.delete(channel)),
    async invoke(channel, event, ...args) {
      return handlers.get(channel)(event, ...args);
    },
  };
}

function createWindowDouble() {
  const win = new EventEmitter();
  win.isDestroyed = vi.fn(() => false);
  win.webContents = new EventEmitter();
  win.webContents.send = vi.fn();
  win.webContents.isDestroyed = vi.fn(() => false);
  return win;
}

function createHarness(overrides = {}) {
  const ipcMain = createIpcMain();
  const win = createWindowDouble();
  const bridge = createWindowCloseDecisionBridge({
    ipcMain,
    getAllowedWindow: () => win,
    createRequestId: () => REQUEST_ID,
    acknowledgementTimeoutMs: 1000,
    ...overrides,
  });
  return { bridge, ipcMain, win };
}

describe('windowCloseDecisionBridge', () => {
  it('accepts one exact decision only after the trusted renderer presents it', async () => {
    const { bridge, ipcMain, win } = createHarness();
    const decisionPromise = bridge.requestDecision(win);

    expect(win.webContents.send).toHaveBeenCalledWith('window-close:request', {
      requestId: REQUEST_ID,
    });
    await expect(
      ipcMain.invoke(
        'window-close:present',
        { sender: { id: 'other-renderer' } },
        REQUEST_ID,
      ),
    ).resolves.toBe(false);
    await expect(
      ipcMain.invoke(
        'window-close:present',
        { sender: win.webContents },
        REQUEST_ID,
      ),
    ).resolves.toBe(true);

    await expect(
      ipcMain.invoke(
        'window-close:respond',
        { sender: win.webContents },
        {
          requestId: REQUEST_ID,
          action: 'tray',
          remember: false,
          privatePath: 'E:\\private',
        },
      ),
    ).resolves.toBe(false);
    await expect(
      ipcMain.invoke(
        'window-close:respond',
        { sender: win.webContents },
        { requestId: REQUEST_ID, action: 'arbitrary', remember: false },
      ),
    ).resolves.toBe(false);
    await expect(
      ipcMain.invoke(
        'window-close:respond',
        { sender: win.webContents },
        { requestId: REQUEST_ID, action: 'tray', remember: true },
      ),
    ).resolves.toBe(true);

    await expect(decisionPromise).resolves.toEqual({
      action: 'tray',
      remember: true,
    });
    await expect(
      ipcMain.invoke(
        'window-close:respond',
        { sender: win.webContents },
        { requestId: REQUEST_ID, action: 'quit', remember: false },
      ),
    ).resolves.toBe(false);
  });

  it('falls back when the renderer does not acknowledge presentation in time', async () => {
    vi.useFakeTimers();
    const { bridge, ipcMain, win } = createHarness();
    const decisionPromise = bridge.requestDecision(win);
    const rejection = expect(decisionPromise).rejects.toMatchObject({
      code: 'WINDOW_CLOSE_RENDERER_NOT_READY',
    });

    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    await expect(
      ipcMain.invoke(
        'window-close:present',
        { sender: win.webContents },
        REQUEST_ID,
      ),
    ).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('dismisses an acknowledged request when the renderer becomes unresponsive', async () => {
    const { bridge, ipcMain, win } = createHarness();
    const decisionPromise = bridge.requestDecision(win);
    await ipcMain.invoke(
      'window-close:present',
      { sender: win.webContents },
      REQUEST_ID,
    );
    const rejection = expect(decisionPromise).rejects.toMatchObject({
      code: 'WINDOW_CLOSE_RENDERER_UNAVAILABLE',
    });

    win.emit('unresponsive');

    await rejection;
    expect(win.webContents.send).toHaveBeenLastCalledWith(
      'window-close:dismiss',
      { requestId: REQUEST_ID },
    );
  });

  it('removes fixed handlers and rejects a pending request when destroyed', async () => {
    const { bridge, ipcMain, win } = createHarness();
    const decisionPromise = bridge.requestDecision(win);
    const rejection = expect(decisionPromise).rejects.toMatchObject({
      code: 'WINDOW_CLOSE_BRIDGE_DESTROYED',
    });

    bridge.destroy();

    await rejection;
    expect(ipcMain.removeHandler.mock.calls).toEqual([
      ['window-close:present'],
      ['window-close:respond'],
    ]);
  });
});
