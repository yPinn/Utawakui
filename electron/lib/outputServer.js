'use strict';

const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');
const { OUTPUT_V3_SUBPROTOCOL } = require('../../shared/outputStreamContract');
const { createOutputClientDelivery } = require('./outputDeliveryQueue');
const { createOutputHttpHandler, writeJson } = require('./outputServer/http');
const {
  createEmptyOutputSnapshot,
  parseOutputSnapshot,
} = require('../../shared/outputContract');
const {
  host: OUTPUT_HOST,
  defaultPort: DEFAULT_OUTPUT_PORT,
} = require('../../shared/outputRuntimeValues.json');

const OUTPUT_WS_PATH = '/ws';
const OUTPUT_MAX_INBOUND_PAYLOAD_BYTES = 4096;
const OUTPUT_MAX_INBOUND_PARTS = 16;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const CLIENT_CLOSE_GRACE_MS = 500;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function immutableStreams(value) {
  if (Object.isFrozen(value)) return value;
  return deepFreeze(structuredClone(value));
}

function validatePort(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535) {
    throw new TypeError(
      'Output server port must be an integer from 0 to 65535',
    );
  }
  return value;
}

function validateHeartbeatInterval(value) {
  if (!Number.isSafeInteger(value) || value < 10) {
    throw new TypeError(
      'Output server heartbeat interval must be an integer of at least 10ms',
    );
  }
  return value;
}

function rejectUpgrade(socket, statusCode, reason) {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.end(
    `HTTP/1.1 ${statusCode} ${reason}\r\n` +
      'Connection: close\r\n' +
      'Content-Length: 0\r\n' +
      'X-Content-Type-Options: nosniff\r\n' +
      '\r\n',
  );
}

function closeHttpServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
  });
}

function closeWebSocketServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    const forceCloseTimer = setTimeout(() => {
      for (const client of server.clients) client.terminate();
    }, CLIENT_CLOSE_GRACE_MS);
    forceCloseTimer.unref?.();

    for (const client of server.clients) {
      client.close(1001, 'server stopping');
    }
    server.close(() => {
      clearTimeout(forceCloseTimer);
      resolve();
    });
  });
}

function createOutputServer(options = {}) {
  const configuredPort = validatePort(options.port ?? DEFAULT_OUTPUT_PORT);
  const heartbeatIntervalMs = validateHeartbeatInterval(
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const logger = options.logger ?? console;
  const deliveryFactory = options.deliveryFactory ?? createOutputClientDelivery;
  const deliveryOptions = options.deliveryOptions ?? {};

  let snapshot = createEmptyOutputSnapshot();
  let streamProjection = null;
  let sourceIdentity = {
    bootId: null,
    sourceEpoch: null,
    sourceSynchronization: 'ready',
    unavailableReason: null,
  };
  if (options.initialProjection) {
    setProjectionState(options.initialProjection, { broadcast: false });
  }
  let overlaySlots = { ...(options.overlaySlots ?? {}) };
  let overlayConfigRevision = 0;
  let httpServer = null;
  let webSocketServer = null;
  let heartbeatTimer = null;
  let activePort = null;
  let startingPromise = null;
  let stoppingPromise = null;
  const clientLiveness = new WeakMap();
  const clientDeliveries = new Map();
  const handleRequest = createOutputHttpHandler({
    getSnapshot,
    getClientCount: () => webSocketServer?.clients.size ?? 0,
    logger,
    overlayRoot: options.overlayRoot,
    recordStartupMilestone: options.recordStartupMilestone,
    resolveArtworkAsset: options.resolveArtworkAsset,
    sharedRoot: options.sharedRoot,
  });
  const closedDeliveryStats = {
    deliveredMessages: 0,
    deliveredBytes: 0,
    replacedMessages: 0,
    replacedBytes: 0,
    droppedMessages: 0,
    droppedBytes: 0,
    disconnectedClients: 0,
  };

  function aggregateDeliveryStats() {
    const result = { ...closedDeliveryStats, queuedBytes: 0 };
    for (const delivery of clientDeliveries.values()) {
      const stats = delivery.getStats();
      for (const key of Object.keys(closedDeliveryStats)) {
        result[key] += stats[key] ?? 0;
      }
      result.queuedBytes += stats.queuedBytes ?? 0;
    }
    return result;
  }

  function getStatus() {
    const running = Boolean(
      httpServer?.listening && webSocketServer && !stoppingPromise,
    );
    const port = activePort ?? configuredPort;
    return {
      running,
      host: OUTPUT_HOST,
      port,
      revision: snapshot.revision,
      httpUrl: running ? `http://${OUTPUT_HOST}:${port}` : null,
      wsUrl: running ? `ws://${OUTPUT_HOST}:${port}${OUTPUT_WS_PATH}` : null,
      clients: running ? webSocketServer.clients.size : 0,
      delivery: aggregateDeliveryStats(),
    };
  }

  function getSnapshot() {
    return parseOutputSnapshot(snapshot);
  }

  function projectionMessageFields() {
    if (!sourceIdentity.bootId) return {};
    return {
      bootId: sourceIdentity.bootId,
      sourceEpoch: sourceIdentity.sourceEpoch,
      sourceStatus: sourceIdentity.sourceSynchronization,
      unavailableReason: sourceIdentity.unavailableReason,
    };
  }

  function getOverlayConfig() {
    return {
      version: 2,
      revision: overlayConfigRevision,
      slots: structuredClone(overlaySlots),
    };
  }

  function isSplitClient(client) {
    return client.protocol === OUTPUT_V3_SUBPROTOCOL;
  }

  function enqueueClient(client, kind, value) {
    const delivery = clientDeliveries.get(client);
    if (!delivery) return false;
    return delivery.enqueue({ kind, data: JSON.stringify(value) });
  }

  function splitIdentityFields() {
    return {
      bootId: sourceIdentity.bootId,
      sourceEpoch: sourceIdentity.sourceEpoch,
      sourceStatus: sourceIdentity.sourceSynchronization,
      unavailableReason: sourceIdentity.unavailableReason,
    };
  }

  function splitContentMessage(type, entry) {
    return {
      type,
      ...splitIdentityFields(),
      revision: entry.revision,
      document: entry.document,
    };
  }

  function splitStateMessage() {
    return {
      type: 'state.snapshot',
      ...splitIdentityFields(),
      revision: streamProjection.state.revision,
      state: streamProjection.state.payload,
    };
  }

  function semanticStateKey(streams) {
    if (!streams?.state) return '';
    const state = streams.state.payload;
    return JSON.stringify({
      displayDelayMs: state.displayDelayMs,
      playback: {
        ...state.playback,
        positionMs: 0,
      },
      lyrics: state.lyrics,
      musicStructure: state.musicStructure,
      queue: state.queue,
    });
  }

  function contentChanged(previous, next, key) {
    const before = previous?.[key];
    const after = next?.[key];
    return (
      before?.revision !== after?.revision ||
      before?.document?.documentId !== after?.document?.documentId
    );
  }

  function enqueueSplitProjection(client, previousIdentity, previousStreams) {
    if (
      sourceIdentity.sourceSynchronization !== 'ready' ||
      !streamProjection?.state
    ) {
      enqueueClient(client, 'semantic', {
        type: 'source.status',
        ...splitIdentityFields(),
      });
      return;
    }
    const identityChanged =
      previousIdentity?.bootId !== sourceIdentity.bootId ||
      previousIdentity?.sourceEpoch !== sourceIdentity.sourceEpoch;
    const lyricsChanged =
      identityChanged ||
      contentChanged(previousStreams, streamProjection, 'lyrics');
    const musicStructureChanged =
      identityChanged ||
      contentChanged(previousStreams, streamProjection, 'musicStructure');
    const queueChanged =
      identityChanged ||
      contentChanged(previousStreams, streamProjection, 'queue');
    if (lyricsChanged && streamProjection.lyrics) {
      enqueueClient(
        client,
        'content',
        splitContentMessage('lyrics.document', streamProjection.lyrics),
      );
    }
    if (musicStructureChanged && streamProjection.musicStructure) {
      enqueueClient(
        client,
        'content',
        splitContentMessage(
          'music-structure.document',
          streamProjection.musicStructure,
        ),
      );
    }
    if (queueChanged && streamProjection.queue) {
      enqueueClient(
        client,
        'content',
        splitContentMessage('queue.document', streamProjection.queue),
      );
    }
    const semantic =
      identityChanged ||
      lyricsChanged ||
      musicStructureChanged ||
      queueChanged ||
      semanticStateKey(previousStreams) !== semanticStateKey(streamProjection);
    enqueueClient(client, semantic ? 'semantic' : 'clock', splitStateMessage());
  }

  function enqueueInitialSplitProjection(client) {
    enqueueClient(client, 'config', {
      type: 'overlay.config.snapshot',
      overlayConfig: getOverlayConfig(),
    });
    enqueueSplitProjection(client, null, null);
  }

  function handleConnection(client) {
    clientLiveness.set(client, true);
    const delivery = deliveryFactory({ client, ...deliveryOptions });
    clientDeliveries.set(client, delivery);
    client.on('close', () => {
      const stats = delivery.getStats();
      for (const key of Object.keys(closedDeliveryStats)) {
        closedDeliveryStats[key] += stats[key] ?? 0;
      }
      delivery.close();
      clientDeliveries.delete(client);
    });
    client.on('pong', () => clientLiveness.set(client, true));
    client.on('error', (error) => {
      logger.warn?.('[output] WebSocket client error', error);
    });
    client.on('message', () => {
      client.close(1008, 'read-only channel');
    });
    if (isSplitClient(client)) {
      enqueueInitialSplitProjection(client);
    } else {
      enqueueClient(client, 'semantic', {
        type: 'state.snapshot',
        ...projectionMessageFields(),
        snapshot: getSnapshot(),
        overlayConfig: getOverlayConfig(),
      });
    }
  }

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      for (const client of webSocketServer.clients) {
        if (clientLiveness.get(client) === false) {
          client.terminate();
          continue;
        }
        clientLiveness.set(client, false);
        client.ping();
      }
    }, heartbeatIntervalMs);
    heartbeatTimer.unref?.();
  }

  function handleUpgrade(request, socket, head) {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    if (request.method !== 'GET' || pathname !== OUTPUT_WS_PATH) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    const expectedOrigin = `http://${OUTPUT_HOST}:${activePort}`;
    if (request.headers.origin !== expectedOrigin) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    const requestedProtocols = String(
      request.headers['sec-websocket-protocol'] ?? '',
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      requestedProtocols.length > 0 &&
      !requestedProtocols.includes(OUTPUT_V3_SUBPROTOCOL)
    ) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit('connection', client, request);
    });
  }

  async function start() {
    if (stoppingPromise) await stoppingPromise;
    if (httpServer?.listening) return getStatus();
    if (startingPromise) return startingPromise;

    const nextHttpServer = http.createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        logger.error?.('[output] HTTP request failed', error);
        if (!response.headersSent) {
          writeJson(response, 500, { error: 'internal_error' });
        } else {
          response.destroy(error);
        }
      });
    });
    const nextWebSocketServer = new WebSocketServer({
      noServer: true,
      maxBufferedChunks: OUTPUT_MAX_INBOUND_PARTS,
      maxFragments: OUTPUT_MAX_INBOUND_PARTS,
      maxPayload: OUTPUT_MAX_INBOUND_PAYLOAD_BYTES,
      perMessageDeflate: false,
      skipUTF8Validation: false,
      handleProtocols: (protocols) =>
        protocols.has(OUTPUT_V3_SUBPROTOCOL) ? OUTPUT_V3_SUBPROTOCOL : false,
    });
    httpServer = nextHttpServer;
    webSocketServer = nextWebSocketServer;
    nextHttpServer.requestTimeout = 5000;
    nextHttpServer.headersTimeout = 5000;
    nextHttpServer.keepAliveTimeout = 5000;
    nextWebSocketServer.on('connection', handleConnection);
    nextWebSocketServer.on('error', (error) => {
      logger.error?.('[output] WebSocket server error', error);
    });
    nextHttpServer.on('upgrade', handleUpgrade);

    startingPromise = new Promise((resolve, reject) => {
      function handleListenError(error) {
        nextHttpServer.removeListener('listening', handleListening);
        httpServer = null;
        webSocketServer = null;
        activePort = null;
        reject(error);
      }

      function handleListening() {
        nextHttpServer.removeListener('error', handleListenError);
        const address = nextHttpServer.address();
        activePort =
          typeof address === 'object' && address ? address.port : null;
        startHeartbeat();
        resolve(getStatus());
      }

      nextHttpServer.once('error', handleListenError);
      nextHttpServer.once('listening', handleListening);
      nextHttpServer.listen(configuredPort, OUTPUT_HOST);
    });

    try {
      return await startingPromise;
    } finally {
      startingPromise = null;
    }
  }

  function publish(value) {
    const nextSnapshot = parseOutputSnapshot(value);
    if (nextSnapshot.revision <= snapshot.revision) return false;
    snapshot = nextSnapshot;
    streamProjection = null;

    const message = JSON.stringify({
      type: 'state.changed',
      ...projectionMessageFields(),
      revision: snapshot.revision,
      snapshot,
    });
    for (const client of webSocketServer?.clients ?? []) {
      if (client.readyState !== WebSocket.OPEN) continue;
      enqueueClient(client, 'semantic', JSON.parse(message));
    }
    return true;
  }

  function setProjectionState(value, options = {}) {
    if (!value || typeof value !== 'object') {
      throw new TypeError('Output projection state must be an object');
    }
    if (typeof value.bootId !== 'string' || value.bootId.length === 0) {
      throw new TypeError('Output projection state requires bootId');
    }
    if (
      value.sourceEpoch !== null &&
      (typeof value.sourceEpoch !== 'string' || value.sourceEpoch.length === 0)
    ) {
      throw new TypeError('Output projection state has invalid sourceEpoch');
    }
    if (
      !['unavailable', 'syncing', 'ready'].includes(value.sourceSynchronization)
    ) {
      throw new TypeError('Output projection state has invalid readiness');
    }

    const previousIdentity = { ...sourceIdentity };
    const previousStreams = streamProjection;
    snapshot = parseOutputSnapshot(value.snapshot);
    // ProjectionHub validates and freezes content once. Reuse that tree on
    // clock-only updates; standalone callers are defensively cloned once.
    streamProjection = value.streams ? immutableStreams(value.streams) : null;
    sourceIdentity = {
      bootId: value.bootId,
      sourceEpoch: value.sourceEpoch,
      sourceSynchronization: value.sourceSynchronization,
      unavailableReason:
        typeof value.unavailableReason === 'string'
          ? value.unavailableReason
          : null,
    };
    if (options.broadcast === false) return;

    const message = {
      type: 'state.changed',
      ...projectionMessageFields(),
      revision: snapshot.revision,
      snapshot,
    };
    for (const client of webSocketServer?.clients ?? []) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (isSplitClient(client) && streamProjection) {
        enqueueSplitProjection(client, previousIdentity, previousStreams);
      } else {
        enqueueClient(client, 'semantic', message);
      }
    }
  }

  function setOverlaySlots(value) {
    overlaySlots = structuredClone(value ?? {});
    overlayConfigRevision += 1;
    const message = {
      type: 'overlay.config.changed',
      overlayConfig: getOverlayConfig(),
    };
    for (const client of webSocketServer?.clients ?? []) {
      if (client.readyState === WebSocket.OPEN) {
        enqueueClient(client, 'config', message);
      }
    }
  }

  async function stop() {
    if (startingPromise) {
      try {
        await startingPromise;
      } catch {
        return;
      }
    }
    if (stoppingPromise) return stoppingPromise;
    if (!httpServer && !webSocketServer) return;

    const serverToClose = httpServer;
    const socketsToClose = webSocketServer;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;

    stoppingPromise = Promise.all([
      closeWebSocketServer(socketsToClose),
      closeHttpServer(serverToClose),
    ]).then(() => undefined);

    try {
      await stoppingPromise;
    } finally {
      if (httpServer === serverToClose) httpServer = null;
      if (webSocketServer === socketsToClose) webSocketServer = null;
      activePort = null;
      stoppingPromise = null;
    }
  }

  return {
    getOverlayConfig,
    getSnapshot,
    getStatus,
    publish,
    setProjectionState,
    setOverlaySlots,
    start,
    stop,
  };
}

module.exports = {
  DEFAULT_OUTPUT_PORT,
  OUTPUT_HOST,
  OUTPUT_MAX_INBOUND_PAYLOAD_BYTES,
  OUTPUT_WS_PATH,
  createOutputServer,
};
