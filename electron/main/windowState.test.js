import Module from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalModuleLoad = Module._load;
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

function createWindowDouble() {
  const windowListeners = new Map();
  const webContentsListeners = new Map();
  let windowOpenHandler = null;
  const webContents = {
    getURL: vi.fn(() => 'file:///app/dist/index.html'),
    on: vi.fn((event, callback) => webContentsListeners.set(event, callback)),
    openDevTools: vi.fn(),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn((callback) => {
      windowOpenHandler = callback;
    }),
  };
  const win = {
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    on: vi.fn((event, callback) => windowListeners.set(event, callback)),
    once: vi.fn((event, callback) => windowListeners.set(event, callback)),
    setAppDetails: vi.fn(),
    setBackgroundColor: vi.fn(),
    setThumbarButtons: vi.fn(),
    setTitleBarOverlay: vi.fn(),
    show: vi.fn(),
    webContents,
  };
  return {
    webContentsListeners,
    windowListeners,
    getWindowOpenHandler: () => windowOpenHandler,
    win,
  };
}

async function loadWindowState({ isDev = false, openDevTools = false } = {}) {
  vi.resetModules();
  const windowDouble = createWindowDouble();
  const renderGlyphPng = vi.fn((glyph, options) =>
    Buffer.from(`${glyph}:${options.size}`),
  );
  const image = { addRepresentation: vi.fn() };
  const electron = {
    app: {
      getAppPath: vi.fn(() => 'E:\\Utawakui'),
    },
    BrowserWindow: vi.fn(function BrowserWindow(options) {
      windowDouble.options = options;
      return windowDouble.win;
    }),
    nativeImage: { createFromBuffer: vi.fn(() => image) },
    nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: true },
  };

  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === '../lib/thumbarIcons') return { renderGlyphPng };
    if (request === './runtimeEnvironment') {
      return { readDeveloperOptions: () => ({ isDev, openDevTools }) };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };

  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: 'win32',
  });

  try {
    const imported = await import('./windowState.js');
    return {
      electron,
      image,
      module: imported.default ?? imported,
      renderGlyphPng,
      windowDouble,
    };
  } finally {
    Module._load = originalModuleLoad;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Module._load = originalModuleLoad;
  Object.defineProperty(process, 'platform', originalPlatform);
  vi.resetModules();
});

describe('windowState security boundary', () => {
  it('creates a sandboxed hidden window with bounded startup arguments', async () => {
    const { electron, module, windowDouble } = await loadWindowState();

    const win = module.createMainWindow('light', 320, 'capture-device', {
      startupTraceEnabled: true,
    });

    expect(win).toBe(windowDouble.win);
    expect(electron.BrowserWindow).toHaveBeenCalledOnce();
    expect(windowDouble.options).toMatchObject({
      width: 1280,
      height: 850,
      minWidth: 960,
      minHeight: 650,
      show: false,
      title: 'Utawakui',
      backgroundColor: '#f7f1e7',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        additionalArguments: [
          '--ui-theme=light',
          '--sidebar-width=320',
          '--capture-device-id=capture-device',
          '--startup-trace-enabled=1',
        ],
      },
    });
    expect(windowDouble.options.webPreferences.preload).toMatch(
      /electron[\\/]preload\.js$/,
    );
    expect(windowDouble.win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/dist[\\/]index\.html$/),
    );
    expect(windowDouble.win.loadURL).not.toHaveBeenCalled();
    expect(windowDouble.win.setAppDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'com.utawakui.app',
        relaunchDisplayName: 'Utawakui',
      }),
    );
  });

  it('denies new windows and prevents navigation away from the loaded document', async () => {
    const { module, windowDouble } = await loadWindowState();
    module.createMainWindow();

    expect(windowDouble.getWindowOpenHandler()()).toEqual({ action: 'deny' });

    const willNavigate = windowDouble.webContentsListeners.get('will-navigate');
    const externalEvent = { preventDefault: vi.fn() };
    willNavigate(externalEvent, 'https://example.test');
    expect(externalEvent.preventDefault).toHaveBeenCalledOnce();

    const sameDocumentEvent = { preventDefault: vi.fn() };
    willNavigate(sameDocumentEvent, 'file:///app/dist/index.html');
    expect(sameDocumentEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('shows only after ready and clears the singleton after close', async () => {
    const { module, windowDouble } = await loadWindowState();
    module.createMainWindow();

    expect(module.getMainWindow()).toBe(windowDouble.win);
    expect(windowDouble.win.show).not.toHaveBeenCalled();

    windowDouble.windowListeners.get('ready-to-show')();
    expect(windowDouble.win.show).toHaveBeenCalledOnce();

    windowDouble.windowListeners.get('closed')();
    expect(module.getMainWindow()).toBeNull();
    module.notifyLibraryUpdated({ reason: 'test' });
    module.sendBackfillStatus({ running: true });
    expect(windowDouble.win.webContents.send).not.toHaveBeenCalled();
  });

  it('uses the development URL and opens tools only when explicitly enabled', async () => {
    const { module, windowDouble } = await loadWindowState({
      isDev: true,
      openDevTools: true,
    });
    module.createMainWindow();

    expect(windowDouble.win.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173',
    );
    expect(windowDouble.win.loadFile).not.toHaveBeenCalled();

    windowDouble.windowListeners.get('ready-to-show')();
    expect(windowDouble.win.webContents.openDevTools).toHaveBeenCalledOnce();
    expect(windowDouble.win.setAppDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: expect.stringMatching(/^com\.utawakui\.app\.dev/),
      }),
    );
  });
});

describe('windowState playback projection', () => {
  it('normalizes renderer state and exposes only a fixed toggle command', async () => {
    const { module, renderGlyphPng, windowDouble } = await loadWindowState();
    const ipcMain = { on: vi.fn() };
    module.createMainWindow();
    windowDouble.windowListeners.get('ready-to-show')();
    module.registerPlayerStateHandler(ipcMain);
    const playerStateListener = ipcMain.on.mock.calls[0][1];

    expect(ipcMain.on).toHaveBeenCalledWith(
      'player:state',
      expect.any(Function),
    );
    expect(windowDouble.win.setThumbarButtons).toHaveBeenCalledTimes(1);
    expect(renderGlyphPng).toHaveBeenCalledTimes(6);

    playerStateListener({}, { isPlaying: 'yes', hasTrack: 1 });
    expect(windowDouble.win.setThumbarButtons).toHaveBeenCalledTimes(2);
    const buttons = windowDouble.win.setThumbarButtons.mock.calls.at(-1)[0];
    expect(buttons[1]).toMatchObject({
      tooltip: '暫停',
      flags: [],
    });

    buttons[1].click();
    expect(windowDouble.win.webContents.send).toHaveBeenCalledWith(
      'player:command',
      'toggle',
    );

    playerStateListener({}, { isPlaying: true, hasTrack: true });
    expect(windowDouble.win.setThumbarButtons).toHaveBeenCalledTimes(2);
    expect(renderGlyphPng).toHaveBeenCalledTimes(8);
  });

  it('projects library notifications only while a window exists', async () => {
    const { module, windowDouble } = await loadWindowState();
    module.notifyLibraryUpdated({ ignored: true });
    module.sendBackfillStatus({ ignored: true });

    module.createMainWindow();
    module.notifyLibraryUpdated({ reason: 'metadata' });
    module.sendBackfillStatus({ running: true });

    expect(windowDouble.win.webContents.send).toHaveBeenNthCalledWith(
      1,
      'library:updated',
      { reason: 'metadata' },
    );
    expect(windowDouble.win.webContents.send).toHaveBeenNthCalledWith(
      2,
      'library:backfill-status',
      { running: true },
    );
  });
});
