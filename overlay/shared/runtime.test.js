import { describe, expect, it, vi } from 'vitest';
import {
  buildWebSocketUrl,
  createOverlayConnection,
  parseOutputMessage,
} from './runtime.mjs';

class FakeWebSocket {
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.listeners = new Map();
    this.close = vi.fn();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, detail = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail);
  }
}

function snapshot(revision, overrides = {}) {
  return {
    version: 2,
    revision,
    generatedAt: '2026-08-22T00:00:00.000Z',
    displayDelayMs: 0,
    playback: { track: null },
    queue: { items: [] },
    lyrics: { lines: [], activeLineIndex: -1 },
    ...overrides,
  };
}

describe('overlay WebSocket runtime', () => {
  it('builds same-host ws and wss URLs', () => {
    expect(
      buildWebSocketUrl({ protocol: 'http:', host: '127.0.0.1:8700' }),
    ).toBe('ws://127.0.0.1:8700/ws');
    expect(buildWebSocketUrl({ protocol: 'https:', host: 'localhost' })).toBe(
      'wss://localhost/ws',
    );
  });

  it('parses only supported state envelopes', () => {
    expect(
      parseOutputMessage(
        JSON.stringify({ type: 'state.snapshot', snapshot: snapshot(1) }),
      ),
    ).toMatchObject({ type: 'state.snapshot', snapshot: { revision: 1 } });
    expect(parseOutputMessage('{bad json')).toBeNull();
    expect(
      parseOutputMessage(
        JSON.stringify({ type: 'command', snapshot: snapshot(1) }),
      ),
    ).toBeNull();
    expect(
      parseOutputMessage(
        JSON.stringify({
          type: 'overlay.config.changed',
          overlayConfig: {
            version: 2,
            revision: 3,
            slots: { lyrics: { templateId: 'focus-line' } },
          },
        }),
      ),
    ).toMatchObject({
      type: 'overlay.config.changed',
      overlayConfig: { revision: 3 },
    });
  });

  it('accepts resnapshots, ignores stale updates, and reconnects', () => {
    FakeWebSocket.instances = [];
    const scheduled = [];
    const snapshots = [];
    const configs = [];
    const statuses = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => snapshots.push(value.revision),
      kind: 'lyrics',
      onConfig: (value) => configs.push(value?.templateId ?? null),
      onStatus: (value) => statuses.push(value),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });

    connection.start();
    const first = FakeWebSocket.instances[0];
    expect(first.url).toBe('ws://127.0.0.1:8700/ws');
    expect(first.protocols).toBe('utawakui.output.v3');
    first.emit('open');
    first.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
        overlayConfig: {
          version: 2,
          revision: 1,
          slots: { lyrics: { templateId: 'focus-line' } },
        },
      }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(2) }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(4) }),
    });
    first.emit('message', {
      data: JSON.stringify({
        type: 'overlay.config.changed',
        overlayConfig: {
          version: 2,
          revision: 2,
          slots: { lyrics: { templateId: 'karaoke-stack' } },
        },
      }),
    });
    expect(snapshots).toEqual([3, 4]);
    expect(configs).toEqual(['focus-line', 'karaoke-stack']);

    first.emit('close');
    expect(scheduled[0].delay).toBe(500);
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting']);
    scheduled[0].callback();
    expect(FakeWebSocket.instances).toHaveLength(2);

    const second = FakeWebSocket.instances[1];
    second.emit('message', {
      data: JSON.stringify({ type: 'state.snapshot', snapshot: snapshot(4) }),
    });
    expect(snapshots).toEqual([3, 4, 4]);

    connection.stop();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('assembles split content and state only after all references resolve', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const configs = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      kind: 'lyrics',
      onSnapshot: (value) => received.push(value),
      onConfig: (value) => configs.push(value?.templateId ?? null),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'overlay.config.snapshot',
        overlayConfig: {
          version: 2,
          revision: 4,
          slots: { lyrics: { templateId: 'karaoke-stack' } },
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 7,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: {
            status: 'playing',
            positionMs: 1200,
            durationMs: 90000,
            rate: 1,
            track: { id: 'track-1', title: 'Song' },
          },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 100,
            activeLineId: 'line-2',
            activeSegmentId: null,
          },
          queue: { documentId: 'queue-current', documentRevision: 3 },
        },
      }),
    });
    expect(received).toEqual([]);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'lyrics.document',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 2,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          granularity: 'T1',
          source: { language: 'ja' },
          lines: [
            { lineId: 'line-1', text: 'first', startMs: 0, endMs: 1000 },
            { lineId: 'line-2', text: 'second', startMs: 1000, endMs: null },
          ],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'queue.document',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 3,
        document: {
          documentId: 'queue-current',
          sourceName: 'Setlist',
          items: [
            {
              state: 'current',
              track: { id: 'track-1', title: 'Song' },
            },
          ],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 8,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: {
            status: 'playing',
            positionMs: 1300,
            durationMs: 90000,
            rate: 1,
            track: { id: 'track-1', title: 'Song' },
          },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 100,
            activeLineId: 'line-2',
            activeSegmentId: null,
          },
          queue: { documentId: 'queue-current', documentRevision: 3 },
        },
      }),
    });

    expect(configs).toEqual(['karaoke-stack']);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      version: 2,
      revision: 8,
      playback: { positionMs: 1300 },
      queue: { sourceName: 'Setlist' },
      lyrics: {
        activeLineIndex: 1,
        lines: [{ text: 'first' }, { text: 'second' }],
      },
    });
    connection.stop();
  });

  it('accepts lower revisions only after a new boot or source epoch', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(8),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(2),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-2',
        sourceStatus: 'ready',
        snapshot: snapshot(1),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-2',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(0),
      }),
    });

    expect(received).toEqual([8, 1, 0]);
    connection.stop();
  });

  it('accepts a fresh initial snapshot after an explicit stop and restart', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
      }),
    });
    connection.stop();
    connection.start();
    FakeWebSocket.instances[1].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
      }),
    });

    expect(received).toEqual([3, 3]);
    connection.stop();
  });

  it('delivers the safe empty snapshot when the source becomes unavailable', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(8),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: null,
        sourceStatus: 'unavailable',
        snapshot: snapshot(0),
      }),
    });

    expect(received).toEqual([8, 0]);
    connection.stop();
  });

  it('clears stale output while a split source is syncing', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'source.status',
        bootId: 'boot-1',
        sourceEpoch: null,
        sourceStatus: 'syncing',
      }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      version: 2,
      revision: 0,
      playback: { status: 'idle', track: null },
    });
    connection.stop();
  });

  it('delays snapshot delivery from generatedAt and clears queued state when compensation changes', () => {
    FakeWebSocket.instances = [];
    let nowMs = Date.parse('2026-08-22T00:00:00.100Z');
    const scheduled = new Map();
    const cancelled = [];
    const received = [];
    let nextTimerId = 0;
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      now: () => nowMs,
      onSnapshot: (value) => received.push(value.revision),
      schedule: (callback, delay) => {
        nextTimerId += 1;
        scheduled.set(nextTimerId, { callback, delay });
        return nextTimerId;
      },
      cancelSchedule: (timerId) => {
        cancelled.push(timerId);
        scheduled.delete(timerId);
      },
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1, {
          displayDelayMs: 500,
          generatedAt: '2026-08-22T00:00:00.000Z',
        }),
      }),
    });
    expect(received).toEqual([]);
    expect([...scheduled.values()][0].delay).toBe(400);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        snapshot: snapshot(2, {
          displayDelayMs: 0,
          generatedAt: '2026-08-22T00:00:00.100Z',
        }),
      }),
    });
    expect(cancelled).toContain(1);
    expect(received).toEqual([2]);

    connection.stop();
  });

  it('reports trace-only instance readiness and the first painted live frame without content', async () => {
    FakeWebSocket.instances = [];
    const frameCallbacks = [];
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '?startupTrace=1',
      },
      WebSocketImpl: FakeWebSocket,
      fetchImpl,
      performance: { timeOrigin: 1000, now: () => 250 },
      requestAnimationFrame: (callback) => frameCallbacks.push(callback),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1),
      }),
    });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/startup-trace',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'first-instance-ready',
          atUnixMs: 1250,
        }),
      }),
    );
    expect(frameCallbacks).toHaveLength(1);

    frameCallbacks.shift()();
    frameCallbacks.shift()();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/api/v1/startup-trace',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'first-rendered-frame',
          atUnixMs: 1250,
        }),
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('lyrics');

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        snapshot: snapshot(2),
      }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    connection.stop();
  });

  it('never sends overlay telemetry without the explicit trace query', () => {
    FakeWebSocket.instances = [];
    const fetchImpl = vi.fn();
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '',
      },
      WebSocketImpl: FakeWebSocket,
      fetchImpl,
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });
    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1),
      }),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    connection.stop();
  });
});
