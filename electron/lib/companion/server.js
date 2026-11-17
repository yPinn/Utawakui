'use strict';

const http = require('node:http');

const MAX_BODY_BYTES = 1024;
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
  createHttpServer = http.createServer,
}) {
  const authority = `${address}:${port}`;
  const origin = `http://${authority}`;
  const sockets = new Set();
  let server = null;

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

  const routes = new Map([['POST /m/api/v1/pair', pair]]);

  async function handle(request, response) {
    if (request.headers.host !== authority || !allowedOrigin(request))
      return sendJson(response, 403, { error: 'forbidden' });
    // The gate is rechecked per request; a notice in the UI is not a boundary.
    if (!isGateEnabled())
      return sendJson(response, 503, { error: 'unavailable' });
    const url = new URL(request.url, origin);
    const route = routes.get(`${request.method} ${url.pathname}`);
    if (!route) return sendJson(response, 404, { error: 'not-found' });
    return route(request, response);
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
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    return new Promise((resolve) => closing.close(() => resolve()));
  }

  return { origin, start, stop, isRunning: () => server !== null };
}

module.exports = { MAX_BODY_BYTES, createCompanionServer };
