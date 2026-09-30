import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import startupTraceProbeModule from './startupTraceProbe.js';

const { createStartupTraceProbe } = startupTraceProbeModule;

describe('startup trace overlay probe', () => {
  it('loads one hidden loopback overlay and denies child windows', () => {
    const windows = [];
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.loadURL = vi.fn();
        this.destroy = vi.fn();
        this.isDestroyed = vi.fn(() => false);
        this.webContents = new EventEmitter();
        this.webContents.setWindowOpenHandler = vi.fn();
        windows.push(this);
      }
    }
    const probe = createStartupTraceProbe({ BrowserWindow: FakeBrowserWindow });

    expect(probe.start('http://127.0.0.1:8700')).toBe(true);
    expect(probe.start('http://127.0.0.1:8700')).toBe(false);
    expect(windows).toHaveLength(1);
    expect(windows[0].options).toMatchObject({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        navigateOnDragDrop: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: false,
      },
    });
    expect(windows[0].loadURL).toHaveBeenCalledWith(
      'http://127.0.0.1:8700/overlay/lyrics?startupTrace=1',
    );
    expect(
      windows[0].webContents.setWindowOpenHandler.mock.calls[0][0](),
    ).toEqual({ action: 'deny' });

    for (const eventName of ['will-navigate', 'will-redirect']) {
      const blockedEvent = { preventDefault: vi.fn() };
      windows[0].webContents.emit(
        eventName,
        blockedEvent,
        'https://example.com/',
      );
      expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();

      const allowedEvent = { preventDefault: vi.fn() };
      windows[0].webContents.emit(
        eventName,
        allowedEvent,
        'http://127.0.0.1:8700/overlay/lyrics?startupTrace=1',
      );
      expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
    }

    probe.stop();
    expect(windows[0].destroy).toHaveBeenCalledOnce();
  });

  it.each([
    'https://127.0.0.1:8700',
    'http://localhost:8700',
    'http://127.0.0.1:8700/path',
    'file:///overlay/lyrics',
  ])('rejects a non-canonical listener URL: %s', (url) => {
    const probe = createStartupTraceProbe({ BrowserWindow: vi.fn() });
    expect(() => probe.start(url)).toThrow(TypeError);
  });
});
