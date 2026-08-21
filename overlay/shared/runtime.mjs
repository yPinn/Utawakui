const SUPPORTED_MESSAGE_TYPES = new Set(['state.snapshot', 'state.changed']);
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8000;

export function buildWebSocketUrl(location) {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

export function parseOutputMessage(raw) {
  try {
    const message = JSON.parse(raw);
    if (
      !message ||
      typeof message !== 'object' ||
      !SUPPORTED_MESSAGE_TYPES.has(message.type) ||
      message.snapshot?.version !== 1 ||
      !Number.isSafeInteger(message.snapshot?.revision) ||
      message.snapshot.revision < 0
    ) {
      return null;
    }
    return { type: message.type, snapshot: message.snapshot };
  } catch {
    return null;
  }
}

export function createOverlayConnection(options = {}) {
  const location = options.location ?? window.location;
  const WebSocketImpl = options.WebSocketImpl ?? window.WebSocket;
  const onSnapshot = options.onSnapshot ?? (() => {});
  const onStatus = options.onStatus ?? (() => {});
  const schedule = options.schedule ?? window.setTimeout.bind(window);
  const cancelSchedule =
    options.cancelSchedule ?? window.clearTimeout.bind(window);

  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastRevision = -1;
  let stopped = true;

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
      if (
        message.type === 'state.changed' &&
        message.snapshot.revision <= lastRevision
      ) {
        return;
      }
      lastRevision = message.snapshot.revision;
      onSnapshot(message.snapshot);
    });
    socket.addEventListener('close', () => {
      if (stopped) return;
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
    socket?.close();
    socket = null;
    onStatus('stopped');
  }

  return { start, stop };
}
