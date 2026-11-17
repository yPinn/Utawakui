'use strict';

const crypto = require('node:crypto');

const APPLY_TIMEOUT_MS = 2000;
const RENDERER_STATUSES = new Set([
  'applied',
  'stale',
  'unavailable',
  'busy',
  'failed',
]);

// Hands an admitted phone command to the renderer that owns playback and
// waits for its outcome. Nothing is queued while the renderer is missing.
function createCommandRelay({
  send,
  timeoutMs = APPLY_TIMEOUT_MS,
  createId = crypto.randomUUID,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const pending = new Map();

  function dispatch(command) {
    const id = createId();
    return new Promise((resolve) => {
      const timer = setTimer(() => {
        pending.delete(id);
        resolve('timed_out');
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      let delivered;
      try {
        delivered = send({ id, ...command }) === true;
      } catch {
        delivered = false;
      }
      if (!delivered) settle(id, 'unavailable');
    });
  }

  function settle(id, status) {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    clearTimer(entry.timer);
    entry.resolve(RENDERER_STATUSES.has(status) ? status : 'failed');
    return true;
  }

  return { dispatch, settle, pendingCount: () => pending.size };
}

module.exports = { APPLY_TIMEOUT_MS, createCommandRelay };
