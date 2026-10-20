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
  it('strips toolbar intent payloads before forwarding and rejects arbitrary controls', () => {
    const ipcMain = createIpcMain(),
      sendControlIntent = vi.fn(() => true);
    registerPerformerViewHandlers({ ipcMain, manager: {}, sendControlIntent });
    const handle = ipcMain.handlers.get('performer-view:control');
    expect(
      handle(null, {
        action: 'play',
        revision: 3,
        trackId: 'a',
        url: 'private',
      }),
    ).toBe(true);
    expect(sendControlIntent).toHaveBeenCalledWith({
      action: 'play',
      revision: 3,
      trackId: 'a',
    });
    expect(() =>
      handle(null, { action: 'next', revision: 3, trackId: 'a' }),
    ).toThrow('control intent');
  });
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

  it('relays only bounded lyrics intents and persists a valid reading scale', () => {
    const ipcMain = createIpcMain();
    const manager = {
      publish: vi.fn(),
      open: vi.fn(),
      getStatus: vi.fn(),
      getSnapshot: vi.fn(),
      close: vi.fn(),
      minimize: vi.fn(),
      toggleFullScreen: vi.fn(),
      toggleAlwaysOnTop: vi.fn(),
    };
    const sendLyricsOffsetIntent = vi.fn(() => true);
    const getConfig = vi.fn(() => ({ performerReadingScale: 'stage' }));
    const updateConfig = vi.fn((value) => value);
    registerPerformerViewHandlers({
      ipcMain,
      manager,
      sendLyricsOffsetIntent,
      getConfig,
      updateConfig,
    });

    const intent = { action: 'delay', revision: 4, trackId: 'track-1' };
    expect(
      ipcMain.handlers.get('performer-view:adjust-lyrics-offset')(null, intent),
    ).toBe(true);
    expect(sendLyricsOffsetIntent).toHaveBeenCalledWith(intent);
    expect(ipcMain.handlers.get('performer-view:get-reading-scale')()).toBe(
      'stage',
    );
    expect(
      ipcMain.handlers.get('performer-view:set-reading-scale')(null, 'near'),
    ).toBe('near');
    expect(updateConfig).toHaveBeenCalledWith({
      performerReadingScale: 'near',
    });

    expect(() =>
      ipcMain.handlers.get('performer-view:adjust-lyrics-offset')(null, {
        action: 'seek',
        revision: 4,
        trackId: 'track-1',
      }),
    ).toThrow('Invalid performer lyrics offset intent');
    expect(() =>
      ipcMain.handlers.get('performer-view:set-reading-scale')(null, 'giant'),
    ).toThrow('Invalid performer reading scale');
  });
});
