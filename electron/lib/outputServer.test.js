import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    expect(DEFAULT_OUTPUT_PORT).toBe(8700);
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
      stateVersion: 2,
      revision: 0,
      clients: 0,
    });

    const state = await fetch(`${status.httpUrl}/api/v1/state`);
    expect(state.status).toBe(200);
    expect(state.headers.get('access-control-allow-origin')).toBeNull();
    expect(await state.json()).toMatchObject({ version: 2, revision: 0 });

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
      '/overlay/artwork',
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

    const appearance = await fetch(
      `${status.httpUrl}/overlay/shared/appearance.mjs`,
    );
    expect(appearance.status).toBe(200);

    const encodedTraversal = await fetch(
      `${status.httpUrl}/overlay/%2e%2e%2fpackage.json`,
    );
    expect(encodedTraversal.status).toBe(404);

    const unlistedFile = await fetch(
      `${status.httpUrl}/overlay/lyrics/lyrics.test.js`,
    );
    expect(unlistedFile.status).toBe(404);
  });

  it('serves validated track artwork without accepting filesystem input', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-output-art-'));
    const imagePath = path.join(dir, 'thumbnail.png');
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const resolvedIds = [];
    const server = createServer({
      resolveArtworkAsset: (trackId) => {
        resolvedIds.push(trackId);
        return trackId === 'track one' ? imagePath : null;
      },
    });

    try {
      const status = await server.start();
      const artwork = await fetch(
        `${status.httpUrl}/media/artwork/${encodeURIComponent('track one')}`,
      );
      expect(artwork.status).toBe(200);
      expect(artwork.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await artwork.arrayBuffer())).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );

      const missing = await fetch(`${status.httpUrl}/media/artwork/missing`);
      expect(missing.status).toBe(404);
      const traversal = await fetch(
        `${status.httpUrl}/media/artwork/${encodeURIComponent('../secret')}`,
      );
      expect(traversal.status).toBe(404);
      expect(resolvedIds).toEqual(['track one', 'missing', '../secret']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sends a full snapshot on connect and semantic updates afterward', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);

    expect(await initialMessage).toMatchObject({
      type: 'state.snapshot',
      snapshot: { version: 2, revision: 0 },
      overlayConfig: { version: 2, revision: 0, slots: {} },
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

  it('publishes typed source readiness and resets revisions for a new identity', async () => {
    const server = createServer({
      initialProjection: {
        bootId: 'boot-1',
        sourceEpoch: null,
        sourceSynchronization: 'unavailable',
        unavailableReason: 'renderer_not_connected',
        snapshot: createEmptyOutputSnapshot({ revision: 0 }),
      },
    });
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);

    expect(await initialMessage).toMatchObject({
      type: 'state.snapshot',
      bootId: 'boot-1',
      sourceEpoch: null,
      sourceStatus: 'unavailable',
      unavailableReason: 'renderer_not_connected',
      snapshot: { version: 2, revision: 0 },
    });

    const readyMessage = waitForMessage(socket);
    server.setProjectionState({
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceSynchronization: 'ready',
      unavailableReason: null,
      snapshot: createEmptyOutputSnapshot({ revision: 4 }),
    });
    expect(await readyMessage).toMatchObject({
      type: 'state.changed',
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
      snapshot: { version: 2, revision: 4 },
    });

    const nextBootMessage = waitForMessage(socket);
    server.setProjectionState({
      bootId: 'boot-2',
      sourceEpoch: 'epoch-1',
      sourceSynchronization: 'ready',
      unavailableReason: null,
      snapshot: createEmptyOutputSnapshot({ revision: 1 }),
    });
    expect(await nextBootMessage).toMatchObject({
      bootId: 'boot-2',
      sourceStatus: 'ready',
      snapshot: { version: 2, revision: 1 },
    });
    socket.close();
  });

  it('pushes independent overlay slot changes without changing playback state', async () => {
    const server = createServer({
      overlaySlots: { lyrics: { templateId: 'focus-line' } },
    });
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);
    expect(await initialMessage).toMatchObject({
      overlayConfig: {
        revision: 0,
        slots: { lyrics: { templateId: 'focus-line' } },
      },
    });

    const configMessage = waitForMessage(socket);
    server.setOverlaySlots({
      lyrics: { templateId: 'karaoke-stack' },
      setlist: { templateId: 'queue-board' },
    });
    expect(await configMessage).toMatchObject({
      type: 'overlay.config.changed',
      overlayConfig: {
        revision: 1,
        slots: {
          lyrics: { templateId: 'karaoke-stack' },
          setlist: { templateId: 'queue-board' },
        },
      },
    });
    expect(server.getSnapshot().revision).toBe(0);
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
    expect(() => server.publish({ version: 2 })).toThrow(TypeError);
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
