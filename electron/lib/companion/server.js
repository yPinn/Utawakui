'use strict';

const http = require('node:http');
const { WebSocketServer } = require('ws');
const { parseCompanionCommand } = require('./commandGate');

const MAX_BODY_BYTES = 1024;
const SUBPROTOCOL = 'utawakui.companion.v1';
const MAX_SOCKET_PAYLOAD_BYTES = 4096;
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
});

function serverError(code) {
  return Object.assign(new Error(`Companion server: ${code}`), {
    companionStatus: code,
  });
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    const type = String(request.headers['content-type'] ?? '');
    if (!/^application\/json(;|$)/iu.test(type)) return resolve(null);
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        resolve(null);
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
  });
}

// Paired-phone listener on one private address. It shares nothing with the
// loopback Output server; every request must name this exact host and origin.
function createCompanionServer({
  address,
  port,
  pairing,
  devices,
  isGateEnabled = () => true,
  loadPage = () => new Map(),
  readers = null,
  commands = null,
  createHttpServer = http.createServer,
}) {
  const authority = `${address}:${port}`;
  const origin = `http://${authority}`;
  const sockets = new Set();
  let server = null;
  let socketServer = null;
  let page = null;

  // The phone page allows only same-origin assets and this socket.
  const pageHeaders = Object.freeze({
    ...SECURITY_HEADERS,
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ws://${authority}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  });

  function servePage(pathname, response) {
    page ??= loadPage();
    const entry = page.get(pathname);
    if (!entry) return false;
    response.writeHead(200, {
      ...pageHeaders,
      'Content-Type': entry.type,
      'Content-Length': entry.body.length,
    });
    response.end(entry.body);
    return true;
  }

  function allowedOrigin(request) {
    const value = request.headers.origin;
    return value === undefined || value === origin;
  }

  async function pair(request, response) {
    const body = await readJsonBody(request);
    const fail = () => sendJson(response, 400, { error: 'pairing-failed' });
    if (!body || typeof body !== 'object') return fail();
    if (!pairing.claim(body.code)) return fail();
    try {
      const { device, credential } = devices.add(body.label);
      return sendJson(response, 200, { credential, device });
    } catch (error) {
      return sendJson(response, 409, {
        error:
          error.companionStatus === 'full' ? 'devices-full' : 'pairing-failed',
      });
    }
  }

  function bearer(request) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(
      String(request.headers.authorization ?? ''),
    );
    return match ? match[1] : null;
  }

  // Validated in Main, applied by the renderer; the reply is the outcome.
  async function command(request, response) {
    const reject = (status, reason) =>
      sendJson(response, status, { result: 'rejected', reason });
    if (!commands) return reject(404, 'unavailable');
    const device = devices.authenticate(bearer(request));
    if (!device) return reject(401, 'unauthorized');
    const parsed = parseCompanionCommand(await readJsonBody(request));
    if (!parsed) return reject(400, 'invalid');
    const refused = commands.admission.admit(device.id, parsed);
    if (refused) return reject(refused === 'stale' ? 409 : 429, refused);
    const { command: name, revision, trackId } = parsed;
    const outcome = await commands.dispatch({
      command: name,
      revision,
      trackId,
    });
    if (outcome === 'applied')
      return sendJson(response, 200, { result: 'applied' });
    if (outcome === 'timed_out')
      return sendJson(response, 504, { result: 'timed_out' });
    return reject(409, outcome);
  }

  const routes = new Map([
    ['POST /m/api/v1/pair', pair],
    ['POST /m/api/v1/command', command],
  ]);

  async function handle(request, response) {
    if (request.headers.host !== authority || !allowedOrigin(request))
      return sendJson(response, 403, { error: 'forbidden' });
    // The gate is rechecked per request; a notice in the UI is not a boundary.
    if (!isGateEnabled())
      return sendJson(response, 503, { error: 'unavailable' });
    const url = new URL(request.url, origin);
    const route = routes.get(`${request.method} ${url.pathname}`);
    if (route) return route(request, response);
    if (request.method === 'GET' && servePage(url.pathname, response)) return;
    return sendJson(response, 404, { error: 'not-found' });
  }

  function rejectUpgrade(socket, status) {
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n\r\n`);
  }

  function handleUpgrade(request, socket, head) {
    let pathname;
    try {
      pathname = new URL(request.url, origin).pathname;
    } catch {
      return rejectUpgrade(socket, 400);
    }
    if (request.method !== 'GET' || pathname !== '/m/ws' || !readers)
      return rejectUpgrade(socket, 404);
    if (request.headers.host !== authority || request.headers.origin !== origin)
      return rejectUpgrade(socket, 403);
    if (!isGateEnabled()) return rejectUpgrade(socket, 503);
    const protocols = String(request.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((value) => value.trim());
    if (!protocols.includes(SUBPROTOCOL)) return rejectUpgrade(socket, 400);
    socketServer.handleUpgrade(request, socket, head, (client) =>
      readers.attach(client),
    );
  }

  function start() {
    if (server) return Promise.resolve();
    server = createHttpServer((request, response) => {
      handle(request, response).catch(() => {
        if (!response.headersSent)
          sendJson(response, 500, { error: 'unavailable' });
      });
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    socketServer = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_SOCKET_PAYLOAD_BYTES,
      perMessageDeflate: false,
      handleProtocols: (protocols) =>
        protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false,
    });
    server.on('upgrade', handleUpgrade);
    return new Promise((resolve, reject) => {
      server.once('error', (error) => {
        server = null;
        reject(
          serverError(
            error.code === 'EADDRINUSE' ? 'port-in-use' : 'listen-failed',
          ),
        );
      });
      server.listen(port, address, () => resolve());
    });
  }

  function stop() {
    if (!server) return Promise.resolve();
    const closing = server;
    server = null;
    readers?.closeAll();
    socketServer?.close();
    socketServer = null;
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    return new Promise((resolve) => closing.close(() => resolve()));
  }

  return {
    origin,
    start,
    stop,
    closeDevice: (deviceId) => readers?.closeDevice(deviceId),
    isRunning: () => server !== null,
  };
}

module.exports = { MAX_BODY_BYTES, SUBPROTOCOL, createCompanionServer };
