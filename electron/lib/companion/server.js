'use strict';

const http = require('node:http');
const { WebSocketServer } = require('ws');
const { parseCompanionCommand } = require('./commandGate');
const { normalizeLabel } = require('./deviceStore');

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
  approvals = null,
  onPairingRequest = () => {},
  commands = null,
  artwork = null,
  portraitArtwork = null,
  searchCatalog = null,
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
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // Silent loop for lock-screen controls.
      'media-src blob:',
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

  // A valid code opens a request the computer must approve; the phone gets
  // only a claim token and the match code to compare.
  async function pair(request, response) {
    const body = await readJsonBody(request);
    const fail = () => sendJson(response, 400, { error: 'pairing-failed' });
    if (!body || typeof body !== 'object' || !approvals) return fail();
    const label = normalizeLabel(body.label);
    if (!label || !pairing.claim(body.code)) return fail();
    const opened = approvals.open(label);
    if (!opened) return sendJson(response, 409, { error: 'pairing-busy' });
    try {
      onPairingRequest();
    } catch {
      // Settings refreshes on its own; the request stays valid.
    }
    return sendJson(response, 202, opened);
  }

  async function pairStatus(request, response) {
    const body = await readJsonBody(request);
    const result = approvals?.poll(body?.claimToken) ?? { state: 'unknown' };
    if (result.state === 'approved')
      return sendJson(response, 200, {
        state: 'approved',
        credential: result.credential,
      });
    if (result.state === 'pending')
      return sendJson(response, 202, { state: 'pending' });
    return sendJson(response, 403, { state: result.state });
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
    // Only the connected phone controls playback; a displaced one must take
    // over first.
    if (readers && !readers.isActive(device.id))
      return reject(409, 'displaced');
    const parsed = parseCompanionCommand(await readJsonBody(request));
    if (!parsed) return reject(400, 'invalid');
    const refused = commands.admission.admit(device.id, parsed);
    if (refused) return reject(refused === 'stale' ? 409 : 429, refused);
    const {
      command: name,
      revision,
      trackId,
      positionMs,
      queueIndex,
      libraryTrackId,
      outputChange,
    } = parsed;
    const outcome = await commands.dispatch({
      command: name,
      revision,
      trackId,
      ...(positionMs === undefined ? {} : { positionMs }),
      ...(queueIndex === undefined ? {} : { queueIndex }),
      ...(libraryTrackId === undefined ? {} : { libraryTrackId }),
      ...(outputChange === undefined ? {} : { outputChange }),
    });
    if (outcome === 'applied')
      return sendJson(response, 200, { result: 'applied' });
    if (outcome === 'timed_out')
      return sendJson(response, 504, { result: 'timed_out' });
    return reject(409, outcome);
  }

  // Same scope as the catalog; non-library IDs read as missing.
  function hasArtworkTrack(trackId) {
    return (
      typeof trackId === 'string' && trackId.length > 0 && trackId.length <= 200
    );
  }

  async function sendArtwork(request, response, resolveTarget, read) {
    const credential = bearer(request);
    const device = devices.authenticate(credential);
    if (!device) return sendJson(response, 401, { error: 'unauthorized' });
    const allowedTarget = () =>
      isGateEnabled() && readers?.isActive(device.id) ? resolveTarget() : null;
    const target = allowedTarget();
    if (!target) return sendJson(response, 404, { error: 'not-found' });
    const asset = await read(target);
    if (
      !asset?.body?.length ||
      allowedTarget() !== target ||
      devices.authenticate(credential)?.id !== device.id
    )
      return sendJson(response, 404, { error: 'not-found' });
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': asset.type,
      'Content-Length': asset.body.length,
    });
    response.end(asset.body);
  }

  function trackArtwork(request, response, url) {
    const id = url.searchParams.get('id');
    return sendArtwork(
      request,
      response,
      () => (hasArtworkTrack(id) ? id : null),
      artwork.read,
    );
  }

  function outputPortraitArtwork(request, response, url) {
    const presetId = url.searchParams.get('id');
    const artist = presetId === '';
    function resolveTarget() {
      if (!portraitArtwork.isEnabled() || presetId === null) return null;
      const snapshot = portraitArtwork.getSnapshot();
      const slot = snapshot?.outputSlots?.find(
        ({ templateId }) => templateId === 'phantom-thieves',
      );
      if (slot?.options.phantomMode !== 'side-card') return null;
      return artist
        ? snapshot.state.playback.track?.id
        : slot.portraits?.items.find(({ id }) => id === presetId)
            ?.phantomPortraitPhoto;
    }
    return sendArtwork(request, response, resolveTarget, (id) =>
      portraitArtwork.read(artist ? 'artist' : 'custom', id),
    );
  }

  function catalog(request, response, url) {
    const device = devices.authenticate(bearer(request));
    if (!device) return sendJson(response, 401, { error: 'unauthorized' });
    if (!readers?.isActive(device.id))
      return sendJson(response, 409, { error: 'displaced' });
    const result = searchCatalog(url.searchParams);
    return result
      ? sendJson(response, 200, result)
      : sendJson(response, 400, { error: 'invalid' });
  }

  const routes = new Map([
    ['POST /m/api/v1/pair', pair],
    ['POST /m/api/v1/pair/status', pairStatus],
    ['POST /m/api/v1/command', command],
    ...(artwork ? [['GET /m/api/v1/artwork', trackArtwork]] : []),
    ...(portraitArtwork
      ? [['GET /m/api/v1/output-portrait', outputPortraitArtwork]]
      : []),
    ...(searchCatalog ? [['GET /m/api/v1/catalog', catalog]] : []),
  ]);

  async function handle(request, response) {
    if (request.headers.host !== authority || !allowedOrigin(request))
      return sendJson(response, 403, { error: 'forbidden' });
    // The gate is rechecked per request; a notice in the UI is not a boundary.
    if (!isGateEnabled())
      return sendJson(response, 503, { error: 'unavailable' });
    const url = new URL(request.url, origin);
    // A typed or trimmed address still reaches the phone page.
    if (request.method === 'GET' && ['/', '/m'].includes(url.pathname)) {
      response.writeHead(302, { Location: '/m/', 'Cache-Control': 'no-store' });
      return response.end();
    }
    const route = routes.get(`${request.method} ${url.pathname}`);
    if (route) return route(request, response, url);
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
            // EACCES is how Windows reports a reserved (excluded) port.
            error.code === 'EADDRINUSE' || error.code === 'EACCES'
              ? 'port-in-use'
              : 'listen-failed',
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
