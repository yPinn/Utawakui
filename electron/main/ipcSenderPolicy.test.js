import { describe, expect, it, vi } from 'vitest';
import ipcSenderPolicyModule from './ipcSenderPolicy.js';

const { createTrustedIpcMain, IPC_CAPABILITIES, IPC_CHANNEL_CAPABILITIES } =
  ipcSenderPolicyModule;

function createIpcMainDouble() {
  const handles = new Map();
  const listeners = new Map();
  return {
    handles,
    listeners,
    handle: vi.fn((channel, listener) => handles.set(channel, listener)),
    on: vi.fn((channel, listener) => listeners.set(channel, listener)),
    removeHandler: vi.fn((channel) => handles.delete(channel)),
  };
}

function createWebContents(name) {
  return {
    name,
    mainFrame: { name: `${name}-main-frame` },
    isDestroyed: vi.fn(() => false),
  };
}

function createEvent(webContents, frame = webContents.mainFrame) {
  return { sender: webContents, senderFrame: frame };
}

describe('trusted IPC main boundary', () => {
  it('defaults every channel to the main window main frame', async () => {
    const rawIpcMain = createIpcMainDouble();
    const main = createWebContents('main');
    const performer = createWebContents('performer');
    const trusted = createTrustedIpcMain({
      ipcMain: rawIpcMain,
      getMainWebContents: () => main,
      getPerformerWebContents: () => performer,
    });
    const handler = vi.fn((_event, value) => `accepted:${value}`);
    trusted.handle('library:delete-track', handler);

    await expect(
      rawIpcMain.handles.get('library:delete-track')(
        createEvent(main),
        'track-a',
      ),
    ).resolves.toBe('accepted:track-a');
    await expect(
      rawIpcMain.handles.get('library:delete-track')(
        createEvent(performer),
        'track-a',
      ),
    ).rejects.toMatchObject({ code: 'IPC_SENDER_UNTRUSTED' });
    await expect(
      rawIpcMain.handles.get('library:delete-track')(
        createEvent(main, { name: 'iframe' }),
        'track-a',
      ),
    ).rejects.toMatchObject({ code: 'IPC_SENDER_UNTRUSTED' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('applies explicit performer-only and shared channel capabilities', async () => {
    const rawIpcMain = createIpcMainDouble();
    const main = createWebContents('main');
    const performer = createWebContents('performer');
    const trusted = createTrustedIpcMain({
      ipcMain: rawIpcMain,
      getMainWebContents: () => main,
      getPerformerWebContents: () => performer,
      channelCapabilities: IPC_CHANNEL_CAPABILITIES,
    });

    trusted.handle('performer-view:close', () => 'closed');
    trusted.handle('performer-view:get-status', () => 'status');
    trusted.handle('diagnostics:record-renderer', () => 'recorded');

    await expect(
      rawIpcMain.handles.get('performer-view:close')(createEvent(performer)),
    ).resolves.toBe('closed');
    await expect(
      rawIpcMain.handles.get('performer-view:close')(createEvent(main)),
    ).rejects.toMatchObject({ code: 'IPC_SENDER_UNTRUSTED' });

    for (const channel of [
      'performer-view:get-status',
      'diagnostics:record-renderer',
    ]) {
      await expect(
        rawIpcMain.handles.get(channel)(createEvent(main)),
      ).resolves.toBe(channel.includes('status') ? 'status' : 'recorded');
      await expect(
        rawIpcMain.handles.get(channel)(createEvent(performer)),
      ).resolves.toBe(channel.includes('status') ? 'status' : 'recorded');
    }

    expect(IPC_CAPABILITIES).toEqual({
      MAIN: 'main',
      PERFORMER: 'performer',
      MAIN_OR_PERFORMER: 'main-or-performer',
    });
    expect(IPC_CHANNEL_CAPABILITIES).toEqual({
      'diagnostics:record-renderer': 'main-or-performer',
      'performer-view:get-status': 'main-or-performer',
      'performer-view:get-snapshot': 'main-or-performer',
      'performer-view:close': 'performer',
      'performer-view:minimize': 'performer',
      'performer-view:toggle-full-screen': 'performer',
      'performer-view:toggle-always-on-top': 'performer',
    });
  });

  it('drops untrusted event messages and reports each rejected boundary once', () => {
    const rawIpcMain = createIpcMainDouble();
    const main = createWebContents('main');
    const performer = createWebContents('performer');
    const onRejected = vi.fn();
    const trusted = createTrustedIpcMain({
      ipcMain: rawIpcMain,
      getMainWebContents: () => main,
      getPerformerWebContents: () => performer,
      onRejected,
    });
    const listener = vi.fn();
    trusted.on('player:state', listener);

    const guardedListener = rawIpcMain.listeners.get('player:state');
    guardedListener(createEvent(performer), { isPlaying: true });
    guardedListener(createEvent(performer), { isPlaying: false });

    expect(listener).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledOnce();
    expect(onRejected).toHaveBeenCalledWith({
      capability: 'main',
      channel: 'player:state',
      kind: 'event',
    });
  });

  it('delegates handler cleanup without exposing the raw IPC object', () => {
    const rawIpcMain = createIpcMainDouble();
    const trusted = createTrustedIpcMain({
      ipcMain: rawIpcMain,
      getMainWebContents: () => null,
      getPerformerWebContents: () => null,
    });

    trusted.removeHandler('window-close:present');

    expect(rawIpcMain.removeHandler).toHaveBeenCalledWith(
      'window-close:present',
    );
  });
});
