'use strict';

const {
  SPOUT_CONTRACT_VERSION,
  isSpoutConfigureMessage,
  isSpoutStopMessage,
} = require('../../shared/spoutOutputContract');

const DEFAULT_MAX_CONSECUTIVE_PAINT_DEFECTS = 30;

function loadNativeBridge() {
  return require('@napolab/texture-bridge-core');
}

function createSpoutHelperController({
  BrowserWindow,
  loadBridge = loadNativeBridge,
  sendToParent,
  logger = console,
  maxConsecutivePaintDefects = DEFAULT_MAX_CONSECUTIVE_PAINT_DEFECTS,
}) {
  let outputWindow = null;
  let sender = null;
  let stopped = false;
  let readySent = false;
  let failureSent = false;
  let consecutivePaintDefects = 0;

  function emitError(code, privateContext) {
    if (failureSent) return;
    failureSent = true;
    logger.error?.('[spout-helper] Helper failure', privateContext ?? code);
    sendToParent({
      contractVersion: SPOUT_CONTRACT_VERSION,
      type: 'error',
      code,
    });
  }

  function failAndStop(code, privateContext) {
    if (stopped || failureSent) return;
    emitError(code, privateContext);
    stop();
  }

  function recordPaintDefect(defect) {
    consecutivePaintDefects += 1;
    if (consecutivePaintDefects < maxConsecutivePaintDefects) return;
    failAndStop('SPOUT_SHARED_TEXTURE_UNAVAILABLE', defect);
  }

  function isExpectedSurfaceTexture(textureInfo, surface) {
    const visibleRect = textureInfo?.visibleRect;
    const colorSpace = textureInfo?.colorSpace;
    return Boolean(
      textureInfo?.pixelFormat === 'bgra' &&
      textureInfo.codedSize?.width === surface.width &&
      textureInfo.codedSize?.height === surface.height &&
      visibleRect?.x === 0 &&
      visibleRect?.y === 0 &&
      visibleRect?.width === surface.width &&
      visibleRect?.height === surface.height &&
      textureInfo.widgetType === 'frame' &&
      colorSpace?.primaries === 'bt709' &&
      colorSpace?.transfer === 'srgb' &&
      colorSpace?.matrix === 'rgb' &&
      colorSpace?.range === 'full',
    );
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      sender?.stop?.();
    } catch (error) {
      logger.error?.('[spout-helper] Failed to stop texture sender', error);
    }
    sender = null;
    if (outputWindow && !outputWindow.isDestroyed?.()) {
      outputWindow.destroy();
    }
    outputWindow = null;
  }

  async function start(configuration) {
    if (!isSpoutConfigureMessage(configuration)) {
      emitError('SPOUT_SURFACE_INVALID', configuration);
      return false;
    }

    const { surface } = configuration;
    let bridge;
    try {
      bridge = loadBridge();
      const existingSenders = bridge.listSenders();
      const normalizedSenderName =
        surface.senderName.toLocaleLowerCase('en-US');
      if (
        existingSenders.some((candidate) =>
          typeof candidate?.name === 'string'
            ? candidate.name.toLocaleLowerCase('en-US') === normalizedSenderName
            : false,
        )
      ) {
        emitError('SPOUT_SENDER_NAME_IN_USE', existingSenders);
        return false;
      }
      sender = new bridge.TextureSender(
        surface.senderName,
        surface.width,
        surface.height,
      );
    } catch (error) {
      emitError('SPOUT_NATIVE_MODULE_UNAVAILABLE', error);
      return false;
    }

    stopped = false;
    try {
      outputWindow = new BrowserWindow({
        width: surface.width,
        height: surface.height,
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
      outputWindow.setContentSize(surface.width, surface.height, false);

      const { webContents } = outputWindow;
      webContents.setFrameRate(surface.framesPerSecond);
      webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      webContents.session.setPermissionCheckHandler(() => false);
      webContents.session.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      webContents.on('will-navigate', (event, targetUrl) => {
        if (targetUrl !== configuration.outputUrl) event.preventDefault();
      });
      webContents.on('will-redirect', (event, targetUrl) => {
        if (targetUrl !== configuration.outputUrl) event.preventDefault();
      });
      webContents.once('render-process-gone', (_event, details) => {
        failAndStop('SPOUT_RENDERER_FAILED', details);
      });
      webContents.once('unresponsive', () => {
        failAndStop('SPOUT_RENDERER_FAILED', 'renderer unresponsive');
      });
      webContents.on('paint', (event) => {
        const texture = event?.texture;
        try {
          if (stopped || !sender) return;
          if (!texture?.textureInfo) {
            recordPaintDefect({ reason: 'no-texture' });
            return;
          }
          if (!isExpectedSurfaceTexture(texture.textureInfo, surface)) {
            failAndStop('SPOUT_SURFACE_INVALID', texture.textureInfo);
            return;
          }
          if (
            !Buffer.isBuffer(texture.textureInfo.handle?.ntHandle) ||
            texture.textureInfo.handle.ntHandle.length !== 8
          ) {
            recordPaintDefect({ reason: 'no-nt-handle' });
            return;
          }
          const defect = bridge.sendTextureFromPaintEvent(
            sender,
            texture.textureInfo,
          );
          if (defect) {
            recordPaintDefect(defect);
            return;
          }
          consecutivePaintDefects = 0;
          if (!readySent) {
            readySent = true;
            sendToParent({
              contractVersion: SPOUT_CONTRACT_VERSION,
              type: 'ready',
              surface,
            });
          }
        } catch (error) {
          logger.error?.(
            '[spout-helper] Failed to forward shared texture',
            error,
          );
          failAndStop('SPOUT_TEXTURE_SEND_FAILED', error);
        } finally {
          texture?.release?.();
        }
      });

      await outputWindow.loadURL(configuration.outputUrl);
    } catch (error) {
      failAndStop('SPOUT_RENDERER_LOAD_FAILED', error);
      return false;
    }
    return !stopped;
  }

  return { start, stop };
}

function runSpoutHelper() {
  const { app, BrowserWindow } = require('electron');
  if (typeof process.send !== 'function') {
    app.quit();
    return;
  }

  let controller = null;
  const sendToParent = (message) => {
    if (typeof process.send === 'function') process.send(message);
  };

  process.on('message', async (message) => {
    if (isSpoutStopMessage(message)) {
      controller?.stop();
      app.quit();
      return;
    }
    if (!isSpoutConfigureMessage(message) || controller) return;

    await app.whenReady();
    controller = createSpoutHelperController({ BrowserWindow, sendToParent });
    if (!(await controller.start(message))) app.quit();
  });
  process.on('disconnect', () => {
    controller?.stop();
    app.quit();
  });
  app.on('before-quit', () => controller?.stop());
}

module.exports = { createSpoutHelperController, runSpoutHelper };
