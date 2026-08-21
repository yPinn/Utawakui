'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');
const {
  OUTPUT_STATE_VERSION,
  createEmptyOutputSnapshot,
  parseOutputSnapshot,
} = require('../../shared/outputContract');

const OUTPUT_HOST = '127.0.0.1';
const DEFAULT_OUTPUT_PORT = 17404;
const OUTPUT_WS_PATH = '/ws';
const OUTPUT_MAX_INBOUND_PAYLOAD_BYTES = 4096;
const OUTPUT_MAX_INBOUND_PARTS = 16;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const CLIENT_CLOSE_GRACE_MS = 500;
const DEFAULT_OVERLAY_ROOT = path.resolve(__dirname, '../../overlay');
const OVERLAY_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self' ws://127.0.0.1:*",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self' file: http://localhost:5173",
].join('; ');
const OVERLAY_STATIC_ROUTES = Object.freeze({
  '/overlay/lyrics': ['lyrics', 'index.html'],
  '/overlay/lyrics/': ['lyrics', 'index.html'],
  '/overlay/lyrics/lyrics.css': ['lyrics', 'lyrics.css'],
  '/overlay/lyrics/lyrics.mjs': ['lyrics', 'lyrics.mjs'],
  '/overlay/now-playing': ['now-playing', 'index.html'],
  '/overlay/now-playing/': ['now-playing', 'index.html'],
  '/overlay/now-playing/now-playing.css': ['now-playing', 'now-playing.css'],
  '/overlay/now-playing/now-playing.mjs': ['now-playing', 'now-playing.mjs'],
  '/overlay/setlist': ['setlist', 'index.html'],
  '/overlay/setlist/': ['setlist', 'index.html'],
  '/overlay/setlist/setlist.css': ['setlist', 'setlist.css'],
  '/overlay/setlist/setlist.mjs': ['setlist', 'setlist.mjs'],
  '/overlay/shared/base.css': ['shared', 'base.css'],
  '/overlay/shared/preview.mjs': ['shared', 'preview.mjs'],
  '/overlay/shared/runtime.mjs': ['shared', 'runtime.mjs'],
  '/overlay/shared/state.mjs': ['shared', 'state.mjs'],
  '/overlay/shared/tokens.css': ['shared', 'tokens.css'],
});
const OVERLAY_MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
});

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

function writeJson(response, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extraHeaders,
  });
  response.end(payload);
}

function writeStatic(response, body, contentType) {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': OVERLAY_CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  response.end(body);
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
  const overlayRoot = options.overlayRoot ?? DEFAULT_OVERLAY_ROOT;

  let snapshot = createEmptyOutputSnapshot();
  let httpServer = null;
  let webSocketServer = null;
  let heartbeatTimer = null;
  let activePort = null;
  let startingPromise = null;
  let stoppingPromise = null;
  const clientLiveness = new WeakMap();

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
    };
  }

  function getSnapshot() {
    return parseOutputSnapshot(snapshot);
  }

  async function handleRequest(request, response) {
    if (request.method !== 'GET') {
      writeJson(
        response,
        405,
        { error: 'method_not_allowed' },
        { Allow: 'GET' },
      );
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      writeJson(response, 400, { error: 'bad_request' });
      return;
    }

    if (pathname === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        stateVersion: OUTPUT_STATE_VERSION,
        revision: snapshot.revision,
        clients: webSocketServer?.clients.size ?? 0,
      });
      return;
    }

    if (pathname === '/api/v1/state') {
      writeJson(response, 200, snapshot);
      return;
    }

    const overlayFileParts = OVERLAY_STATIC_ROUTES[pathname];
    if (overlayFileParts) {
      const filePath = path.join(overlayRoot, ...overlayFileParts);
      try {
        const body = await fs.readFile(filePath);
        const contentType =
          OVERLAY_MIME_TYPES[path.extname(filePath)] ??
          'application/octet-stream';
        writeStatic(response, body, contentType);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error?.('[output] Failed to read overlay asset', error);
        }
        writeJson(response, 404, { error: 'not_found' });
      }
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
  }

  function handleConnection(client) {
    clientLiveness.set(client, true);
    client.on('pong', () => clientLiveness.set(client, true));
    client.on('error', (error) => {
      logger.warn?.('[output] WebSocket client error', error.message);
    });
    client.on('message', () => {
      client.close(1008, 'read-only channel');
    });
    client.send(
      JSON.stringify({ type: 'state.snapshot', snapshot: getSnapshot() }),
    );
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
    });
    httpServer = nextHttpServer;
    webSocketServer = nextWebSocketServer;
    nextHttpServer.requestTimeout = 5000;
    nextHttpServer.headersTimeout = 5000;
    nextHttpServer.keepAliveTimeout = 5000;
    nextWebSocketServer.on('connection', handleConnection);
    nextWebSocketServer.on('error', (error) => {
      logger.error?.('[output] WebSocket server error', error.message);
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

    const message = JSON.stringify({
      type: 'state.changed',
      revision: snapshot.revision,
      snapshot,
    });
    for (const client of webSocketServer?.clients ?? []) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
    return true;
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

  return { getSnapshot, getStatus, publish, start, stop };
}

module.exports = {
  DEFAULT_OUTPUT_PORT,
  OUTPUT_HOST,
  OUTPUT_MAX_INBOUND_PAYLOAD_BYTES,
  OUTPUT_WS_PATH,
  createOutputServer,
};
