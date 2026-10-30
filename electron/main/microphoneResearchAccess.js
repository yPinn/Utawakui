'use strict';

const { randomUUID } = require('node:crypto');
const LEASE_MS = 30_000;

// Main-owned access factory for explicit dev-tool actions, never a saved preference.
function createMicrophoneResearchAccess({
  enabled = false,
  getAllowedSender = () => null,
  now = Date.now,
  createId = randomUUID,
} = {}) {
  let lease = null;
  const isCurrentSender = (sender) =>
    Boolean(
      enabled &&
      sender &&
      sender === getAllowedSender() &&
      !sender.isDestroyed?.(),
    );
  function clear() {
    if (lease) {
      for (const event of [
        'did-start-navigation',
        'render-process-gone',
        'destroyed',
      ]) {
        lease.sender.removeListener?.(event, clear);
      }
    }
    lease = null;
  }
  function begin(sender) {
    if (!isCurrentSender(sender)) return null;
    clear();
    lease = {
      id: createId(),
      sender,
      url: sender.getURL(),
      deadline: now() + LEASE_MS,
    };
    for (const event of [
      'did-start-navigation',
      'render-process-gone',
      'destroyed',
    ]) {
      sender.once?.(event, clear);
    }
    return lease.id;
  }
  function end(sender, id) {
    if (
      !lease ||
      sender !== lease.sender ||
      typeof id !== 'string' ||
      id !== lease.id
    )
      return false;
    clear();
    return true;
  }
  function isAllowed(sender) {
    return Boolean(
      isCurrentSender(sender) &&
      lease &&
      lease.sender === sender &&
      lease.url === sender.getURL() &&
      now() < lease.deadline,
    );
  }
  function register(ipcMain) {
    ipcMain.handle('microphone-research:begin', (event) => begin(event.sender));
    ipcMain.handle('microphone-research:end', (event, id) =>
      end(event.sender, id),
    );
  }
  return { begin, end, isAllowed, register };
}

module.exports = { createMicrophoneResearchAccess };
