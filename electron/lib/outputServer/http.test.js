import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import outputHttpModule from './http.js';

const { createOutputHttpHandler } = outputHttpModule;
const servers = new Set();
const temporaryRoots = new Set();

function createFixtureRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-output-http-'));
  temporaryRoots.add(root);
  const overlayRoot = path.join(root, 'overlay');
  const sharedRoot = path.join(root, 'shared');
  fs.mkdirSync(path.join(overlayRoot, 'lyrics'), { recursive: true });
  fs.mkdirSync(path.join(sharedRoot, 'assets', 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(sharedRoot, 'presentation'), { recursive: true });
  fs.writeFileSync(
    path.join(overlayRoot, 'lyrics', 'index.html'),
    '<main>Lyrics route</main>',
  );
  fs.writeFileSync(
    path.join(sharedRoot, 'presentation', 'state.mjs'),
    'export const state = true;',
  );
  fs.writeFileSync(
    path.join(sharedRoot, 'assets', 'fonts', 'jf-open-huninn-2.1.ttf'),
    Buffer.from([0, 1, 0, 0]),
  );
  return { overlayRoot, root, sharedRoot };
}

async function startHandler(options = {}) {
  const handler = createOutputHttpHandler({
    getClientCount: () => 2,
    getSnapshot: () => ({ version: 2, revision: 7 }),
    ...options,
  });
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => response.destroy(error));
  });
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
  servers.clear();
  for (const root of temporaryRoots) {
    fs.rmSync(root, { force: true, recursive: true });
  }
  temporaryRoots.clear();
});

describe('output HTTP delivery', () => {
  it('serves bounded health and canonical state projections', async () => {
    const baseUrl = await startHandler();

    const health = await fetch(`${baseUrl}/health`).then((response) =>
      response.json(),
    );
    const state = await fetch(`${baseUrl}/api/v1/state`).then((response) =>
      response.json(),
    );

    expect(health).toEqual({
      clients: 2,
      revision: 7,
      stateVersion: 2,
      status: 'ok',
    });
    expect(state).toEqual({ version: 2, revision: 7 });
  });

  it('accepts only allowlisted startup milestones with bounded JSON', async () => {
    const recordStartupMilestone = vi.fn();
    const baseUrl = await startHandler({ recordStartupMilestone });

    const accepted = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: JSON.stringify({
        name: 'first-rendered-frame',
        atUnixMs: 1_777_000_000_000,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const rejected = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: JSON.stringify({ name: 'private-path', atUnixMs: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(accepted.status).toBe(204);
    expect(recordStartupMilestone).toHaveBeenCalledWith(
      'first-rendered-frame',
      { process: 'overlay', atUnixMs: 1_777_000_000_000 },
    );
    expect(rejected.status).toBe(400);
  });

  it('fails closed for disabled, malformed, oversized, or failed startup telemetry', async () => {
    const disabledUrl = await startHandler();
    const disabled = await fetch(`${disabledUrl}/api/v1/startup-trace`, {
      body: '{}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const recordStartupMilestone = vi.fn(() => {
      throw new Error('trace unavailable');
    });
    const baseUrl = await startHandler({ recordStartupMilestone });
    const unsupported = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: '{}',
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    });
    const malformed = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: '{',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const oversized = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: JSON.stringify({ payload: 'x'.repeat(100_000) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const recordingFailed = await fetch(`${baseUrl}/api/v1/startup-trace`, {
      body: JSON.stringify({
        name: 'first-instance-ready',
        atUnixMs: 1_777_000_000_001,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(disabled.status).toBe(404);
    expect(unsupported.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(recordingFailed.status).toBe(400);
  });

  it('serves only exact static routes with browser-source security headers', async () => {
    const { overlayRoot, sharedRoot } = createFixtureRoots();
    const baseUrl = await startHandler({ overlayRoot, sharedRoot });

    const overlay = await fetch(`${baseUrl}/overlay/lyrics`);
    const shared = await fetch(`${baseUrl}/shared/presentation/state.mjs`);
    const font = await fetch(
      `${baseUrl}/shared/assets/fonts/jf-open-huninn-2.1.ttf`,
    );
    const unknown = await fetch(`${baseUrl}/overlay/lyrics/private.txt`);

    expect(await overlay.text()).toBe('<main>Lyrics route</main>');
    expect(overlay.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(await shared.text()).toBe('export const state = true;');
    expect(font.status).toBe(200);
    expect(font.headers.get('content-type')).toBe('font/ttf');
    expect(Buffer.from(await font.arrayBuffer())).toEqual(
      Buffer.from([0, 1, 0, 0]),
    );
    expect(unknown.status).toBe(404);
  });

  it('revalidates unchanged static assets with their strong ETag', async () => {
    const { overlayRoot, sharedRoot } = createFixtureRoots();
    const baseUrl = await startHandler({ overlayRoot, sharedRoot });

    const initial = await fetch(`${baseUrl}/overlay/lyrics`);
    const etag = initial.headers.get('etag');
    const unchanged = await fetch(`${baseUrl}/overlay/lyrics`, {
      headers: { 'if-none-match': etag },
    });

    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(unchanged.status).toBe(304);
  });

  it('redirects artwork to a content digest and serves only that revision', async () => {
    const { root } = createFixtureRoots();
    const artworkPath = path.join(root, 'cover.png');
    const artwork = Buffer.from('fixed artwork bytes');
    fs.writeFileSync(artworkPath, artwork);
    const digest = crypto.createHash('sha256').update(artwork).digest('hex');
    const resolveArtworkAsset = vi.fn(() => artworkPath);
    const baseUrl = await startHandler({ resolveArtworkAsset });

    const redirect = await fetch(`${baseUrl}/media/artwork/track%201`, {
      redirect: 'manual',
    });
    const immutable = await fetch(
      `${baseUrl}/media/artwork/track%201/${digest}`,
    );
    const stale = await fetch(
      `${baseUrl}/media/artwork/track%201/${'0'.repeat(64)}`,
    );

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(
      `/media/artwork/track%201/${digest}`,
    );
    expect(resolveArtworkAsset).toHaveBeenCalledWith('track 1');
    expect(Buffer.from(await immutable.arrayBuffer())).toEqual(artwork);
    expect(immutable.headers.get('cache-control')).toContain('immutable');
    expect(stale.status).toBe(404);
  });

  it('revalidates artwork redirects without exposing a file path', async () => {
    const { root } = createFixtureRoots();
    const artworkPath = path.join(root, 'cover.webp');
    fs.writeFileSync(artworkPath, Buffer.from('artwork revision'));
    const baseUrl = await startHandler({
      resolveArtworkAsset: () => artworkPath,
    });

    const initial = await fetch(`${baseUrl}/media/artwork/track-1`, {
      redirect: 'manual',
    });
    const unchanged = await fetch(`${baseUrl}/media/artwork/track-1`, {
      headers: { 'if-none-match': initial.headers.get('etag') },
      redirect: 'manual',
    });

    expect(initial.headers.get('location')).not.toContain(root);
    expect(unchanged.status).toBe(304);
  });

  it('rejects non-GET methods outside the telemetry endpoint', async () => {
    const baseUrl = await startHandler();

    const response = await fetch(`${baseUrl}/api/v1/state`, {
      method: 'POST',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
