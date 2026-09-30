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
  isMaximized = () => false;
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
  setFullScreen = vi.fn((value) => {
    this.fullScreen = value;
  });
  close = vi.fn(() => {
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
    window.webContents.emit('did-finish-load');
    expect(window.webContents.send).toHaveBeenCalledWith(
      'performer-view:snapshot',
      snapshot,
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
      y: 210,
      width: 960,
      height: 460,
      minWidth: 800,
      minHeight: 360,
    });
  });
});
