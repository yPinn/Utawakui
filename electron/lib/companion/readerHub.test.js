import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { CLOSE, createReaderHub } from './readerHub.js';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.sent = [];
    this.closed = null;
    this.send = vi.fn((data) => this.sent.push(JSON.parse(data)));
    this.ping = vi.fn();
    this.terminate = vi.fn(() => this.emit('close'));
  }
  close(code, reason) {
    this.closed = { code, reason };
    this.readyState = 3;
    this.emit('close');
  }
  say(value) {
    this.emit('message', Buffer.from(JSON.stringify(value)));
  }
}

function setup() {
  let listener = null;
  let snapshot = { revision: 1 };
  const timers = [];
  const repeats = [];
  const devices = {
    authenticate: vi.fn((credential) =>
      credential === 'good'
        ? { id: 'd1' }
        : credential === 'other'
          ? { id: 'd2' }
          : null,
    ),
  };
  const onReaderCount = vi.fn();
  const hub = createReaderHub({
    devices,
    snapshots: {
      get: () => snapshot,
      subscribe: vi.fn((callback) => {
        listener = callback;
        return vi.fn();
      }),
    },
    onReaderCount,
    now: () => 1234,
    setTimer: (fn) => (timers.push(fn), timers.length),
    clearTimer: (id) => (timers[id - 1] = null),
    setRepeat: (fn) => (repeats.push(fn), repeats.length),
    clearRepeat: vi.fn(),
  });
  return {
    hub,
    devices,
    onReaderCount,
    publish: (next) => {
      snapshot = next;
      listener?.(next);
    },
    fireTimers: () => timers.forEach((fn) => fn?.()),
    fireHeartbeat: () => repeats.forEach((fn) => fn()),
  };
}

describe('companion reader hub', () => {
  it('sends the current snapshot after auth and every later publish', () => {
    const { hub, publish, onReaderCount } = setup();
    const socket = new FakeSocket();
    hub.attach(socket);
    socket.say({ type: 'auth', credential: 'good' });
    expect(socket.sent).toEqual([
      { type: 'snapshot', sentAt: 1234, snapshot: { revision: 1 } },
    ]);
    publish({ revision: 2 });
    expect(socket.sent.at(-1).snapshot).toEqual({ revision: 2 });
    expect(onReaderCount).toHaveBeenLastCalledWith(1);
  });

  it('closes unauthenticated, wrong and late sockets', () => {
    const { hub, fireTimers } = setup();
    const wrong = new FakeSocket();
    hub.attach(wrong);
    wrong.say({ type: 'auth', credential: 'bad' });
    expect(wrong.closed.code).toBe(CLOSE.unauthorized);
    const malformed = new FakeSocket();
    hub.attach(malformed);
    malformed.emit('message', Buffer.from('{oops'));
    expect(malformed.closed.code).toBe(CLOSE.unauthorized);
    const silent = new FakeSocket();
    hub.attach(silent);
    fireTimers();
    expect(silent.closed.code).toBe(CLOSE.policy);
  });

  it('treats the channel as read-only after auth', () => {
    const { hub, onReaderCount } = setup();
    const socket = new FakeSocket();
    hub.attach(socket);
    socket.say({ type: 'auth', credential: 'good' });
    socket.say({ type: 'command' });
    expect(socket.closed).toEqual({
      code: CLOSE.policy,
      reason: 'read-only channel',
    });
    expect(onReaderCount).toHaveBeenLastCalledWith(0);
  });

  it('keeps at most two readers per device and closes them on revoke', () => {
    const { hub } = setup();
    const sockets = [1, 2, 3].map(() => new FakeSocket());
    for (const socket of sockets) {
      hub.attach(socket);
      socket.say({ type: 'auth', credential: 'good' });
    }
    const other = new FakeSocket();
    hub.attach(other);
    other.say({ type: 'auth', credential: 'other' });
    expect(sockets[0].closed.code).toBe(CLOSE.replaced);
    expect(hub.count()).toBe(3);
    hub.closeDevice('d1');
    expect(sockets[1].closed.code).toBe(CLOSE.unauthorized);
    expect(sockets[2].closed.code).toBe(CLOSE.unauthorized);
    expect(other.closed).toBeNull();
    hub.closeAll();
    expect(other.closed.code).toBe(CLOSE.shutdown);
    expect(hub.count()).toBe(0);
  });

  it('drops slow readers and terminates sockets that miss a heartbeat', () => {
    const { hub, publish, fireHeartbeat } = setup();
    const slow = new FakeSocket();
    hub.attach(slow);
    slow.say({ type: 'auth', credential: 'good' });
    slow.bufferedAmount = 2 * 1024 * 1024;
    publish({ revision: 3 });
    expect(slow.closed.reason).toBe('slow reader');

    const quiet = new FakeSocket();
    hub.attach(quiet);
    quiet.say({ type: 'auth', credential: 'other' });
    fireHeartbeat();
    expect(quiet.ping).toHaveBeenCalled();
    fireHeartbeat();
    expect(quiet.terminate).toHaveBeenCalled();
  });
});
