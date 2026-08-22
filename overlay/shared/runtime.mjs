const STATE_MESSAGE_TYPES = new Set(['state.snapshot', 'state.changed']);
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8000;
const OUTPUT_STATE_VERSION = 2;

export function buildWebSocketUrl(location) {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

export function parseOutputMessage(raw) {
  try {
    const message = JSON.parse(raw);
    if (!message || typeof message !== 'object') return null;

    if (STATE_MESSAGE_TYPES.has(message.type)) {
      if (
        message.snapshot?.version !== OUTPUT_STATE_VERSION ||
        !Number.isSafeInteger(message.snapshot?.revision) ||
        message.snapshot.revision < 0 ||
        !Number.isSafeInteger(message.snapshot?.displayDelayMs)
      ) {
        return null;
      }
      const overlayConfig = parseOverlayConfig(message.overlayConfig);
      return { type: message.type, snapshot: message.snapshot, overlayConfig };
    }

    if (message.type !== 'overlay.config.changed') return null;
    const overlayConfig = parseOverlayConfig(message.overlayConfig);
    if (!overlayConfig) return null;
    return { type: message.type, overlayConfig };
  } catch {
    return null;
  }
}

function parseOverlayConfig(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.version !== 2 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.slots !== 'object' ||
    value.slots === null ||
    Array.isArray(value.slots)
  ) {
    return null;
  }
  return value;
}

function slotFromConfig(config, kind) {
  if (!config) return null;
  if (!kind) return config.slots;
  const slot = config.slots[kind];
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null;
  return slot;
}
export function createOverlayConnection(options = {}) {
  const location = options.location ?? window.location;
  const WebSocketImpl = options.WebSocketImpl ?? window.WebSocket;
  const onSnapshot = options.onSnapshot ?? (() => {});
  const onConfig = options.onConfig ?? (() => {});
  const onStatus = options.onStatus ?? (() => {});
  const schedule = options.schedule ?? window.setTimeout.bind(window);
  const cancelSchedule =
    options.cancelSchedule ?? window.clearTimeout.bind(window);
  const now = options.now ?? Date.now;

  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastReceivedRevision = -1;
  let lastDeliveredRevision = -1;
  let lastConfigRevision = -1;
  let activeDisplayDelayMs = null;
  const snapshotTimers = new Set();
  let stopped = true;

  function clearSnapshotTimers() {
    for (const timer of snapshotTimers) cancelSchedule(timer);
    snapshotTimers.clear();
  }

  function deliverSnapshot(snapshot, allowEqualRevision = false) {
    if (
      snapshot.revision < lastDeliveredRevision ||
      (!allowEqualRevision && snapshot.revision === lastDeliveredRevision)
    ) {
      return;
    }
    lastDeliveredRevision = snapshot.revision;
    onSnapshot(snapshot);
  }

  function scheduleSnapshot(snapshot, allowEqualRevision = false) {
    if (
      activeDisplayDelayMs !== null &&
      snapshot.displayDelayMs !== activeDisplayDelayMs
    ) {
      clearSnapshotTimers();
    }
    activeDisplayDelayMs = snapshot.displayDelayMs;

    const generatedAtMs = Date.parse(snapshot.generatedAt ?? '');
    const dueAtMs = Number.isFinite(generatedAtMs)
      ? generatedAtMs + Math.max(0, snapshot.displayDelayMs)
      : now();
    const remainingMs = Math.max(0, dueAtMs - now());
    if (remainingMs === 0) {
      deliverSnapshot(snapshot, allowEqualRevision);
      return;
    }

    let timer = null;
    timer = schedule(() => {
      snapshotTimers.delete(timer);
      deliverSnapshot(snapshot, allowEqualRevision);
    }, remainingMs);
    snapshotTimers.add(timer);
  }

  function connect() {
    if (stopped) return;
    onStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    socket = new WebSocketImpl(buildWebSocketUrl(location));

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      onStatus('connected');
    });
    socket.addEventListener('message', (event) => {
      const message = parseOutputMessage(event.data);
      if (!message) return;
      if (message.snapshot) {
        if (
          message.type === 'state.changed' &&
          message.snapshot.revision <= lastReceivedRevision
        ) {
          return;
        }
        lastReceivedRevision = message.snapshot.revision;
        scheduleSnapshot(message.snapshot, message.type === 'state.snapshot');
      }
      if (message.overlayConfig) {
        const isFreshSnapshot = message.type === 'state.snapshot';
        if (
          isFreshSnapshot ||
          message.overlayConfig.revision > lastConfigRevision
        ) {
          lastConfigRevision = message.overlayConfig.revision;
          onConfig(slotFromConfig(message.overlayConfig, options.kind));
        }
      }
    });
    socket.addEventListener('close', () => {
      if (stopped) return;
      clearSnapshotTimers();
      reconnectAttempt += 1;
      onStatus('reconnecting');
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttempt - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimer = schedule(connect, delay);
    });
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    reconnectAttempt = 0;
    connect();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer !== null) cancelSchedule(reconnectTimer);
    reconnectTimer = null;
    clearSnapshotTimers();
    socket?.close();
    socket = null;
    onStatus('stopped');
  }

  return { start, stop };
}
