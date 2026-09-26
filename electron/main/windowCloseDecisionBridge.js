'use strict';

const { randomUUID } = require('node:crypto');

const CLOSE_ACTIONS = new Set(['tray', 'quit', 'cancel']);
const PRESENT_CHANNEL = 'window-close:present';
const RESPOND_CHANNEL = 'window-close:respond';
const REQUEST_CHANNEL = 'window-close:request';
const DISMISS_CHANNEL = 'window-close:dismiss';

function bridgeError(code) {
  return Object.assign(new Error(code), { code });
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function isCloseDecisionPayload(value) {
  if (!hasExactKeys(value, ['action', 'remember', 'requestId'])) return false;
  if (typeof value.requestId !== 'string') return false;
  if (!CLOSE_ACTIONS.has(value.action)) return false;
  if (typeof value.remember !== 'boolean') return false;
  return value.action !== 'cancel' || value.remember === false;
}

// Main owns request identity and renderer lifecycle. The renderer can only
// acknowledge and answer the currently active request from the current main
// window; it cannot create a close request or invoke Tray/quit directly.
function createWindowCloseDecisionBridge({
  ipcMain,
  getAllowedWindow,
  createRequestId = randomUUID,
  acknowledgementTimeoutMs = 1000,
}) {
  let destroyed = false;
  let pending = null;

  function isCurrentSender(event, requestId) {
    return Boolean(
      pending &&
      pending.requestId === requestId &&
      pending.sourceWindow === getAllowedWindow() &&
      event?.sender === pending.webContents &&
      !pending.sourceWindow?.isDestroyed?.() &&
      !pending.webContents?.isDestroyed?.(),
    );
  }

  function cleanupRequest(request) {
    if (request.acknowledgementTimer) {
      clearTimeout(request.acknowledgementTimer);
    }
    request.sourceWindow.removeListener?.(
      'unresponsive',
      request.handleRendererUnavailable,
    );
    request.webContents.removeListener?.(
      'render-process-gone',
      request.handleRendererUnavailable,
    );
    request.webContents.removeListener?.(
      'destroyed',
      request.handleRendererUnavailable,
    );
  }

  function dismissRendererRequest(request) {
    if (!request.presented || request.webContents.isDestroyed?.()) return;
    try {
      request.webContents.send(DISMISS_CHANNEL, {
        requestId: request.requestId,
      });
    } catch {
      // The native fallback remains available even if the renderer vanished
      // between the lifecycle check and this best-effort dismissal.
    }
  }

  function rejectPending(code, { dismiss = false } = {}) {
    const request = pending;
    if (!request) return;
    pending = null;
    cleanupRequest(request);
    if (dismiss) dismissRendererRequest(request);
    request.reject(bridgeError(code));
  }

  ipcMain.handle(PRESENT_CHANNEL, (event, requestId) => {
    if (!isCurrentSender(event, requestId)) return false;
    if (pending.presented) return true;
    pending.presented = true;
    clearTimeout(pending.acknowledgementTimer);
    pending.acknowledgementTimer = null;
    return true;
  });

  ipcMain.handle(RESPOND_CHANNEL, (event, payload) => {
    if (!isCloseDecisionPayload(payload)) return false;
    if (!isCurrentSender(event, payload.requestId) || !pending.presented) {
      return false;
    }
    const request = pending;
    pending = null;
    cleanupRequest(request);
    request.resolve({ action: payload.action, remember: payload.remember });
    return true;
  });

  function requestDecision(sourceWindow) {
    if (destroyed) {
      return Promise.reject(bridgeError('WINDOW_CLOSE_BRIDGE_DESTROYED'));
    }
    if (
      !sourceWindow ||
      sourceWindow !== getAllowedWindow() ||
      sourceWindow.isDestroyed?.() ||
      !sourceWindow.webContents ||
      typeof sourceWindow.webContents.send !== 'function' ||
      sourceWindow.webContents?.isDestroyed?.()
    ) {
      return Promise.reject(bridgeError('WINDOW_CLOSE_RENDERER_UNAVAILABLE'));
    }
    if (pending) {
      if (pending.sourceWindow === sourceWindow) return pending.promise;
      return Promise.reject(bridgeError('WINDOW_CLOSE_REQUEST_BUSY'));
    }

    const requestId = createRequestId();
    const webContents = sourceWindow.webContents;
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    const request = {
      requestId,
      sourceWindow,
      webContents,
      promise,
      resolve,
      reject,
      presented: false,
      acknowledgementTimer: null,
      handleRendererUnavailable: () =>
        rejectPending('WINDOW_CLOSE_RENDERER_UNAVAILABLE', { dismiss: true }),
    };
    pending = request;
    sourceWindow.once?.('unresponsive', request.handleRendererUnavailable);
    webContents.once?.(
      'render-process-gone',
      request.handleRendererUnavailable,
    );
    webContents.once?.('destroyed', request.handleRendererUnavailable);
    request.acknowledgementTimer = setTimeout(
      () => rejectPending('WINDOW_CLOSE_RENDERER_NOT_READY'),
      acknowledgementTimeoutMs,
    );

    try {
      webContents.send(REQUEST_CHANNEL, { requestId });
    } catch {
      rejectPending('WINDOW_CLOSE_RENDERER_UNAVAILABLE');
    }
    return promise;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    rejectPending('WINDOW_CLOSE_BRIDGE_DESTROYED', { dismiss: true });
    ipcMain.removeHandler(PRESENT_CHANNEL);
    ipcMain.removeHandler(RESPOND_CHANNEL);
  }

  return { destroy, requestDecision };
}

module.exports = { createWindowCloseDecisionBridge };
