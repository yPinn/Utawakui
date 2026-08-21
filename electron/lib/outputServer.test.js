import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import outputContract from '../../shared/outputContract.js';
import outputServerModule from './outputServer.js';

const { createEmptyOutputSnapshot } = outputContract;
const {
  DEFAULT_OUTPUT_PORT,
  OUTPUT_HOST,
  OUTPUT_MAX_INBOUND_PAYLOAD_BYTES,
  createOutputServer,
} = outputServerModule;

const servers = new Set();

function createServer(options = {}) {
  const server = createOutputServer({ port: 0, ...options });
  servers.add(server);
  return server;
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function waitForMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(JSON.parse(data.toString())));
    socket.once('error', reject);
  });
}

function waitForClose(socket) {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

function connect(status, options = {}) {
  return new WebSocket(status.wsUrl, {
    origin: status.httpUrl,
    perMessageDeflate: false,
    ...options,
  });
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.stop()));
  servers.clear();
});

describe('outputServer', () => {
  it('uses a stable production port and an immutable loopback host', () => {
    expect(DEFAULT_OUTPUT_PORT).toBeGreaterThan(1024);
    expect(DEFAULT_OUTPUT_PORT).toBeLessThan(65536);
    expect(OUTPUT_HOST).toBe('127.0.0.1');
    expect(createOutputServer().getStatus()).toMatchObject({
      running: false,
      host: OUTPUT_HOST,
      port: DEFAULT_OUTPUT_PORT,
      revision: 0,
    });
  });

  it('serves only allowlisted read-only HTTP routes', async () => {
    const server = createServer();
    const status = await server.start();

    const health = await fetch(`${status.httpUrl}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await health.json()).toEqual({
      status: 'ok',
      stateVersion: 1,
      revision: 0,
      clients: 0,
    });

    const state = await fetch(`${status.httpUrl}/api/v1/state`);
    expect(state.status).toBe(200);
    expect(state.headers.get('access-control-allow-origin')).toBeNull();
    expect(await state.json()).toMatchObject({ version: 1, revision: 0 });

    const missing = await fetch(`${status.httpUrl}/not-allowed`);
    expect(missing.status).toBe(404);

    const encodedTraversal = await fetch(
      `${status.httpUrl}/..%2fapi%2fv1%2fstate`,
    );
    expect(encodedTraversal.status).toBe(404);

    const method = await fetch(`${status.httpUrl}/api/v1/state`, {
      method: 'POST',
    });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET');
  });

  it('serves only explicit overlay assets with browser-source headers', async () => {
    const server = createServer();
    const status = await server.start();

    for (const route of [
      '/overlay/lyrics',
      '/overlay/now-playing',
      '/overlay/setlist',
    ]) {
      const response = await fetch(`${status.httpUrl}${route}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'none'",
      );
      expect(await response.text()).toContain('<!doctype html>');
    }

    const tokens = await fetch(`${status.httpUrl}/overlay/shared/tokens.css`);
    expect(tokens.status).toBe(200);
    expect(tokens.headers.get('content-type')).toContain('text/css');
    expect(await tokens.text()).toContain('--ovl-primitive-color-ink');

    const runtime = await fetch(`${status.httpUrl}/overlay/shared/runtime.mjs`);
    expect(runtime.status).toBe(200);
    expect(runtime.headers.get('content-type')).toContain('text/javascript');

    const preview = await fetch(`${status.httpUrl}/overlay/shared/preview.mjs`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toContain('text/javascript');

    const encodedTraversal = await fetch(
      `${status.httpUrl}/overlay/%2e%2e%2fpackage.json`,
    );
    expect(encodedTraversal.status).toBe(404);

    const unlistedFile = await fetch(
      `${status.httpUrl}/overlay/lyrics/lyrics.test.js`,
    );
    expect(unlistedFile.status).toBe(404);
  });

  it('sends a full snapshot on connect and semantic updates afterward', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);

    expect(await initialMessage).toMatchObject({
      type: 'state.snapshot',
      snapshot: { version: 1, revision: 0 },
    });

    const updateMessage = waitForMessage(socket);
    const nextSnapshot = createEmptyOutputSnapshot({
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
    });
    expect(server.publish(nextSnapshot)).toBe(true);
    expect(await updateMessage).toEqual({
      type: 'state.changed',
      revision: 1,
      snapshot: nextSnapshot,
    });

    expect(server.publish(nextSnapshot)).toBe(false);
    const current = await fetch(`${status.httpUrl}/api/v1/state`);
    expect((await current.json()).revision).toBe(1);
    socket.close();
  });

  it('canonicalizes published state and rejects malformed snapshots', async () => {
    const server = createServer();
    await server.start();
    const snapshot = {
      ...createEmptyOutputSnapshot({
        revision: 2,
        generatedAt: '2026-08-22T00:00:00.000Z',
      }),
      privatePath: 'C:\\Users\\secret.mp3',
    };

    expect(server.publish(snapshot)).toBe(true);
    expect(server.getSnapshot()).not.toHaveProperty('privatePath');
    expect(() => server.publish({ version: 1 })).toThrow(TypeError);
  });

  it('rejects cross-origin WebSocket upgrades', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = connect(status, { origin: 'https://example.com' });

    const responseStatus = await new Promise((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
        response.resume();
      });
      socket.once('error', reject);
    });

    expect(responseStatus).toBe(403);
    socket.terminate();

    const missingOrigin = new WebSocket(status.wsUrl, {
      perMessageDeflate: false,
    });
    const missingOriginStatus = await new Promise((resolve, reject) => {
      missingOrigin.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
        response.resume();
      });
      missingOrigin.once('error', reject);
    });
    expect(missingOriginStatus).toBe(403);
    missingOrigin.terminate();
  });

  it('keeps the channel server-to-client only and caps inbound payloads', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);
    await initialMessage;

    const close = waitForClose(socket);
    socket.send('client commands are not supported');
    expect(await close).toEqual({ code: 1008, reason: 'read-only channel' });

    const oversized = connect(status);
    const oversizedInitial = waitForMessage(oversized);
    await waitForOpen(oversized);
    await oversizedInitial;
    const oversizedClose = waitForClose(oversized);
    oversized.send('x'.repeat(OUTPUT_MAX_INBOUND_PAYLOAD_BYTES + 1));
    expect((await oversizedClose).code).toBe(1009);

    const fragmented = connect(status);
    const fragmentedInitial = waitForMessage(fragmented);
    await waitForOpen(fragmented);
    await fragmentedInitial;
    const fragmentedClose = waitForClose(fragmented);
    for (let index = 0; index < 17; index += 1) {
      fragmented.send('x', { fin: false });
    }
    expect((await fragmentedClose).code).toBe(1008);
  });

  it('terminates clients that miss heartbeat pongs', async () => {
    const server = createServer({ heartbeatIntervalMs: 15 });
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);
    await initialMessage;
    socket.pong = () => {};

    const closed = await waitForClose(socket);
    expect(closed.code).toBe(1006);
  });

  it('is lifecycle-idempotent, reports collisions, and closes clients', async () => {
    const server = createServer();
    const status = await server.start();
    expect(await server.start()).toEqual(status);

    const collision = createServer({ port: status.port });
    await expect(collision.start()).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(collision.getStatus().running).toBe(false);

    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);
    await initialMessage;
    const closed = waitForClose(socket);
    await server.stop();
    expect((await closed).code).toBe(1001);
    expect(server.getStatus()).toMatchObject({ running: false, clients: 0 });
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
