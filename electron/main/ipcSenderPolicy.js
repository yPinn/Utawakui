'use strict';

const IPC_CAPABILITIES = Object.freeze({
  MAIN: 'main',
  PERFORMER: 'performer',
  MAIN_OR_PERFORMER: 'main-or-performer',
});

const IPC_CHANNEL_CAPABILITIES = Object.freeze({
  'diagnostics:record-renderer': IPC_CAPABILITIES.MAIN_OR_PERFORMER,
  'performer-view:get-status': IPC_CAPABILITIES.MAIN_OR_PERFORMER,
  'performer-view:get-snapshot': IPC_CAPABILITIES.MAIN_OR_PERFORMER,
  'performer-view:close': IPC_CAPABILITIES.PERFORMER,
  'performer-view:minimize': IPC_CAPABILITIES.PERFORMER,
  'performer-view:toggle-full-screen': IPC_CAPABILITIES.PERFORMER,
  'performer-view:toggle-always-on-top': IPC_CAPABILITIES.PERFORMER,
});

function createUntrustedSenderError() {
  return Object.assign(new Error('IPC_SENDER_UNTRUSTED'), {
    code: 'IPC_SENDER_UNTRUSTED',
  });
}

function isTrustedMainFrame(event, webContents) {
  return Boolean(
    webContents &&
    !webContents.isDestroyed?.() &&
    webContents.mainFrame &&
    event?.sender === webContents &&
    event?.senderFrame === webContents.mainFrame,
  );
}

function createTrustedIpcMain({
  ipcMain,
  getMainWebContents,
  getPerformerWebContents,
  channelCapabilities = IPC_CHANNEL_CAPABILITIES,
  onRejected = () => {},
}) {
  if (
    !ipcMain ||
    typeof ipcMain.handle !== 'function' ||
    typeof ipcMain.on !== 'function' ||
    typeof ipcMain.removeHandler !== 'function'
  ) {
    throw new TypeError('A complete ipcMain boundary is required');
  }

  const reportedRejections = new Set();
  const getCapability = (channel) =>
    Object.hasOwn(channelCapabilities, channel)
      ? channelCapabilities[channel]
      : IPC_CAPABILITIES.MAIN;
  const resolvesTrustedWebContents = (getter) => {
    try {
      return typeof getter === 'function' ? getter() : null;
    } catch {
      return null;
    }
  };
  const isAllowedSender = (event, capability) => {
    const isMain = isTrustedMainFrame(
      event,
      resolvesTrustedWebContents(getMainWebContents),
    );
    if (capability === IPC_CAPABILITIES.MAIN) return isMain;

    const isPerformer = isTrustedMainFrame(
      event,
      resolvesTrustedWebContents(getPerformerWebContents),
    );
    if (capability === IPC_CAPABILITIES.PERFORMER) return isPerformer;
    if (capability === IPC_CAPABILITIES.MAIN_OR_PERFORMER) {
      return isMain || isPerformer;
    }
    return false;
  };
  const reportRejected = (channel, capability, kind) => {
    const key = `${kind}:${capability}:${channel}`;
    if (reportedRejections.has(key)) return;
    reportedRejections.add(key);
    try {
      onRejected({ channel, capability, kind });
    } catch {
      // Sender validation must stay fail closed even if diagnostics fail.
    }
  };

  return Object.freeze({
    handle(channel, listener) {
      const capability = getCapability(channel);
      ipcMain.handle(channel, async (event, ...args) => {
        if (!isAllowedSender(event, capability)) {
          reportRejected(channel, capability, 'invoke');
          throw createUntrustedSenderError();
        }
        return listener(event, ...args);
      });
    },
    on(channel, listener) {
      const capability = getCapability(channel);
      ipcMain.on(channel, (event, ...args) => {
        if (!isAllowedSender(event, capability)) {
          reportRejected(channel, capability, 'event');
          return;
        }
        listener(event, ...args);
      });
    },
    removeHandler(channel) {
      ipcMain.removeHandler(channel);
    },
  });
}

module.exports = {
  createTrustedIpcMain,
  IPC_CAPABILITIES,
  IPC_CHANNEL_CAPABILITIES,
};
