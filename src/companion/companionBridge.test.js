import { describe, expect, it, vi } from 'vitest';
import {
  CREDENTIAL_STORAGE_KEY,
  createCompanionBridge,
  rebaseSnapshotClock,
  takePairingCode,
} from './companionBridge.js';

class FakeSocket {
  static instances = [];
  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.listeners = {};
    this.sent = [];
    FakeSocket.instances.push(this);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.emit('close', { code: 1000 });
  }
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    data,
  };
}

function setup({ credential = 'cred', fetchImpl, immediate = false } = {}) {
  FakeSocket.instances = [];
  const storage = memoryStorage(
    credential ? { [CREDENTIAL_STORAGE_KEY]: credential } : {},
  );
  const statuses = [];
  const timers = [];
  const bridge = createCompanionBridge({
    location: { host: '192.168.1.20:8710' },
    storage,
    fetchImpl,
    WebSocketImpl: FakeSocket,
    now: () => 10_000,
    setTimer: immediate
      ? (fn) => fn()
      : (fn, delay) => timers.push({ fn, delay }),
    onStatus: (status) => statuses.push(status),
  });
  return { bridge, storage, statuses, timers };
}

describe('companion bridge', () => {
  it('rebases only the snapshot clock', () => {
    const snapshot = {
      state: { generatedAt: '2026-11-17T00:00:00.000Z', x: 1 },
    };
    expect(rebaseSnapshotClock(snapshot, 1500).state).toEqual({
      generatedAt: '2026-11-17T00:00:01.500Z',
      x: 1,
    });
    expect(rebaseSnapshotClock(null, 5)).toBeNull();
    expect(rebaseSnapshotClock(snapshot, Number.NaN)).toBe(snapshot);
  });

  it('takes the pairing code from the fragment and clears the address', () => {
    const history = { replaceState: vi.fn() };
    const code = 'A'.repeat(22);
    expect(
      takePairingCode({ hash: `#pair=${code}`, pathname: '/m/' }, history),
    ).toBe(code);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/m/');
    expect(
      takePairingCode({ hash: '#pair=short', pathname: '/m/' }, history),
    ).toBeNull();
    expect(
      takePairingCode({ hash: '', pathname: '/m/' }, { replaceState: vi.fn() }),
    ).toBeNull();
  });

  it('shows the match code and stores the credential only after approval', async () => {
    const replies = [
      {
        status: 202,
        json: async () => ({ claimToken: 't', matchCode: '4321' }),
      },
      { status: 202, json: async () => ({ state: 'pending' }) },
      {
        status: 200,
        json: async () => ({ state: 'approved', credential: 'new' }),
      },
    ];
    const fetchImpl = vi.fn(async () => replies.shift());
    const { bridge, storage } = setup({
      credential: null,
      fetchImpl,
      immediate: true,
    });
    const onMatchCode = vi.fn();
    expect(await bridge.pair('code', 'Phone', { onMatchCode })).toEqual({
      ok: true,
    });
    expect(onMatchCode).toHaveBeenCalledWith('4321');
    expect(storage.data.get(CREDENTIAL_STORAGE_KEY)).toBe('new');
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/m/api/v1/pair',
      '/m/api/v1/pair/status',
      '/m/api/v1/pair/status',
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      claimToken: 't',
    });
  });

  it('reports denial, expiry and a busy or failed scan', async () => {
    const run = async (replies) => {
      const fetchImpl = vi.fn(async () => replies.shift());
      const { bridge, storage } = setup({
        credential: null,
        fetchImpl,
        immediate: true,
      });
      const result = await bridge.pair('code', 'Phone');
      expect(storage.data.has(CREDENTIAL_STORAGE_KEY)).toBe(false);
      return result;
    };
    const opened = {
      status: 202,
      json: async () => ({ claimToken: 't', matchCode: '1' }),
    };
    expect(
      await run([
        opened,
        { status: 403, json: async () => ({ state: 'denied' }) },
      ]),
    ).toEqual({ ok: false, status: 'pairing-denied' });
    expect(
      await run([
        { ...opened },
        { status: 403, json: async () => ({ state: 'expired' }) },
      ]),
    ).toEqual({ ok: false, status: 'pairing-failed' });
    expect(
      await run([
        { status: 409, json: async () => ({ error: 'pairing-busy' }) },
      ]),
    ).toEqual({ ok: false, status: 'pairing-busy' });
  });

  it('authenticates first and delivers clock-corrected snapshots', async () => {
    const { bridge, statuses } = setup();
    const listener = vi.fn();
    bridge.performerBridge.onSnapshot(listener);
    bridge.connect();
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe('ws://192.168.1.20:8710/m/ws');
    expect(socket.protocol).toBe('utawakui.companion.v1');
    socket.emit('open');
    expect(socket.sent).toEqual([{ type: 'auth', credential: 'cred' }]);
    socket.emit('message', {
      data: JSON.stringify({
        type: 'snapshot',
        sentAt: 4000,
        snapshot: { state: { generatedAt: '2026-11-17T00:00:00.000Z' } },
      }),
    });
    expect(listener.mock.calls[0][0].state.generatedAt).toBe(
      '2026-11-17T00:00:06.000Z',
    );
    expect(await bridge.performerBridge.getSnapshot()).toBe(
      listener.mock.calls[0][0],
    );
    expect(statuses).toEqual(['connecting', 'live']);
  });

  it('forgets a revoked credential and retries other disconnects', () => {
    const { bridge, storage, statuses, timers } = setup();
    bridge.connect();
    FakeSocket.instances[0].emit('close', { code: 1006 });
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(timers[0].delay).toBe(1000);
    timers[0].fn();
    FakeSocket.instances[1].emit('close', { code: 4401 });
    expect(statuses.at(-1)).toBe('unpaired');
    expect(storage.data.has(CREDENTIAL_STORAGE_KEY)).toBe(false);
  });

  it('stays paired but stops retrying when another phone takes over, then resumes', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 409,
      json: async () => ({ result: 'rejected', reason: 'displaced' }),
    }));
    const { bridge, storage, statuses, timers } = setup({ fetchImpl });
    bridge.connect();
    FakeSocket.instances[0].emit('close', { code: 4410 });
    expect(statuses.at(-1)).toBe('displaced');
    expect(timers).toHaveLength(0);
    expect(storage.data.get(CREDENTIAL_STORAGE_KEY)).toBe('cred');

    expect(
      await bridge.sendCommand('player.next', { revision: 1, trackId: 'a' }),
    ).toBe('displaced');
    expect(statuses.at(-1)).toBe('displaced');

    bridge.resume();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(statuses.at(-1)).toBe('connecting');
    // A second tap while connecting opens nothing more.
    bridge.resume();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('keeps reading scale on the phone and stays read-only', async () => {
    const { bridge, storage } = setup();
    expect(await bridge.performerBridge.getReadingScale()).toBe('near');
    await bridge.performerBridge.setReadingScale('stage');
    expect(await bridge.performerBridge.getReadingScale()).toBe('stage');
    expect(storage.data.size).toBe(2);
    expect(await bridge.performerBridge.control({ action: 'play' })).toBe(
      false,
    );
  });

  it('reports unpaired without a credential and stops cleanly', () => {
    const { bridge, statuses } = setup({ credential: null });
    bridge.connect();
    expect(statuses).toEqual(['unpaired']);
    expect(FakeSocket.instances).toHaveLength(0);
    const paired = setup();
    paired.bridge.connect();
    paired.bridge.stop();
    expect(paired.timers).toHaveLength(0);
  });

  it('sends bounded commands with the bearer credential and a rising sequence', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => ({ result: 'applied' }),
    }));
    const { bridge } = setup({ fetchImpl });
    const context = { revision: 7, trackId: 'a' };
    expect(await bridge.sendCommand('player.next', context)).toBe('applied');
    expect(
      await bridge.performerBridge.control({ action: 'pause', ...context }),
    ).toBe(true);
    expect(
      await bridge.performerBridge.adjustLyricsOffset({
        action: 'delay',
        ...context,
      }),
    ).toBe(true);
    const bodies = fetchImpl.mock.calls.map(([url, init]) => {
      expect(url).toBe('/m/api/v1/command');
      expect(init.headers.Authorization).toBe('Bearer cred');
      return JSON.parse(init.body);
    });
    expect(bodies.map((body) => body.command)).toEqual([
      'player.next',
      'player.play-pause',
      'lyrics.offset-down',
    ]);
    expect(bodies[1].sequence).toBe(bodies[0].sequence + 1);
    expect(bodies[2]).toMatchObject({ revision: 7, trackId: 'a' });
  });

  it('reports refusals, ignores unsupported actions and forgets a revoked phone', async () => {
    const responses = [
      {
        status: 409,
        json: async () => ({ result: 'rejected', reason: 'stale' }),
      },
      { status: 401, json: async () => ({ result: 'rejected' }) },
    ];
    const fetchImpl = vi.fn(async () => responses.shift());
    const { bridge, storage, statuses } = setup({ fetchImpl });
    const context = { revision: 1, trackId: 'a' };
    expect(await bridge.sendCommand('player.mute', context)).toBe('stale');
    expect(
      await bridge.performerBridge.adjustLyricsOffset({
        action: 'reset',
        ...context,
      }),
    ).toBe(false);
    expect(await bridge.sendCommand('player.mute', { revision: 1 })).toBe(
      'unavailable',
    );
    expect(await bridge.sendCommand('player.mute', context)).toBe(
      'unauthorized',
    );
    expect(storage.data.has(CREDENTIAL_STORAGE_KEY)).toBe(false);
    expect(statuses.at(-1)).toBe('unpaired');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
