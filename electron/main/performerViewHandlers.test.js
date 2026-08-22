import { describe, expect, it, vi } from 'vitest';
import performerViewHandlersModule from './performerViewHandlers.js';

const { registerPerformerViewHandlers } = performerViewHandlersModule;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('performer view handlers', () => {
  it('publishes before opening and delegates read-only window commands', async () => {
    const ipcMain = createIpcMain();
    const manager = {
      publish: vi.fn(() => true),
      open: vi.fn(() => ({ open: true })),
      getStatus: vi.fn(() => ({ open: true })),
      getSnapshot: vi.fn(() => ({ version: 1 })),
      close: vi.fn(() => ({ open: false })),
      minimize: vi.fn(() => ({ open: true })),
      toggleFullScreen: vi.fn(() => ({ fullScreen: true })),
      toggleAlwaysOnTop: vi.fn(() => ({ alwaysOnTop: true })),
    };
    registerPerformerViewHandlers({ ipcMain, manager });

    const snapshot = { version: 1 };
    expect(ipcMain.handlers.get('performer-view:open')(null, snapshot)).toEqual(
      { open: true },
    );
    expect(manager.publish).toHaveBeenCalledWith(snapshot);
    expect(manager.publish.mock.invocationCallOrder[0]).toBeLessThan(
      manager.open.mock.invocationCallOrder[0],
    );

    await ipcMain.handlers.get('performer-view:get-snapshot')();
    await ipcMain.handlers.get('performer-view:get-status')();
    await ipcMain.handlers.get('performer-view:toggle-full-screen')();
    await ipcMain.handlers.get('performer-view:toggle-always-on-top')();
    await ipcMain.handlers.get('performer-view:minimize')();
    await ipcMain.handlers.get('performer-view:close')();
    expect(manager.getSnapshot).toHaveBeenCalledOnce();
    expect(manager.getStatus).toHaveBeenCalledOnce();
    expect(manager.toggleFullScreen).toHaveBeenCalledOnce();
    expect(manager.toggleAlwaysOnTop).toHaveBeenCalledOnce();
    expect(manager.minimize).toHaveBeenCalledOnce();
    expect(manager.close).toHaveBeenCalledOnce();
  });
});
