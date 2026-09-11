import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import outputContract from '../../shared/outputContract.js';
import outputStreamContract from '../../shared/outputStreamContract.js';
import outputServerModule from './outputServer.js';

const { createEmptyOutputSnapshot } = outputContract;
const { OUTPUT_V3_SUBPROTOCOL } = outputStreamContract;
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

function connectV3(status, options = {}) {
  return new WebSocket(status.wsUrl, OUTPUT_V3_SUBPROTOCOL, {
    origin: status.httpUrl,
    perMessageDeflate: false,
    ...options,
  });
}

function waitForMessages(socket, count) {
  return new Promise((resolve, reject) => {
    const messages = [];
    socket.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length === count) resolve(messages);
    });
    socket.once('error', reject);
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function splitProjection(overrides = {}) {
  const dynamic = {
    generatedAt: '2026-08-23T00:00:00.000Z',
    displayDelayMs: 0,
    playback: {
      status: 'playing',
      positionMs: 1200,
      durationMs: 180000,
      rate: 1,
      track: { id: 'track-1', title: 'Song' },
    },
    lyrics: {
      documentId: 'lyrics-1',
      documentRevision: 1,
      offsetMs: 0,
      activeLineId: 'line-1',
      activeSegmentId: null,
    },
    queue: { documentId: 'queue-current', documentRevision: 1 },
    musicStructure: {
      documentId: `music-structure-${'a'.repeat(64)}`,
      documentRevision: 1,
    },
  };
  return {
    bootId: 'boot-split',
    sourceEpoch: 'epoch-split-1',
    sourceSynchronization: 'ready',
    unavailableReason: null,
    snapshot: {
      ...createEmptyOutputSnapshot({
        revision: 1,
        generatedAt: dynamic.generatedAt,
      }),
      playback: dynamic.playback,
    },
    streams: {
      lyrics: {
        revision: 1,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          granularity: 'T1',
          source: { language: 'ja' },
          lines: [
            {
              lineId: 'line-1',
              text: '歌詞',
              startMs: 1000,
              endMs: 2000,
            },
          ],
        },
      },
      musicStructure: {
        revision: 1,
        document: {
          documentId: `music-structure-${'a'.repeat(64)}`,
          trackId: 'track-1',
          sourceRevision: 'a'.repeat(64),
          sourceDurationMs: 180000,
          level: 'M2',
          tempo: { bpm: 120, confidence: 0.8 },
          beats: [{ timeMs: 1000, downbeat: true, confidence: 0.9 }],
          sections: [
            {
              sectionId: 'section_1',
              startMs: 0,
              endMs: 10000,
              role: 'chorus',
              confidence: 0.8,
            },
          ],
        },
      },
      queue: {
        revision: 1,
        document: {
          documentId: 'queue-current',
          sourceName: 'Set',
          items: [
            {
              state: 'current',
              track: { id: 'track-1', title: 'Song' },
            },
          ],
        },
      },
      state: { revision: 1, payload: dynamic },
    },
    ...overrides,
  };
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

  it('rejects invalid lifecycle and projection identity inputs', () => {
    expect(() => createOutputServer({ port: -1 })).toThrow(
      'Output server port must be an integer from 0 to 65535',
    );
    expect(() => createOutputServer({ heartbeatIntervalMs: 9 })).toThrow(
      'Output server heartbeat interval must be an integer of at least 10ms',
    );

    const server = createServer();
    const valid = splitProjection();
    expect(() => server.setProjectionState(null)).toThrow(
      'Output projection state must be an object',
    );
    expect(() => server.setProjectionState({ ...valid, bootId: '' })).toThrow(
      'Output projection state requires bootId',
    );
    expect(() =>
      server.setProjectionState({ ...valid, sourceEpoch: '' }),
    ).toThrow('Output projection state has invalid sourceEpoch');
    expect(() =>
      server.setProjectionState({
        ...valid,
        sourceSynchronization: 'private',
      }),
    ).toThrow('Output projection state has invalid readiness');
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

  it('accepts only bounded content-free startup telemetry when tracing is enabled', async () => {
    const recordStartupMilestone = vi.fn();
    const server = createServer({ recordStartupMilestone });
    const status = await server.start();

    const accepted = await fetch(`${status.httpUrl}/api/v1/startup-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'first-rendered-frame',
        atUnixMs: 1234.5,
      }),
    });
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get('cache-control')).toBe('no-store');
    expect(recordStartupMilestone).toHaveBeenCalledWith(
      'first-rendered-frame',
      { process: 'overlay', atUnixMs: 1234.5 },
    );

    const contentBearing = await fetch(
      `${status.httpUrl}/api/v1/startup-trace`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'first-instance-ready',
          atUnixMs: 1235,
          title: 'private title',
        }),
      },
    );
    expect(contentBearing.status).toBe(400);

    const oversized = await fetch(`${status.httpUrl}/api/v1/startup-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(2048) }),
    });
    expect(oversized.status).toBe(413);
  });

  it('does not expose the startup telemetry endpoint in normal runs', async () => {
    const server = createServer();
    const status = await server.start();
    const response = await fetch(`${status.httpUrl}/api/v1/startup-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'first-rendered-frame',
        atUnixMs: 1234,
      }),
    });
    expect(response.status).toBe(404);
  });

  it('serves only explicit overlay assets with browser-source headers', async () => {
    const server = createServer();
    const status = await server.start();

    for (const route of [
      '/overlay/lyrics',
      '/overlay/now-playing',
      '/overlay/setlist',
      '/workbench/lyrics',
    ]) {
      const response = await fetch(`${status.httpUrl}${route}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'none'",
      );
      expect(await response.text()).toContain('<!doctype html>');
    }

    expect((await fetch(`${status.httpUrl}/overlay/artwork`)).status).toBe(404);

    const workbench = await fetch(`${status.httpUrl}/workbench/lyrics`);
    expect(workbench.headers.get('content-security-policy')).toContain(
      "frame-src 'self'",
    );
    const workbenchDocument = await workbench.text();
    expect(workbenchDocument).toContain('href="/overlay/shared/fallback.css"');
    expect(workbenchDocument).toContain('src="/overlay/lyrics"');

    const streamerGuide = await fetch(
      `${status.httpUrl}/workbench/streamer-guide.png`,
    );
    expect(streamerGuide.status).toBe(200);
    expect(streamerGuide.headers.get('content-type')).toBe('image/png');

    const fallback = await fetch(
      `${status.httpUrl}/overlay/shared/fallback.css`,
    );
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get('content-type')).toContain('text/css');
    expect(await fallback.text()).toContain('--ovl-primitive-color-ink');

    const appearanceStyles = await fetch(
      `${status.httpUrl}/overlay/shared/appearance.css`,
    );
    expect(appearanceStyles.status).toBe(200);
    expect(appearanceStyles.headers.get('content-type')).toContain('text/css');
    expect(await appearanceStyles.text()).toContain('@layer ovl-appearance');

    const tokens = await fetch(`${status.httpUrl}/overlay/shared/tokens.css`);
    expect(tokens.status).toBe(200);
    expect(tokens.headers.get('content-type')).toContain('text/css');
    expect(tokens.headers.get('cache-control')).toBe('no-cache');
    expect(tokens.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/);
    expect(await tokens.text()).toContain('--ovl-color-text-primary');
    const unchangedTokens = await fetch(
      `${status.httpUrl}/overlay/shared/tokens.css`,
      { headers: { 'If-None-Match': tokens.headers.get('etag') } },
    );
    expect(unchangedTokens.status).toBe(304);
    expect(await unchangedTokens.text()).toBe('');

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

    const appearanceSchema = await fetch(
      `${status.httpUrl}/shared/outputAppearance.mjs`,
    );
    expect(appearanceSchema.status).toBe(200);
    expect(appearanceSchema.headers.get('content-type')).toContain(
      'text/javascript',
    );

    const mangaContract = await fetch(
      `${status.httpUrl}/overlay/shared/mangaFrameContract.mjs`,
    );
    expect(mangaContract.status).toBe(200);
    expect(await mangaContract.text()).toContain(
      '../../shared/presentation/mangaFrameContract.mjs',
    );

    const lyricsPresentation = await fetch(
      `${status.httpUrl}/overlay/shared/lyricsPresentation.mjs`,
    );
    expect(lyricsPresentation.status).toBe(200);
    expect(lyricsPresentation.headers.get('content-type')).toContain(
      'text/javascript',
    );
    const lyricsPresentationSource = await lyricsPresentation.text();
    expect(lyricsPresentationSource).toContain(
      '../../shared/presentation/lyricsPresentation.mjs',
    );

    for (const [route, exportedSymbol] of [
      [
        '/shared/presentation/kineticPopMotion.mjs',
        'kineticPopBurstDelaySeconds',
      ],
      ['/shared/presentation/lyricsPresentation.mjs', 'analyzeLyricsSource'],
      [
        '/shared/presentation/lyricsRhythm.mjs',
        'createLyricsRhythmPresentation',
      ],
      ['/shared/presentation/mangaFrameContract.mjs', 'DEFAULT_MANGA_FRAME_ID'],
      ['/shared/presentation/state.mjs', 'selectLyricsFrame'],
    ]) {
      const sharedPresentation = await fetch(`${status.httpUrl}${route}`);
      expect(sharedPresentation.status).toBe(200);
      expect(sharedPresentation.headers.get('content-type')).toContain(
        'text/javascript',
      );
      expect(await sharedPresentation.text()).toContain(exportedSymbol);
    }

    const liveStage = await fetch(
      `${status.httpUrl}/overlay/lyrics/liveStage.mjs`,
    );
    expect(liveStage.status).toBe(200);
    expect(liveStage.headers.get('content-type')).toContain('text/javascript');
    expect(await liveStage.text()).toContain('renderLiveStagePresentation');

    const artworkMotion = await fetch(
      `${status.httpUrl}/overlay/now-playing/artworkMotion.mjs`,
    );
    expect(artworkMotion.status).toBe(200);
    expect(artworkMotion.headers.get('content-type')).toContain(
      'text/javascript',
    );
    expect(await artworkMotion.text()).toContain(
      'createArtworkMotionController',
    );

    const gsap = await fetch(`${status.httpUrl}/overlay/vendor/gsap.min.js`);
    expect(gsap.status).toBe(200);
    expect(gsap.headers.get('content-type')).toContain('text/javascript');
    expect(await gsap.text()).toContain('GreenSock');

    const encodedTraversal = await fetch(
      `${status.httpUrl}/overlay/%2e%2e%2fpackage.json`,
    );
    expect(encodedTraversal.status).toBe(404);

    const unlistedFile = await fetch(
      `${status.httpUrl}/overlay/lyrics/lyrics.test.js`,
    );
    expect(unlistedFile.status).toBe(404);
  });

  it('revalidates a changed allowlisted static asset instead of serving stale cache data', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-output-static-'),
    );
    const sharedDir = path.join(dir, 'shared');
    const tokensPath = path.join(sharedDir, 'tokens.css');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(tokensPath, ':root { --version: 1; }');
    const server = createServer({ overlayRoot: dir });

    try {
      const status = await server.start();
      const first = await fetch(`${status.httpUrl}/overlay/shared/tokens.css`);
      const firstEtag = first.headers.get('etag');
      expect(await first.text()).toContain('--version: 1');

      fs.writeFileSync(tokensPath, ':root { --version: 200; }');
      const changed = await fetch(
        `${status.httpUrl}/overlay/shared/tokens.css`,
        { headers: { 'If-None-Match': firstEtag } },
      );
      expect(changed.status).toBe(200);
      expect(changed.headers.get('etag')).not.toBe(firstEtag);
      expect(await changed.text()).toContain('--version: 200');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      const pointer = await fetch(
        `${status.httpUrl}/media/artwork/${encodeURIComponent('track one')}`,
        { redirect: 'manual' },
      );
      expect(pointer.status).toBe(302);
      expect(pointer.headers.get('cache-control')).toBe('no-cache');
      expect(pointer.headers.get('location')).toMatch(
        /^\/media\/artwork\/track%20one\/[a-f0-9]{64}$/,
      );
      const unchangedPointer = await fetch(
        `${status.httpUrl}/media/artwork/${encodeURIComponent('track one')}`,
        {
          redirect: 'manual',
          headers: { 'If-None-Match': pointer.headers.get('etag') },
        },
      );
      expect(unchangedPointer.status).toBe(304);
      const artwork = await fetch(
        `${status.httpUrl}${pointer.headers.get('location')}`,
      );
      expect(artwork.status).toBe(200);
      expect(artwork.headers.get('content-type')).toBe('image/png');
      expect(artwork.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable',
      );
      expect(Buffer.from(await artwork.arrayBuffer())).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      const unchangedArtwork = await fetch(
        `${status.httpUrl}${pointer.headers.get('location')}`,
        { headers: { 'If-None-Match': artwork.headers.get('etag') } },
      );
      expect(unchangedArtwork.status).toBe(304);

      const missing = await fetch(`${status.httpUrl}/media/artwork/missing`);
      expect(missing.status).toBe(404);
      const traversal = await fetch(
        `${status.httpUrl}/media/artwork/${encodeURIComponent('../secret')}`,
      );
      expect(traversal.status).toBe(404);
      const staleDigest = await fetch(
        `${status.httpUrl}/media/artwork/track%20one/${'0'.repeat(64)}`,
      );
      expect(staleDigest.status).toBe(404);
      expect(resolvedIds).toContain('track one');
      expect(resolvedIds).toContain('missing');
      expect(resolvedIds).toContain('../secret');
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

  it('reports aggregate delivery counts without exposing message content', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = connect(status);
    const initialMessage = waitForMessage(socket);
    await waitForOpen(socket);
    await initialMessage;

    const live = server.getStatus().delivery;
    expect(live.deliveredMessages).toBeGreaterThanOrEqual(1);
    expect(live.deliveredBytes).toBeGreaterThan(0);
    expect(live).not.toHaveProperty('messages');
    expect(live).not.toHaveProperty('payload');

    const closed = waitForClose(socket);
    socket.close();
    await closed;
    expect(
      server.getStatus().delivery.deliveredMessages,
    ).toBeGreaterThanOrEqual(1);
  });

  it('negotiates split delivery without changing legacy snapshot-v2 clients', async () => {
    const projection = splitProjection();
    const server = createServer({ initialProjection: projection });
    const status = await server.start();
    const split = connectV3(status);
    const splitMessages = waitForMessages(split, 5);
    await waitForOpen(split);

    expect(split.protocol).toBe(OUTPUT_V3_SUBPROTOCOL);
    expect((await splitMessages).map((message) => message.type)).toEqual([
      'overlay.config.snapshot',
      'lyrics.document',
      'music-structure.document',
      'queue.document',
      'state.snapshot',
    ]);

    const legacy = connect(status);
    const legacyMessage = waitForMessage(legacy);
    await waitForOpen(legacy);
    expect(await legacyMessage).toMatchObject({
      type: 'state.snapshot',
      snapshot: { version: 2, revision: 1 },
    });
    split.close();
    legacy.close();
  });

  it('reuses an immutable stream tree across clock-only projection updates', () => {
    const current = splitProjection();
    const immutableStreams = new Proxy(deepFreeze(current.streams), {});
    let server;

    expect(() => {
      server = createServer({
        initialProjection: { ...current, streams: immutableStreams },
      });
    }).not.toThrow();
    expect(() =>
      server.setProjectionState(
        {
          ...current,
          snapshot: { ...current.snapshot, revision: 2 },
          streams: immutableStreams,
        },
        { broadcast: false },
      ),
    ).not.toThrow();
  });

  it('sends only dynamic state when referenced content is unchanged', async () => {
    const server = createServer({ initialProjection: splitProjection() });
    const status = await server.start();
    const socket = connectV3(status);
    const initialMessages = waitForMessages(socket, 5);
    await waitForOpen(socket);
    await initialMessages;

    const nextMessage = waitForMessage(socket);
    const current = splitProjection();
    server.setProjectionState({
      ...current,
      snapshot: { ...current.snapshot, revision: 2 },
      streams: {
        ...current.streams,
        state: {
          revision: 2,
          payload: {
            ...current.streams.state.payload,
            playback: {
              ...current.streams.state.payload.playback,
              positionMs: 2400,
            },
          },
        },
      },
    });

    expect(await nextMessage).toMatchObject({
      type: 'state.snapshot',
      revision: 2,
      state: { playback: { positionMs: 2400 } },
    });
    socket.close();
  });

  it('replays referenced content before state when the source epoch changes', async () => {
    const current = splitProjection();
    const server = createServer({ initialProjection: current });
    const status = await server.start();
    const socket = connectV3(status);
    const initialMessages = waitForMessages(socket, 5);
    await waitForOpen(socket);
    await initialMessages;

    const nextMessages = waitForMessages(socket, 4);
    server.setProjectionState({
      ...current,
      sourceEpoch: 'epoch-split-2',
      snapshot: { ...current.snapshot, revision: 2 },
      streams: {
        ...current.streams,
        state: { ...current.streams.state, revision: 0 },
      },
    });
    expect((await nextMessages).map((message) => message.type)).toEqual([
      'lyrics.document',
      'music-structure.document',
      'queue.document',
      'state.snapshot',
    ]);
    socket.close();
  });

  it('rejects unknown requested WebSocket subprotocols', async () => {
    const server = createServer();
    const status = await server.start();
    const socket = new WebSocket(status.wsUrl, 'vendor.output.v9', {
      origin: status.httpUrl,
      perMessageDeflate: false,
    });

    const responseStatus = await new Promise((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
        response.resume();
      });
      socket.once('error', reject);
    });
    expect(responseStatus).toBe(400);
    socket.terminate();
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
