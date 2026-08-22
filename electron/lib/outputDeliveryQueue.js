'use strict';

const {
  maxDocumentBytes: MAX_LYRICS_DOCUMENT_BYTES,
} = require('../../shared/lyricsTimingValues.json');

const DELIVERY_PROTOCOL_OVERHEAD_BYTES = 256 * 1024;
const DEFAULT_HIGH_WATER_BYTES =
  MAX_LYRICS_DOCUMENT_BYTES + DELIVERY_PROTOCOL_OVERHEAD_BYTES;
const DEFAULT_MAX_PENDING_BYTES = DEFAULT_HIGH_WATER_BYTES * 2;
const DEFAULT_SEND_TIMEOUT_MS = 5000;
const DELIVERY_KINDS = new Set(['clock', 'semantic', 'content', 'config']);

function createStats() {
  return {
    deliveredMessages: 0,
    deliveredBytes: 0,
    replacedMessages: 0,
    replacedBytes: 0,
    droppedMessages: 0,
    droppedBytes: 0,
    disconnectedClients: 0,
    disconnectReason: null,
  };
}

function createOutputClientDelivery({
  client,
  highWaterBytes = DEFAULT_HIGH_WATER_BYTES,
  maxPendingBytes = DEFAULT_MAX_PENDING_BYTES,
  sendTimeoutMs = DEFAULT_SEND_TIMEOUT_MS,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  if (!client || typeof client.send !== 'function') {
    throw new TypeError('Output delivery requires a WebSocket-like client');
  }
  for (const [name, value] of [
    ['highWaterBytes', highWaterBytes],
    ['maxPendingBytes', maxPendingBytes],
    ['sendTimeoutMs', sendTimeoutMs],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  const stats = createStats();
  const ordered = [];
  let pendingSemantic = null;
  let pendingClock = null;
  let pendingBytes = 0;
  let inFlight = null;
  let sendTimer = null;
  let backpressureTimer = null;
  let terminated = false;

  function message(kind, data) {
    if (!DELIVERY_KINDS.has(kind) || typeof data !== 'string') {
      throw new TypeError('Output delivery message is invalid');
    }
    return { kind, data, bytes: Buffer.byteLength(data) };
  }

  function clearTimers() {
    if (sendTimer !== null) cancelSchedule(sendTimer);
    if (backpressureTimer !== null) cancelSchedule(backpressureTimer);
    sendTimer = null;
    backpressureTimer = null;
  }

  function terminate(reason) {
    if (terminated) return false;
    terminated = true;
    clearTimers();
    const abandoned = [
      ...ordered,
      ...(pendingSemantic ? [pendingSemantic] : []),
      ...(pendingClock ? [pendingClock] : []),
    ];
    stats.droppedMessages += abandoned.length;
    stats.droppedBytes += abandoned.reduce((sum, item) => sum + item.bytes, 0);
    ordered.length = 0;
    pendingSemantic = null;
    pendingClock = null;
    pendingBytes = 0;
    stats.disconnectedClients += 1;
    stats.disconnectReason = reason;
    client.terminate();
    return false;
  }

  function removePending(item) {
    if (!item) return;
    pendingBytes -= item.bytes;
  }

  function nextPending() {
    const next = ordered.shift() ?? pendingSemantic ?? pendingClock;
    if (!next) return null;
    if (next === pendingSemantic) pendingSemantic = null;
    if (next === pendingClock) pendingClock = null;
    removePending(next);
    return next;
  }

  function armBackpressureDeadline() {
    if (backpressureTimer !== null) return;
    backpressureTimer = schedule(() => {
      backpressureTimer = null;
      if (Number(client.bufferedAmount) >= highWaterBytes) {
        terminate('backpressure_timeout');
      } else {
        flush();
      }
    }, sendTimeoutMs);
  }

  function flush() {
    if (terminated || inFlight) return;
    if (Number(client.bufferedAmount) >= highWaterBytes) {
      armBackpressureDeadline();
      return;
    }
    if (backpressureTimer !== null) {
      cancelSchedule(backpressureTimer);
      backpressureTimer = null;
    }
    const next = nextPending();
    if (!next) return;
    inFlight = next;
    sendTimer = schedule(() => {
      sendTimer = null;
      terminate('send_timeout');
    }, sendTimeoutMs);
    try {
      client.send(next.data, (error) => {
        if (terminated || inFlight !== next) return;
        if (sendTimer !== null) cancelSchedule(sendTimer);
        sendTimer = null;
        inFlight = null;
        if (error) {
          terminate('send_error');
          return;
        }
        stats.deliveredMessages += 1;
        stats.deliveredBytes += next.bytes;
        flush();
      });
    } catch {
      inFlight = null;
      terminate('send_error');
    }
  }

  function queueReplaceable(next) {
    if (next.kind === 'clock') {
      if (pendingClock) {
        stats.replacedBytes += pendingClock.bytes;
        removePending(pendingClock);
        stats.replacedMessages += 1;
      }
      pendingClock = next;
    } else {
      if (pendingClock) {
        stats.droppedBytes += pendingClock.bytes;
        removePending(pendingClock);
        pendingClock = null;
        stats.droppedMessages += 1;
      }
      if (pendingSemantic) {
        stats.replacedBytes += pendingSemantic.bytes;
        removePending(pendingSemantic);
        stats.replacedMessages += 1;
      }
      pendingSemantic = next;
    }
    pendingBytes += next.bytes;
    if (pendingBytes > maxPendingBytes) return terminate('pending_limit');
    return true;
  }

  function enqueue(value) {
    if (terminated) return false;
    const next = message(value?.kind, value?.data);
    let accepted = true;
    if (next.kind === 'content' || next.kind === 'config') {
      ordered.push(next);
      pendingBytes += next.bytes;
      if (pendingBytes > maxPendingBytes) {
        accepted = terminate('pending_limit');
      }
    } else {
      accepted = queueReplaceable(next);
    }
    if (accepted) flush();
    return accepted;
  }

  function getStats() {
    return { ...stats, queuedBytes: pendingBytes };
  }

  function close() {
    if (terminated) return;
    terminated = true;
    clearTimers();
    ordered.length = 0;
    pendingSemantic = null;
    pendingClock = null;
    pendingBytes = 0;
  }

  return { close, enqueue, getStats };
}

module.exports = {
  DEFAULT_HIGH_WATER_BYTES,
  DEFAULT_MAX_PENDING_BYTES,
  DEFAULT_SEND_TIMEOUT_MS,
  createOutputClientDelivery,
};
