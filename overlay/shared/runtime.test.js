import { describe, expect, it, vi } from 'vitest';
import {
  buildWebSocketUrl,
  createOverlayConnection,
  parseOutputMessage,
} from './runtime.mjs';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
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
});
