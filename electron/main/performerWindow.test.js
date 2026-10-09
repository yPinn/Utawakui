import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import performerWindowModule from './performerWindow.js';

const { createPerformerWindowManager } = performerWindowModule;

class FakeWebContents extends EventEmitter {
  send = vi.fn();
  setWindowOpenHandler = vi.fn();
  getURL = vi.fn(() => 'http://localhost:5173/performer-view.html');
}

class FakeWindow extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.webContents = new FakeWebContents();
    this.destroyed = false;
    this.fullScreen = false;
    this.maximized = false;
    this.alwaysOnTop = false;
    this.bounds = {
      x: options.x ?? 20,
      y: options.y ?? 30,
      width: options.width,
      height: options.height,
    };
    FakeWindow.instances.push(this);
  }

  isDestroyed = () => this.destroyed;
  isFullScreen = () => this.fullScreen;
  isAlwaysOnTop = () => this.alwaysOnTop;
  isMaximized = () => this.maximized;
  isMinimized = () => false;
  getBounds = () => ({ ...this.bounds });
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  restore = vi.fn();
  minimize = vi.fn();
  setAlwaysOnTop = vi.fn((value) => {
    this.alwaysOnTop = value;
  });
  setBackgroundColor = vi.fn();
  setFullScreen = vi.fn((value) => {
    this.fullScreen = value;
  });
  close = vi.fn(() => {
    this.emit('close');
    this.emit('closed');
    this.destroyed = true;
  });
}

describe('performer window manager', () => {
  it('reuses a live window and resends the latest snapshot after load', () => {
    FakeWindow.instances = [];
    const publishStatus = vi.fn();
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: true,
      devUrl: 'http://localhost:5173/performer-view.html',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
      getUiTheme: () => 'dark',
      publishStatus,
    });
    const snapshot = manager.getSnapshot();
    manager.publish(snapshot);
    manager.open();
    manager.open();

    expect(FakeWindow.instances).toHaveLength(1);
    const window = FakeWindow.instances[0];
    expect(manager.getWebContents()).toBe(window.webContents);
    expect(window.focus).toHaveBeenCalled();
    expect(window.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      navigateOnDragDrop: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: true,
    });
    expect(window.options).toMatchObject({
      backgroundColor: '#191a1e',
      title: 'Utawakui 提詞器',
    });
    expect(window.options.webPreferences.additionalArguments).toEqual([
      '--ui-theme=dark',
    ]);
    window.webContents.emit('did-finish-load');
    expect(window.webContents.send).toHaveBeenCalledWith(
      'performer-view:snapshot',
      snapshot,
    );
    expect(window.webContents.send).toHaveBeenCalledWith(
      'performer-view:ui-theme',
      'dark',
    );
    expect(publishStatus).toHaveBeenCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it('remembers geometry and closes with the main window', () => {
    FakeWindow.instances = [];
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: false,
      devUrl: '',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
    });
    const mainWindow = new EventEmitter();
    manager.attachMainWindow(mainWindow);
    manager.open();
    const first = FakeWindow.instances[0];
    first.bounds = { x: 300, y: 120, width: 1280, height: 720 };
    first.emit('resize');
    mainWindow.emit('closed');
    expect(first.close).toHaveBeenCalledOnce();

    manager.open();
    expect(FakeWindow.instances[1].options).toMatchObject({
      x: 300,
      y: 120,
      width: 1280,
      height: 720,
    });
  });

  it('keeps the initial utility window compact and centers it in the work area', () => {
    FakeWindow.instances = [];
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: false,
      devUrl: '',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
      getDisplayWorkArea: () => ({ x: 100, y: 40, width: 1280, height: 800 }),
    });

    manager.open();

    expect(FakeWindow.instances[0].options).toMatchObject({
      x: 260,
      y: 170,
      width: 960,
      height: 540,
      minWidth: 800,
      minHeight: 360,
    });
  });

  it('restores persisted geometry and saves only settled normal bounds', () => {
    vi.useFakeTimers();
    try {
      FakeWindow.instances = [];
      const storedBounds = { x: 2200, y: 100, width: 1280, height: 720 };
      const persistBounds = vi.fn();
      const getDisplayWorkArea = vi.fn(() => ({
        x: 1920,
        y: 0,
        width: 1920,
        height: 1080,
      }));
      const manager = createPerformerWindowManager({
        BrowserWindow: FakeWindow,
        isDev: false,
        devUrl: '',
        pagePath: 'dist/performer-view.html',
        preloadPath: 'performerPreload.js',
        getPersistedBounds: () => storedBounds,
        getDisplayWorkArea,
        persistBounds,
      });

      manager.open();
      const window = FakeWindow.instances[0];
      expect(getDisplayWorkArea).toHaveBeenCalledWith(storedBounds);
      expect(window.options).toMatchObject(storedBounds);

      const nextBounds = { x: 2240, y: 120, width: 1360, height: 768 };
      window.bounds = nextBounds;
      window.emit('resize');
      expect(persistBounds).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(persistBounds).toHaveBeenCalledOnce();
      expect(persistBounds).toHaveBeenLastCalledWith(nextBounds);

      window.fullScreen = true;
      window.bounds = { x: 1920, y: 0, width: 1920, height: 1080 };
      window.emit('resize');
      vi.runAllTimers();
      expect(persistBounds).toHaveBeenCalledOnce();

      window.fullScreen = false;
      window.bounds = nextBounds;
      manager.close();
      expect(persistBounds).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('matches the light native substrate to the v2 renderer canvas', () => {
    FakeWindow.instances = [];
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: false,
      devUrl: '',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
      getUiTheme: () => 'light',
    });

    manager.open();

    expect(FakeWindow.instances[0].options).toMatchObject({
      backgroundColor: '#dad7d0',
    });
    expect(
      FakeWindow.instances[0].options.webPreferences.additionalArguments,
    ).toEqual(['--ui-theme=light']);
  });

  it('defaults an unconfigured performer window to the light theme', () => {
    FakeWindow.instances = [];
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: false,
      devUrl: '',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
    });

    manager.open();

    expect(FakeWindow.instances[0].options).toMatchObject({
      backgroundColor: '#dad7d0',
    });
    expect(
      FakeWindow.instances[0].options.webPreferences.additionalArguments,
    ).toEqual(['--ui-theme=light']);
  });

  it('applies a live theme to the native substrate and renderer', () => {
    FakeWindow.instances = [];
    let uiTheme = 'dark';
    const manager = createPerformerWindowManager({
      BrowserWindow: FakeWindow,
      isDev: false,
      devUrl: '',
      pagePath: 'dist/performer-view.html',
      preloadPath: 'performerPreload.js',
      getUiTheme: () => uiTheme,
    });

    manager.open();
    const window = FakeWindow.instances[0];
    uiTheme = 'light';

    expect(manager.applyUiTheme('light')).toBe(true);
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#dad7d0');
    expect(window.webContents.send).toHaveBeenCalledWith(
      'performer-view:ui-theme',
      'light',
    );

    expect(manager.applyUiTheme('sepia')).toBe(false);
    expect(window.setBackgroundColor).toHaveBeenCalledTimes(1);
  });
});
