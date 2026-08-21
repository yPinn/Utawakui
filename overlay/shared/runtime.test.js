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

function snapshot(revision) {
  return {
    version: 1,
    revision,
    playback: { track: null },
    queue: { items: [] },
    lyrics: { lines: [], activeLineIndex: -1 },
  };
}

describe('overlay WebSocket runtime', () => {
  it('builds same-host ws and wss URLs', () => {
    expect(
      buildWebSocketUrl({ protocol: 'http:', host: '127.0.0.1:17404' }),
    ).toBe('ws://127.0.0.1:17404/ws');
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
  });

  it('accepts resnapshots, ignores stale updates, and reconnects', () => {
    FakeWebSocket.instances = [];
    const scheduled = [];
    const snapshots = [];
    const statuses = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:17404' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => snapshots.push(value.revision),
      onStatus: (value) => statuses.push(value),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });

    connection.start();
    const first = FakeWebSocket.instances[0];
    expect(first.url).toBe('ws://127.0.0.1:17404/ws');
    first.emit('open');
    first.emit('message', {
      data: JSON.stringify({ type: 'state.snapshot', snapshot: snapshot(3) }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(2) }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(4) }),
    });
    expect(snapshots).toEqual([3, 4]);

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
});
