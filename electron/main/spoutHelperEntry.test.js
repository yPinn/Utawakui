import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import spoutHelperEntryModule from './spoutHelperEntry.js';
import spoutOutputContractModule from '../../shared/spoutOutputContract.js';

const { createSpoutHelperController } = spoutHelperEntryModule;
const { createSpoutConfigureMessage, SPOUT_LYRICS_SURFACE } =
  spoutOutputContractModule;

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.setFrameRate = vi.fn();
    this.setWindowOpenHandler = vi.fn();
    this.session = {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
    };
  }
}

class FakeBrowserWindow extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.webContents = new FakeWebContents();
    this.loadURL = vi.fn(async () => undefined);
    this.setContentSize = vi.fn();
    this.destroy = vi.fn();
    this.isDestroyed = vi.fn(() => false);
    FakeBrowserWindow.instances.push(this);
  }
}

function validConfiguration(frameRateProfile = 'standard') {
  return createSpoutConfigureMessage(
    {
      running: true,
      httpUrl: 'http://127.0.0.1:8700',
    },
    frameRateProfile,
  );
}

function createBridge() {
  const sender = { stop: vi.fn() };
  return {
    sender,
    module: {
      listSenders: vi.fn(() => []),
      TextureSender: vi.fn(function TextureSender() {
        return sender;
      }),
      sendTextureFromPaintEvent: vi.fn(),
    },
  };
}

function createTexture(overrides = {}) {
  return {
    textureInfo: {
      pixelFormat: 'bgra',
      codedSize: { width: 1920, height: 1080 },
      visibleRect: { x: 0, y: 0, width: 1920, height: 1080 },
      widgetType: 'frame',
      colorSpace: {
        primaries: 'bt709',
        transfer: 'srgb',
        matrix: 'rgb',
        range: 'full',
      },
      handle: { ntHandle: Buffer.alloc(8) },
      ...overrides,
    },
    release: vi.fn(),
  };
}

describe('Spout helper controller', () => {
  it('owns a hidden transparent sandboxed OSR surface and forwards its first texture', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const loadBridge = vi.fn(() => bridge.module);
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge,
      sendToParent,
    });

    await controller.start(validConfiguration());

    const window = FakeBrowserWindow.instances[0];
    expect(loadBridge).toHaveBeenCalledOnce();
    expect(bridge.module.TextureSender).toHaveBeenCalledWith(
      'Utawakui.Lyrics',
      1920,
      1080,
    );
    expect(window.options).toMatchObject({
      width: 1920,
      height: 1080,
      show: false,
      frame: false,
      thickFrame: false,
      useContentSize: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        partition: 'spout-helper',
        offscreen: {
          useSharedTexture: true,
          sharedTexturePixelFormat: 'argb',
          deviceScaleFactor: 1,
        },
      },
    });
    expect(window.webContents.setFrameRate).toHaveBeenCalledWith(60);
    expect(window.setContentSize).toHaveBeenCalledWith(1920, 1080, false);
    expect(window.loadURL).toHaveBeenCalledWith(
      'http://127.0.0.1:8700/overlay/lyrics',
    );

    const texture = createTexture();
    window.webContents.emit('paint', { texture });

    expect(bridge.module.sendTextureFromPaintEvent).toHaveBeenCalledWith(
      bridge.sender,
      texture.textureInfo,
    );
    expect(texture.release).toHaveBeenCalledOnce();
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
  });

  it('uses the selected bounded frame rate without changing the surface identity', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent: vi.fn(),
    });

    await controller.start(validConfiguration('reduced'));

    expect(
      FakeBrowserWindow.instances[0].webContents.setFrameRate,
    ).toHaveBeenCalledWith(30);
    expect(bridge.module.TextureSender).toHaveBeenCalledWith(
      'Utawakui.Lyrics',
      1920,
      1080,
    );
  });

  it('rejects an occupied fixed sender name before creating native output', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    bridge.module.listSenders.mockReturnValue([
      { name: 'Utawakui.Lyrics' },
      { name: 'Unrelated' },
    ]);
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
    });

    await expect(controller.start(validConfiguration())).resolves.toBe(false);

    expect(bridge.module.TextureSender).not.toHaveBeenCalled();
    expect(FakeBrowserWindow.instances).toHaveLength(0);
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SENDER_NAME_IN_USE',
    });
  });

  it('treats sender-name casing as the same fixed identity', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    bridge.module.listSenders.mockReturnValue([{ name: 'utawakui.lyrics' }]);
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
    });

    await expect(controller.start(validConfiguration())).resolves.toBe(false);
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SENDER_NAME_IN_USE',
    });
  });

  it('releases the native sender if the offscreen surface cannot be created', async () => {
    const bridge = createBridge();
    const sendToParent = vi.fn();
    class ThrowingBrowserWindow {
      constructor() {
        throw new Error('C:\\private\\gpu-process failed');
      }
    }
    const controller = createSpoutHelperController({
      BrowserWindow: ThrowingBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
      logger: { error: vi.fn() },
    });

    await expect(controller.start(validConfiguration())).resolves.toBe(false);
    expect(bridge.sender.stop).toHaveBeenCalledOnce();
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_RENDERER_LOAD_FAILED',
    });
    expect(JSON.stringify(sendToParent.mock.calls)).not.toContain('private');
  });

  it('denies popups, permissions, and navigation away from the exact loopback route', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent: vi.fn(),
    });
    await controller.start(validConfiguration());
    const webContents = FakeBrowserWindow.instances[0].webContents;

    expect(webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
      action: 'deny',
    });
    expect(
      webContents.session.setPermissionCheckHandler.mock.calls[0][0](),
    ).toBe(false);
    const permissionCallback = vi.fn();
    webContents.session.setPermissionRequestHandler.mock.calls[0][0](
      webContents,
      'media',
      permissionCallback,
    );
    expect(permissionCallback).toHaveBeenCalledWith(false);

    const blockedEvent = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', blockedEvent, 'https://example.com');
    expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();

    const allowedEvent = { preventDefault: vi.fn() };
    webContents.emit(
      'will-navigate',
      allowedEvent,
      'http://127.0.0.1:8700/overlay/lyrics',
    );
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('always releases Chromium textures and reports only bounded helper errors', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const nativeError = new Error('C:\\private\\driver.dll access violation');
    bridge.module.sendTextureFromPaintEvent.mockImplementation(() => {
      throw nativeError;
    });
    const sendToParent = vi.fn();
    const logger = { error: vi.fn() };
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
      logger,
    });
    await controller.start(validConfiguration());

    const texture = createTexture();
    FakeBrowserWindow.instances[0].webContents.emit('paint', { texture });

    expect(texture.release).toHaveBeenCalledOnce();
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_TEXTURE_SEND_FAILED',
    });
    expect(JSON.stringify(sendToParent.mock.calls)).not.toContain('private');
    expect(logger.error).toHaveBeenCalledWith(
      '[spout-helper] Failed to forward shared texture',
      nativeError,
    );
  });

  it('rejects a texture that does not match the fixed output surface', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
    });
    await controller.start(validConfiguration());

    const texture = createTexture({
      codedSize: { width: 1280, height: 720 },
    });
    FakeBrowserWindow.instances[0].webContents.emit('paint', { texture });

    expect(bridge.module.sendTextureFromPaintEvent).not.toHaveBeenCalled();
    expect(texture.release).toHaveBeenCalledOnce();
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SURFACE_INVALID',
    });
  });

  it('rejects non-BGRA or cropped texture metadata', async () => {
    for (const overrides of [
      { pixelFormat: 'rgba' },
      { visibleRect: { x: 4, y: 0, width: 1916, height: 1080 } },
    ]) {
      FakeBrowserWindow.instances = [];
      const bridge = createBridge();
      const sendToParent = vi.fn();
      const controller = createSpoutHelperController({
        BrowserWindow: FakeBrowserWindow,
        loadBridge: () => bridge.module,
        sendToParent,
      });
      await controller.start(validConfiguration());
      const texture = createTexture(overrides);

      FakeBrowserWindow.instances[0].webContents.emit('paint', { texture });

      expect(texture.release).toHaveBeenCalledOnce();
      expect(bridge.module.sendTextureFromPaintEvent).not.toHaveBeenCalled();
      expect(sendToParent).toHaveBeenCalledWith({
        contractVersion: 1,
        type: 'error',
        code: 'SPOUT_SURFACE_INVALID',
      });
    }
  });

  it('bounds consecutive shared-texture defects instead of staying silently black', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    bridge.module.sendTextureFromPaintEvent.mockReturnValue({
      reason: 'no-nt-handle',
    });
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
      maxConsecutivePaintDefects: 3,
    });
    await controller.start(validConfiguration());

    const textures = [createTexture(), createTexture(), createTexture()];
    for (const texture of textures) {
      FakeBrowserWindow.instances[0].webContents.emit('paint', { texture });
    }

    expect(
      textures.every((texture) => texture.release.mock.calls.length === 1),
    ).toBe(true);
    expect(sendToParent).toHaveBeenCalledTimes(1);
    expect(sendToParent).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SHARED_TEXTURE_UNAVAILABLE',
    });
    expect(bridge.sender.stop).toHaveBeenCalledOnce();
  });

  it.each(['render-process-gone', 'unresponsive'])(
    'reports %s as a bounded renderer failure',
    async (eventName) => {
      FakeBrowserWindow.instances = [];
      const bridge = createBridge();
      const sendToParent = vi.fn();
      const controller = createSpoutHelperController({
        BrowserWindow: FakeBrowserWindow,
        loadBridge: () => bridge.module,
        sendToParent,
      });
      await controller.start(validConfiguration());

      FakeBrowserWindow.instances[0].webContents.emit(
        eventName,
        {},
        {
          reason: 'crashed',
        },
      );

      expect(sendToParent).toHaveBeenCalledWith({
        contractVersion: 1,
        type: 'error',
        code: 'SPOUT_RENDERER_FAILED',
      });
      expect(bridge.sender.stop).toHaveBeenCalledOnce();
    },
  );

  it('stops the native sender and window exactly once', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent: vi.fn(),
    });
    await controller.start(validConfiguration());

    controller.stop();
    controller.stop();

    expect(bridge.sender.stop).toHaveBeenCalledOnce();
    expect(FakeBrowserWindow.instances[0].destroy).toHaveBeenCalledOnce();
  });

  it('releases a queued paint after stop without touching the stopped sender', async () => {
    FakeBrowserWindow.instances = [];
    const bridge = createBridge();
    const sendToParent = vi.fn();
    const controller = createSpoutHelperController({
      BrowserWindow: FakeBrowserWindow,
      loadBridge: () => bridge.module,
      sendToParent,
    });
    await controller.start(validConfiguration());
    controller.stop();

    const texture = createTexture();
    FakeBrowserWindow.instances[0].webContents.emit('paint', { texture });

    expect(texture.release).toHaveBeenCalledOnce();
    expect(bridge.module.sendTextureFromPaintEvent).not.toHaveBeenCalled();
    expect(sendToParent).not.toHaveBeenCalled();
  });
});
