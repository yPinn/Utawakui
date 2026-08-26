const STATE_MESSAGE_TYPES = new Set(['state.snapshot', 'state.changed']);
const OUTPUT_V3_SUBPROTOCOL = 'utawakui.output.v3';
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

    if (STATE_MESSAGE_TYPES.has(message.type) && message.snapshot) {
      if (
        message.snapshot?.version !== OUTPUT_STATE_VERSION ||
        !Number.isSafeInteger(message.snapshot?.revision) ||
        message.snapshot.revision < 0 ||
        !Number.isSafeInteger(message.snapshot?.displayDelayMs)
      ) {
        return null;
      }
      const overlayConfig = parseOverlayConfig(message.overlayConfig);
      const bootId =
        typeof message.bootId === 'string' && message.bootId.length > 0
          ? message.bootId
          : null;
      const sourceEpoch =
        typeof message.sourceEpoch === 'string' &&
        message.sourceEpoch.length > 0
          ? message.sourceEpoch
          : null;
      const sourceStatus = ['unavailable', 'syncing', 'ready'].includes(
        message.sourceStatus,
      )
        ? message.sourceStatus
        : null;
      return {
        type: message.type,
        snapshot: message.snapshot,
        overlayConfig,
        bootId,
        sourceEpoch,
        sourceStatus,
      };
    }

    if (
      message.type === 'overlay.config.changed' ||
      message.type === 'overlay.config.snapshot'
    ) {
      const overlayConfig = parseOverlayConfig(message.overlayConfig);
      if (!overlayConfig) return null;
      return { type: message.type, overlayConfig };
    }

    if (
      [
        'lyrics.document',
        'queue.document',
        'music-structure.document',
      ].includes(message.type) &&
      validSplitIdentity(message) &&
      Number.isSafeInteger(message.revision) &&
      message.revision >= 0 &&
      (message.document === null ||
        (message.document && typeof message.document === 'object'))
    ) {
      return message;
    }

    if (
      message.type === 'state.snapshot' &&
      !message.snapshot &&
      validSplitIdentity(message) &&
      Number.isSafeInteger(message.revision) &&
      message.revision >= 0 &&
      validDynamicState(message.state)
    ) {
      return message;
    }

    if (
      message.type === 'source.status' &&
      typeof message.bootId === 'string' &&
      ['unavailable', 'syncing'].includes(message.sourceStatus)
    ) {
      return message;
    }

    return null;
  } catch {
    return null;
  }
}

function validSplitIdentity(message) {
  return (
    typeof message.bootId === 'string' &&
    message.bootId.length > 0 &&
    typeof message.sourceEpoch === 'string' &&
    message.sourceEpoch.length > 0 &&
    message.sourceStatus === 'ready'
  );
}

function validReference(reference, nullable = false) {
  if (
    !reference ||
    typeof reference !== 'object' ||
    !Number.isSafeInteger(reference.documentRevision) ||
    reference.documentRevision < 0
  ) {
    return false;
  }
  if (reference.documentId === null) {
    return nullable && reference.documentRevision === 0;
  }
  return (
    typeof reference.documentId === 'string' && reference.documentId.length > 0
  );
}

function validDynamicState(state) {
  return (
    state &&
    typeof state === 'object' &&
    typeof state.generatedAt === 'string' &&
    Number.isSafeInteger(state.displayDelayMs) &&
    state.playback &&
    typeof state.playback === 'object' &&
    validReference(state.lyrics, true) &&
    validReference(state.queue) &&
    (!Object.hasOwn(state, 'musicStructure') ||
      state.musicStructure === null ||
      validReference(state.musicStructure, true))
  );
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

function contentMatches(reference, entry) {
  return (
    entry &&
    entry.revision === reference.documentRevision &&
    entry.document?.documentId === reference.documentId
  );
}

function assembleSplitSnapshot(
  message,
  lyricsEntry,
  queueEntry,
  musicStructureEntry,
) {
  const state = message.state;
  const lyricsReference = state.lyrics;
  const lyricsDocument =
    lyricsReference.documentId === null
      ? null
      : contentMatches(lyricsReference, lyricsEntry)
        ? lyricsEntry.document
        : undefined;
  if (
    lyricsDocument === undefined ||
    !contentMatches(state.queue, queueEntry) ||
    (state.musicStructure !== undefined &&
      state.musicStructure !== null &&
      state.musicStructure.documentId !== null &&
      !contentMatches(state.musicStructure, musicStructureEntry))
  ) {
    return null;
  }
  const lines = (lyricsDocument?.lines ?? []).map((line) => ({
    text: line.text,
    startMs: line.startMs,
    endMs: line.endMs,
    ...(line.endInferred === true ? { endInferred: true } : {}),
    ...(Array.isArray(line.segments) ? { segments: line.segments } : {}),
  }));
  return {
    version: OUTPUT_STATE_VERSION,
    revision: message.revision,
    generatedAt: state.generatedAt,
    displayDelayMs: state.displayDelayMs,
    playback: state.playback,
    queue: {
      sourceName: queueEntry.document.sourceName,
      items: queueEntry.document.items,
    },
    lyrics: lyricsDocument
      ? {
          trackId: lyricsDocument.trackId,
          source: lyricsDocument.source,
          synced: lines.some((line) => Number.isFinite(line.startMs)),
          offsetMs: state.lyrics.offsetMs,
          activeLineIndex: lyricsDocument.lines.findIndex(
            (line) => line.lineId === state.lyrics.activeLineId,
          ),
          activeSegmentId: state.lyrics.activeSegmentId,
          lines,
        }
      : {
          trackId: null,
          source: null,
          synced: false,
          offsetMs: state.lyrics.offsetMs,
          activeLineIndex: -1,
          activeSegmentId: null,
          lines: [],
        },
    musicStructure:
      state.musicStructure === undefined ||
      state.musicStructure === null ||
      state.musicStructure.documentId === null
        ? null
        : musicStructureEntry.document,
  };
}

function emptyUnavailableSnapshot(now) {
  return {
    version: OUTPUT_STATE_VERSION,
    revision: 0,
    generatedAt: new Date(now()).toISOString(),
    displayDelayMs: 0,
    playback: {
      status: 'idle',
      positionMs: 0,
      durationMs: null,
      rate: 1,
      track: null,
    },
    queue: { sourceName: '', items: [] },
    lyrics: {
      trackId: null,
      source: null,
      synced: false,
      offsetMs: 0,
      activeLineIndex: -1,
      activeSegmentId: null,
      lines: [],
    },
    musicStructure: null,
  };
}

function createOverlayTraceReporter(options) {
  const search = options.location?.search ?? '';
  const enabled = new URLSearchParams(search).get('startupTrace') === '1';
  if (!enabled) return { onSnapshot: () => undefined };
  const fetchImpl = options.fetchImpl ?? window.fetch.bind(window);
  const performance = options.performance ?? window.performance;
  const requestFrame =
    options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window);
  let instanceReported = false;
  let frameReported = false;

  function report(name) {
    const atUnixMs = performance.timeOrigin + performance.now();
    try {
      Promise.resolve(
        fetchImpl('/api/v1/startup-trace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, atUnixMs }),
        }),
      ).catch(() => undefined);
    } catch {
      // Trace-only diagnostics must never affect overlay rendering.
    }
  }

  function onSnapshot(snapshot) {
    if (instanceReported || snapshot.revision <= 0) return;
    instanceReported = true;
    report('first-instance-ready');
    requestFrame(() => {
      requestFrame(() => {
        if (frameReported) return;
        frameReported = true;
        report('first-rendered-frame');
      });
    });
  }

  return { onSnapshot };
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
  const traceReporter = createOverlayTraceReporter({ ...options, location });

  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastReceivedRevision = -1;
  let lastDeliveredRevision = -1;
  let lastConfigRevision = -1;
  let activeProjectionIdentity = null;
  let activeDisplayDelayMs = null;
  let lyricsEntry = null;
  let queueEntry = null;
  let musicStructureEntry = null;
  let pendingSplitState = null;
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
    )
      return;
    lastDeliveredRevision = snapshot.revision;
    onSnapshot(snapshot);
    traceReporter.onSnapshot(snapshot);
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

  function retryPendingSplitState() {
    if (!pendingSplitState) return false;
    const assembled = assembleSplitSnapshot(
      pendingSplitState,
      lyricsEntry,
      queueEntry,
      musicStructureEntry,
    );
    if (!assembled) return false;
    const revision = pendingSplitState.revision;
    lastReceivedRevision = revision;
    pendingSplitState = null;
    scheduleSnapshot(assembled);
    return true;
  }

  function connect() {
    if (stopped) return;
    onStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    socket = new WebSocketImpl(
      buildWebSocketUrl(location),
      OUTPUT_V3_SUBPROTOCOL,
    );

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      onStatus('connected');
    });
    socket.addEventListener('message', (event) => {
      const message = parseOutputMessage(event.data);
      if (!message) return;
      if (message.type === 'overlay.config.snapshot') {
        lastConfigRevision = message.overlayConfig.revision;
        onConfig(slotFromConfig(message.overlayConfig, options.kind));
        return;
      }
      if (message.type === 'lyrics.document') {
        updateSplitIdentity(message);
        lyricsEntry = {
          revision: message.revision,
          document: message.document,
        };
        retryPendingSplitState();
        return;
      }
      if (message.type === 'queue.document') {
        updateSplitIdentity(message);
        queueEntry = {
          revision: message.revision,
          document: message.document,
        };
        retryPendingSplitState();
        return;
      }
      if (message.type === 'music-structure.document') {
        updateSplitIdentity(message);
        musicStructureEntry = {
          revision: message.revision,
          document: message.document,
        };
        retryPendingSplitState();
        return;
      }
      if (message.type === 'source.status') {
        const nextIdentity = `${message.bootId}\0${message.sourceStatus}`;
        if (nextIdentity !== activeProjectionIdentity) {
          resetProjection(nextIdentity);
        }
        if (['unavailable', 'syncing'].includes(message.sourceStatus)) {
          scheduleSnapshot(emptyUnavailableSnapshot(now), true);
        }
        return;
      }
      if (message.state) {
        updateSplitIdentity(message);
        if (
          message.revision <= lastReceivedRevision ||
          message.revision <= (pendingSplitState?.revision ?? -1)
        )
          return;
        pendingSplitState = message;
        retryPendingSplitState();
        return;
      }
      if (message.snapshot) {
        const nextIdentity = message.bootId
          ? message.sourceEpoch
            ? `${message.bootId}\0${message.sourceEpoch}`
            : message.sourceStatus
              ? `${message.bootId}\0${message.sourceStatus}`
              : null
          : null;
        if (
          nextIdentity !== null &&
          nextIdentity !== activeProjectionIdentity
        ) {
          clearSnapshotTimers();
          lastReceivedRevision = -1;
          lastDeliveredRevision = -1;
          activeProjectionIdentity = nextIdentity;
        }
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
      resetProjection(null);
      reconnectAttempt += 1;
      onStatus('reconnecting');
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * 2 ** (reconnectAttempt - 1),
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimer = schedule(connect, delay);
    });
  }

  function resetProjection(nextIdentity) {
    clearSnapshotTimers();
    lastReceivedRevision = -1;
    lastDeliveredRevision = -1;
    activeProjectionIdentity = nextIdentity;
    lyricsEntry = null;
    queueEntry = null;
    musicStructureEntry = null;
    pendingSplitState = null;
  }

  function updateSplitIdentity(message) {
    const nextIdentity = `${message.bootId}\0${message.sourceEpoch}`;
    if (nextIdentity !== activeProjectionIdentity)
      resetProjection(nextIdentity);
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
    resetProjection(null);
    lastConfigRevision = -1;
    activeDisplayDelayMs = null;
    socket?.close();
    socket = null;
    onStatus('stopped');
  }

  return { start, stop };
}
