'use strict';

const AUTH_TIMEOUT_MS = 3000;
// Phones treat ~25s of silence as a lost connection; JS cannot see WS pings.
const HEARTBEAT_MS = 10_000;
const MAX_READERS_PER_DEVICE = 2;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const CLOSE = Object.freeze({
  policy: 1008,
  unauthorized: 4401,
  replaced: 4409,
  // Another phone took over; this one keeps its credential to resume.
  displaced: 4410,
  shutdown: 1001,
});

// Authenticated, server-to-client lyric readers. A socket must authenticate
// with its first message; after that any client message closes it. Only one
// phone is connected at a time: a newly authenticated phone displaces the
// others, which stay paired and can take over again.
function createReaderHub({
  devices,
  snapshots,
  onReaderCount = () => {},
  now = () => Date.now(),
  authTimeoutMs = AUTH_TIMEOUT_MS,
  heartbeatMs = HEARTBEAT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setRepeat = setInterval,
  clearRepeat = clearInterval,
}) {
  const readers = new Map();
  let unsubscribe = null;
  let heartbeat = null;

  function count() {
    let total = 0;
    for (const sockets of readers.values()) total += sockets.size;
    return total;
  }

  function sendMessage(socket, message) {
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.close(CLOSE.policy, 'slow reader');
      return;
    }
    socket.send(JSON.stringify({ ...message, sentAt: now() }));
  }

  const send = (socket, snapshot) =>
    sendMessage(socket, { type: 'snapshot', snapshot });

  function broadcast(snapshot) {
    for (const sockets of readers.values())
      for (const socket of sockets) send(socket, snapshot);
  }

  function ensureRunning() {
    unsubscribe ??= snapshots.subscribe(broadcast);
    heartbeat ??= setRepeat(() => {
      for (const sockets of readers.values())
        for (const socket of sockets) {
          if (socket.companionAlive === false) socket.terminate();
          else {
            socket.companionAlive = false;
            socket.ping();
            sendMessage(socket, { type: 'heartbeat' });
          }
        }
    }, heartbeatMs);
  }

  function release(socket) {
    const sockets = readers.get(socket.companionDeviceId);
    if (!sockets?.delete(socket)) return;
    if (sockets.size === 0) readers.delete(socket.companionDeviceId);
    onReaderCount(count());
  }

  function displaceOthers(deviceId) {
    for (const [id, sockets] of readers) {
      if (id === deviceId) continue;
      // Dropped first so no snapshot reaches a socket that is closing.
      readers.delete(id);
      for (const socket of sockets) socket.close(CLOSE.displaced, 'displaced');
    }
  }

  function admit(socket, device) {
    displaceOthers(device.id);
    const sockets = readers.get(device.id) ?? new Set();
    readers.set(device.id, sockets);
    if (sockets.size >= MAX_READERS_PER_DEVICE) {
      const oldest = sockets.values().next().value;
      sockets.delete(oldest);
      oldest.close(CLOSE.replaced, 'replaced');
    }
    socket.companionDeviceId = device.id;
    socket.companionAlive = true;
    sockets.add(socket);
    ensureRunning();
    onReaderCount(count());
    send(socket, snapshots.get());
  }

  function attach(socket) {
    let authenticated = false;
    const timer = setTimer(() => {
      if (!authenticated) socket.close(CLOSE.policy, 'auth timeout');
    }, authTimeoutMs);
    socket.on('pong', () => {
      socket.companionAlive = true;
    });
    socket.on('message', (data) => {
      if (authenticated) {
        socket.close(CLOSE.policy, 'read-only channel');
        return;
      }
      clearTimer(timer);
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        message = null;
      }
      const device =
        message?.type === 'auth'
          ? devices.authenticate(message.credential)
          : null;
      if (!device) {
        socket.close(CLOSE.unauthorized, 'unauthorized');
        return;
      }
      authenticated = true;
      admit(socket, device);
    });
    socket.on('close', () => {
      clearTimer(timer);
      release(socket);
    });
  }

  function closeDevice(deviceId) {
    for (const socket of readers.get(deviceId) ?? [])
      socket.close(CLOSE.unauthorized, 'revoked');
  }

  function closeAll() {
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) clearRepeat(heartbeat);
    heartbeat = null;
    for (const sockets of readers.values())
      for (const socket of sockets) socket.close(CLOSE.shutdown, 'stopped');
    readers.clear();
    onReaderCount(0);
  }

  // The connected phone, the only one whose commands are accepted.
  const isActive = (deviceId) => readers.has(deviceId);

  return { attach, closeDevice, closeAll, count, isActive };
}

module.exports = {
  AUTH_TIMEOUT_MS,
  CLOSE,
  MAX_READERS_PER_DEVICE,
  createReaderHub,
};
