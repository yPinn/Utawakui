import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import outputWindow from './outputWindow.js';
import runtimeModule from '../outputRuntime.js';

const { createOutputWindowManager, resolveOutputWindowSurface } = outputWindow;
class Contents extends EventEmitter {
  session = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  });
  setWindowOpenHandler = vi.fn();
  setAudioMuted = vi.fn();
  setZoomFactor = vi.fn();
}
class Window extends EventEmitter {
  static windows = [];
  constructor(options) {
    super();
    this.options = options;
    this.webContents = new Contents();
    this.size = [options.width, options.height];
    Window.windows.push(this);
  }
  destroyed = false;
  isDestroyed = () => this.destroyed;
  isMinimized = () => true;
  restore = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  setMenu = vi.fn();
  loadURL = vi.fn(async () => {});
  setContentSize = vi.fn((w, h) => {
    this.size = [w, h];
  });
  destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit('closed');
  });
}
function setup() {
  Window.windows = [];
  let status = { running: true, host: '127.0.0.1', port: 8700 };
  const slots = {};
  const gate = vi.fn();
  const onFailure = vi.fn();
  const manager = createOutputWindowManager({
    BrowserWindow: Window,
    getOutputStatus: () => status,
    getSlot: (kind) => slots[kind],
    requireFeatureGate: gate,
    featureId: 'public-output-flow',
    onFailure,
  });
  return {
    manager,
    gate,
    onFailure,
    slots,
    setStatus: (next) => {
      status = next;
    },
  };
}
describe('read-only output windows', () => {
  it('cleans up on service restart/stop and follows canonical slot updates', async () => {
    Window.windows = [];
    let running = false;
    let manager;
    const runtime = runtimeModule.createOutputRuntime({
      serverFactory: () => ({
        getStatus: () => ({ running, host: '127.0.0.1', port: 8700 }),
        start: async () => {
          running = true;
        },
        stop: async () => {
          running = false;
        },
        setProjectionState: vi.fn(),
        setOverlaySlots: vi.fn(),
      }),
      beforeStop: () => manager.closeAll(),
      onOverlaySlotsChange: () => manager.syncSlots(),
    });
    manager = createOutputWindowManager({
      BrowserWindow: Window,
      getOutputStatus: runtime.getStatus,
      getSlot: runtime.getOverlaySlot,
    });
    await runtime.start();
    await manager.open('now-playing');
    runtime.setOverlaySlots({
      'now-playing': {
        templateId: 'cover-player',
        settings: { captureSize: 'medium' },
      },
    });
    expect(Window.windows[0].size).toEqual([360, 480]);
    const copy = runtime.getOverlaySlot('now-playing');
    copy.settings.captureSize = 'full';
    expect(runtime.getOverlaySlot('now-playing').settings.captureSize).toBe(
      'medium',
    );
    await runtime.reconfigure();
    expect(Window.windows[0].destroyed).toBe(true);
    await manager.open('lyrics');
    const lyrics = Window.windows.at(-1);
    await runtime.stop();
    expect(lyrics.destroyed).toBe(true);
  });
  it('shares pending opens and cannot leave a late window after stop', async () => {
    Window.windows = [];
    let finish;
    class SlowWindow extends Window {
      loadURL = vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    }
    const manager = createOutputWindowManager({
      BrowserWindow: SlowWindow,
      getOutputStatus: () => ({ running: true, host: '127.0.0.1', port: 8700 }),
    });
    const first = manager.open('lyrics');
    const second = manager.open('lyrics');
    expect(Window.windows).toHaveLength(1);
    manager.closeAll();
    finish();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    Window.windows[0].emit('ready-to-show');
    expect(Window.windows[0].show).not.toHaveBeenCalled();
  });
  it.each([
    ['setlist', 480, 810, '歌單'],
    ['lyrics', 1920, 1080, '歌詞'],
    ['now-playing', 480, 270, '播放中'],
  ])(
    'derives %s from the canonical route and size',
    async (kind, width, height, label) => {
      const { manager, gate } = setup();
      const result = await manager.open(kind);
      const win = Window.windows[0];
      expect(result).toEqual({
        kind,
        title: `Utawakui 輸出｜${label}`,
        width,
        height,
      });
      expect(win.loadURL).toHaveBeenCalledWith(
        `http://127.0.0.1:8700/overlay/${kind}`,
      );
      expect(gate).toHaveBeenCalledWith('public-output-flow');
      expect(win.options).toMatchObject({
        width,
        height,
        useContentSize: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        transparent: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          backgroundThrottling: false,
          devTools: false,
          partition: 'output-capture',
          navigateOnDragDrop: false,
          webviewTag: false,
        },
      });
      expect(win.options.webPreferences).not.toHaveProperty('preload');
      expect(win.setContentSize).toHaveBeenCalledWith(width, height, false);
      expect(win.webContents.setAudioMuted).toHaveBeenCalledWith(true);
      const event = { preventDefault: vi.fn() };
      win.emit('page-title-updated', event, 'untrusted song title');
      expect(event.preventDefault).toHaveBeenCalled();
      win.emit('ready-to-show');
      expect(win.show).toHaveBeenCalled();
    },
  );
  it('reuses each kind, denies writes and navigation, and does not touch the default session', async () => {
    const { manager } = setup();
    await manager.open('lyrics');
    await manager.open('lyrics');
    expect(Window.windows).toHaveLength(1);
    const win = Window.windows[0];
    expect(win.restore).toHaveBeenCalled();
    expect(win.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
      action: 'deny',
    });
    expect(
      win.webContents.session.setPermissionCheckHandler.mock.calls[0][0](),
    ).toBe(false);
    const callback = vi.fn();
    win.webContents.session.setPermissionRequestHandler.mock.calls[0][0](
      null,
      'local-fonts',
      callback,
    );
    expect(callback).toHaveBeenCalledWith(false);
    for (const url of [
      'file:///private',
      'https://example.com',
      'http://127.0.0.1:8700/overlay/setlist',
    ]) {
      const e = { preventDefault: vi.fn() };
      win.webContents.emit('will-navigate', e, url);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    const download = { preventDefault: vi.fn() };
    win.webContents.session.emit('will-download', download);
    expect(download.preventDefault).toHaveBeenCalled();
    const main = new EventEmitter();
    manager.attachMainWindow(main);
    main.emit('hide');
    expect(win.destroyed).toBe(false);
    main.emit('closed');
    expect(win.destroyed).toBe(true);
  });
  it('follows saved template sizes without changing the title or route', async () => {
    const { manager, slots } = setup();
    await manager.open('now-playing');
    slots['now-playing'] = {
      templateId: 'cover-player',
      settings: { captureSize: 'medium' },
    };
    manager.syncSlots();
    expect(Window.windows[0].setContentSize).toHaveBeenLastCalledWith(
      360,
      480,
      false,
    );
    slots['now-playing'].settings.captureSize = 'portrait-large';
    manager.syncSlots();
    expect(Window.windows[0].setContentSize).toHaveBeenLastCalledWith(
      480,
      640,
      false,
    );
    expect(Window.windows).toHaveLength(1);
    expect(Window.windows[0].loadURL).toHaveBeenCalledTimes(1);
    manager.closeAll();
    expect(Window.windows[0].destroyed).toBe(true);
  });
  it('rejects disabled gates, stopped servers, non-loopback hosts and arbitrary intents', async () => {
    const s = setup();
    s.gate.mockImplementation(() => {
      throw new Error('gate disabled');
    });
    await expect(s.manager.open('lyrics')).rejects.toThrow('gate disabled');
    s.gate.mockReset();
    for (const status of [
      { running: false, host: '127.0.0.1', port: 8700 },
      { running: true, host: 'example.com', port: 8700 },
      { running: true, host: '127.0.0.1', port: NaN },
    ]) {
      s.setStatus(status);
      await expect(s.manager.open('lyrics')).rejects.toThrow();
    }
    for (const kind of ['../lyrics', 'https://example.com', {}, '__proto__'])
      expect(() =>
        resolveOutputWindowSurface(kind, {
          running: true,
          host: '127.0.0.1',
          port: 8700,
        }),
      ).toThrow();
    expect(Window.windows).toHaveLength(0);
  });
  it('cleans up failed loads and renderer crashes so opening can retry', async () => {
    const { manager, onFailure } = setup();
    // Instance methods are initialized during construction; use an injected subclass.
    class FailedWindow extends Window {
      loadURL = vi.fn(async () => {
        throw new Error('private URL');
      });
    }
    const failed = createOutputWindowManager({
      BrowserWindow: FailedWindow,
      getOutputStatus: () => ({ running: true, host: '127.0.0.1', port: 8700 }),
    });
    await expect(failed.open('lyrics')).rejects.toThrow('private URL');
    expect(Window.windows[0].destroyed).toBe(true);
    await manager.open('lyrics');
    const win = Window.windows.at(-1);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(win.destroyed).toBe(true);
    await manager.open('lyrics');
    expect(Window.windows.at(-1)).not.toBe(win);
  });
});
