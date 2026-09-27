import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createObsAdapter } from './obsAdapter.js';

class FakeObsClient extends EventEmitter {
  constructor() {
    super();
    this.connect = vi.fn(async () => ({
      obsWebSocketVersion: '5.5.0',
      negotiatedRpcVersion: 1,
    }));
    this.disconnect = vi.fn(async () => undefined);
    this.call = vi.fn(async (requestType) => {
      if (requestType === 'GetStreamStatus') {
        return {
          outputActive: true,
          outputTimecode: '00:01:02.345',
          outputDuration: 62345,
        };
      }
      if (requestType === 'GetRecordStatus') {
        return {
          outputActive: false,
          outputTimecode: '00:00:00.000',
          outputDuration: 0,
        };
      }
      throw new Error(`unexpected request: ${requestType}`);
    });
  }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('obsAdapter', () => {
  it('never loads the client and stays disabled while not configured', () => {
    const createClient = vi.fn();
    const adapter = createObsAdapter({ createClient });

    expect(adapter.getStatus()).toMatchObject({
      desired: { enabled: false },
      observed: { lifecycle: 'disabled' },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('configure(enabled) connects, negotiates, and snapshots both outputs into ready', async () => {
    const client = new FakeObsClient();
    const createClient = vi.fn(() => client);
    const onStatusChange = vi.fn();
    const requireFeatureGate = vi.fn();
    const adapter = createObsAdapter({
      createClient,
      onStatusChange,
      requireFeatureGate,
      getPassword: async () => 'hunter2',
    });

    const status = await adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });

    expect(requireFeatureGate).toHaveBeenCalledWith('obs-integration');
    expect(client.connect).toHaveBeenCalledWith(
      'ws://127.0.0.1:4455',
      'hunter2',
    );
    expect(status.observed.lifecycle).toBe('ready');
    expect(status.observed.obsWebSocketVersion).toBe('5.5.0');
    expect(status.observed.streaming).toEqual({
      active: true,
      timecode: '00:01:02.345',
      durationMs: 62345,
    });
    expect(status.observed.recording).toEqual({
      active: false,
      timecode: '00:00:00.000',
      durationMs: 0,
    });
    expect(onStatusChange).toHaveBeenCalled();
  });

  it('moves through authenticating when the server sends Hello before Identified', async () => {
    const client = new FakeObsClient();
    client.connect.mockImplementation(async () => {
      client.emit('Hello');
      await flush();
      return { obsWebSocketVersion: '5.5.0', negotiatedRpcVersion: 1 };
    });
    const observedLifecycles = [];
    const adapter = createObsAdapter({
      createClient: () => client,
      onStatusChange: (status) =>
        observedLifecycles.push(status.observed.lifecycle),
    });

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });

    expect(observedLifecycles).toContain('authenticating');
    expect(observedLifecycles.at(-1)).toBe('ready');
  });

  it('degrades instead of failing when the connection succeeds but both snapshot requests fail', async () => {
    const client = new FakeObsClient();
    client.call.mockRejectedValue(new Error('not supported'));
    const adapter = createObsAdapter({ createClient: () => client });

    const status = await adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });

    expect(status.observed.lifecycle).toBe('degraded');
    expect(status.error?.code).toBe('OBS_REQUEST_FAILED');
  });

  it('bounds stalled initial status requests, closes the client, and reconnects', async () => {
    const client = new FakeObsClient();
    client.call.mockReturnValue(new Promise(() => {}));
    const scheduled = [];
    const scheduleTimeout = vi.fn((callback, delay) => {
      const handle = { callback, delay, unref: vi.fn() };
      scheduled.push(handle);
      return handle;
    });
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      clearTimeoutFn: vi.fn(),
      requestTimeoutMs: 25,
      reconnectBaseMs: 1000,
    });

    const configuring = adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });
    await flush();
    const requestDeadlines = scheduled.filter(({ delay }) => delay === 25);
    expect(requestDeadlines).toHaveLength(2);

    for (const deadline of requestDeadlines) deadline.callback();
    const status = await configuring;

    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(status.observed.lifecycle).toBe('error');
    expect(status.error?.code).toBe('OBS_REQUEST_TIMEOUT');
    expect(
      scheduled.filter(({ delay }) => delay >= 1000 && delay < 2000),
    ).toHaveLength(1);
  });

  it('surfaces a dedicated auth-failed error for close code 4009 and schedules a retry', async () => {
    const client = new FakeObsClient();
    const authError = Object.assign(new Error('bad password'), { code: 4009 });
    client.connect.mockRejectedValue(authError);
    // Never actually fires — this test only checks that a retry was armed,
    // not that it eventually reconnects (that's exercised implicitly by the
    // "connecting" lifecycle transition tests above).
    const scheduleTimeout = vi.fn(() => ({ unref: () => {} }));
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      reconnectBaseMs: 10,
    });

    const status = await adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });

    expect(status.error?.code).toBe('OBS_AUTH_FAILED');
    expect(scheduleTimeout).toHaveBeenCalled();
  });

  it.each([
    {
      error: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4455'), {
        code: 'ECONNREFUSED',
      }),
      code: 'OBS_CONNECTION_REFUSED',
      message: 'OBS 未啟動，或 WebSocket 連接埠不正確。',
    },
    {
      error: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4009'), {
        code: 'ECONNREFUSED',
      }),
      code: 'OBS_CONNECTION_REFUSED',
      message: 'OBS 未啟動，或 WebSocket 連接埠不正確。',
    },
    {
      error: Object.assign(new Error('getaddrinfo ENOTFOUND private-host'), {
        code: 'ENOTFOUND',
      }),
      code: 'OBS_HOST_NOT_FOUND',
      message: '找不到 OBS 主機。請檢查主機名稱或 IP。',
    },
    {
      error: Object.assign(new Error('Unsupported protocol'), { code: -1 }),
      code: 'OBS_INCOMPATIBLE_SERVER',
      message: '這不是相容的 OBS WebSocket 5 服務。',
    },
    {
      error: Object.assign(new Error('socket hang up'), { code: -1 }),
      code: 'OBS_CONNECT_FAILED',
      message: '無法連線。請檢查 OBS 設定。',
    },
  ])('classifies $code without exposing transport details', async (fixture) => {
    const client = new FakeObsClient();
    client.connect.mockRejectedValue(fixture.error);
    const scheduleTimeout = vi.fn(() => ({ unref: () => {} }));
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
    });

    const status = await adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });

    expect(status.error).toEqual({
      code: fixture.code,
      message: fixture.message,
    });
    expect(JSON.stringify(status.error)).not.toContain('private-host');
    expect(JSON.stringify(status.error)).not.toContain('127.0.0.1:4455');
  });

  it('bounds a stalled connection, closes its transport, and schedules one retry', async () => {
    const client = new FakeObsClient();
    client.connect.mockReturnValue(new Promise(() => {}));
    const scheduled = [];
    const cleared = [];
    const scheduleTimeout = vi.fn((callback, delay) => {
      const handle = { callback, delay, unref: vi.fn() };
      scheduled.push(handle);
      return handle;
    });
    const clearTimeoutFn = vi.fn((handle) => cleared.push(handle));
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      clearTimeoutFn,
      connectTimeoutMs: 50,
      reconnectBaseMs: 1000,
    });

    const configuring = adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });
    await flush();

    expect(scheduled[0]?.delay).toBe(50);
    scheduled[0].callback();
    const status = await configuring;

    expect(cleared).toContain(scheduled[0]);
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(status.observed.lifecycle).toBe('error');
    expect(status.error?.code).toBe('OBS_CONNECT_TIMEOUT');
    expect(scheduled.filter(({ delay }) => delay >= 1000)).toHaveLength(1);
  });

  it('disconnect settles a stalled connect immediately and prevents its timeout from changing state', async () => {
    const client = new FakeObsClient();
    client.connect.mockReturnValue(new Promise(() => {}));
    const scheduled = [];
    const scheduleTimeout = vi.fn((callback, delay) => {
      const handle = { callback, delay, unref: vi.fn() };
      scheduled.push(handle);
      return handle;
    });
    const clearTimeoutFn = vi.fn();
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      clearTimeoutFn,
      connectTimeoutMs: 50,
    });

    let configureSettled = false;
    const configuring = adapter
      .configure({ enabled: true, host: '127.0.0.1', port: 4455 })
      .then(() => {
        configureSettled = true;
      });
    await flush();
    const deadline = scheduled[0];

    await adapter.disconnect();
    await flush();

    expect(configureSettled).toBe(true);
    expect(clearTimeoutFn).toHaveBeenCalledWith(deadline);
    expect(adapter.getStatus().observed.lifecycle).toBe('disconnected');

    deadline.callback();
    await flush();
    expect(adapter.getStatus().observed.lifecycle).toBe('disconnected');
    expect(scheduleTimeout).toHaveBeenCalledOnce();
    await configuring;
  });

  it('rejects connect() itself so a manual "test connection" caller sees the failure', async () => {
    const client = new FakeObsClient();
    client.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = createObsAdapter({ createClient: () => client });
    await adapter.configure({ enabled: false, host: '127.0.0.1', port: 4455 });

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    // configure() swallows the initial connect failure (logged, not thrown);
    // a direct connect() call while already enabled must still reject.
    await expect(adapter.connect()).rejects.toThrow('Failed to connect to OBS');
  });

  it('a stale in-flight connect from a superseded configure() never overwrites the newer state', async () => {
    let resolveFirstConnect;
    const firstClient = new FakeObsClient();
    firstClient.connect.mockImplementation(
      () => new Promise((resolve) => (resolveFirstConnect = resolve)),
    );
    const secondClient = new FakeObsClient();
    const createClient = vi
      .fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const adapter = createObsAdapter({ createClient });

    const firstConfigure = adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });
    await flush();
    expect(adapter.getStatus().observed.lifecycle).toBe('connecting');

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4456 });
    expect(adapter.getStatus().observed.lifecycle).toBe('ready');

    resolveFirstConnect({
      obsWebSocketVersion: '5.5.0',
      negotiatedRpcVersion: 1,
    });
    await firstConfigure;
    await flush();

    // The stale attempt is cleaned up (disconnected) once it notices it was
    // superseded, but it must never touch status again.
    expect(firstClient.disconnect).toHaveBeenCalled();
    expect(adapter.getStatus().desired.port).toBe(4456);
    expect(adapter.getStatus().observed.lifecycle).toBe('ready');
  });

  it('a stale initial snapshot never overwrites a newer connection snapshot', async () => {
    const oldStream = deferred();
    const oldRecord = deferred();
    const firstClient = new FakeObsClient();
    firstClient.call.mockImplementation((requestType) =>
      requestType === 'GetStreamStatus' ? oldStream.promise : oldRecord.promise,
    );
    const secondClient = new FakeObsClient();
    secondClient.call.mockImplementation(async (requestType) => ({
      outputActive: false,
      outputTimecode:
        requestType === 'GetStreamStatus' ? '00:00:10.000' : '00:00:20.000',
      outputDuration: requestType === 'GetStreamStatus' ? 10_000 : 20_000,
    }));
    const createClient = vi
      .fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const adapter = createObsAdapter({ createClient });

    const firstConfigure = adapter.configure({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
    });
    await flush();
    expect(firstClient.call).toHaveBeenCalledTimes(2);

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4456 });
    oldStream.resolve({
      outputActive: true,
      outputTimecode: '00:09:00.000',
      outputDuration: 540_000,
    });
    oldRecord.resolve({
      outputActive: true,
      outputTimecode: '00:08:00.000',
      outputDuration: 480_000,
    });
    await firstConfigure;

    expect(adapter.getStatus().desired.port).toBe(4456);
    expect(adapter.getStatus().observed.streaming).toEqual({
      active: false,
      timecode: '00:00:10.000',
      durationMs: 10_000,
    });
    expect(adapter.getStatus().observed.recording).toEqual({
      active: false,
      timecode: '00:00:20.000',
      durationMs: 20_000,
    });
  });

  it('rejects a stale on-demand snapshot without mutating the replacement connection', async () => {
    const firstClient = new FakeObsClient();
    const secondClient = new FakeObsClient();
    secondClient.call.mockImplementation(async (requestType) => ({
      outputActive: false,
      outputTimecode:
        requestType === 'GetStreamStatus' ? '00:00:10.000' : '00:00:20.000',
      outputDuration: requestType === 'GetStreamStatus' ? 10_000 : 20_000,
    }));
    const createClient = vi
      .fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const adapter = createObsAdapter({ createClient });

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    const staleSnapshot = deferred();
    firstClient.call.mockImplementationOnce(() => staleSnapshot.promise);
    const request = adapter.requestStreamSnapshot();
    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4456 });

    staleSnapshot.resolve({
      outputActive: true,
      outputTimecode: '00:09:00.000',
      outputDuration: 540_000,
    });

    await expect(request).rejects.toThrow('OBS connection changed');
    expect(adapter.getStatus().observed.streaming).toEqual({
      active: false,
      timecode: '00:00:10.000',
      durationMs: 10_000,
    });
  });

  it('requestStreamSnapshot pulls a fresh timecode on demand and throws when not connected', async () => {
    const client = new FakeObsClient();
    const adapter = createObsAdapter({ createClient: () => client });

    await expect(adapter.requestStreamSnapshot()).rejects.toThrow(
      'OBS is not connected',
    );

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    client.call.mockClear();
    client.call.mockImplementationOnce(async () => ({
      outputActive: true,
      outputTimecode: '00:05:00.000',
      outputDuration: 300_000,
    }));

    const snapshot = await adapter.requestStreamSnapshot();
    expect(snapshot).toEqual({
      active: true,
      timecode: '00:05:00.000',
      durationMs: 300_000,
    });
    expect(client.call).toHaveBeenCalledWith('GetStreamStatus');
  });

  it('a stalled on-demand snapshot times out and retires the unhealthy connection', async () => {
    const client = new FakeObsClient();
    const scheduled = [];
    const scheduleTimeout = vi.fn((callback, delay) => {
      const handle = { callback, delay, unref: vi.fn() };
      scheduled.push(handle);
      return handle;
    });
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      clearTimeoutFn: vi.fn(),
      requestTimeoutMs: 25,
      reconnectBaseMs: 1000,
    });
    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    client.disconnect.mockClear();
    client.call.mockReturnValueOnce(new Promise(() => {}));

    const request = adapter.requestStreamSnapshot();
    await flush();
    const deadline = scheduled.findLast(({ delay }) => delay === 25);
    deadline.callback();

    await expect(request).rejects.toThrow('OBS request timed out');
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(adapter.getStatus().error?.code).toBe('OBS_REQUEST_TIMEOUT');
  });

  it('destroy() disconnects and stops any pending reconnect timer', async () => {
    const client = new FakeObsClient();
    client.connect.mockRejectedValue(new Error('offline'));
    const fakeTimerHandle = { unref: () => {} };
    const clearTimeoutFn = vi.fn();
    const scheduleTimeout = vi.fn(() => fakeTimerHandle);
    const adapter = createObsAdapter({
      createClient: () => client,
      scheduleTimeout,
      clearTimeoutFn,
      reconnectBaseMs: 1000,
    });

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    expect(scheduleTimeout).toHaveBeenCalled();

    // A failed connect has already detached its client (nothing live to
    // disconnect) — destroy()'s job here is stopping the pending retry.
    adapter.destroy();
    expect(clearTimeoutFn).toHaveBeenCalledWith(fakeTimerHandle);
  });

  it('destroy() disconnects a live connection', async () => {
    const client = new FakeObsClient();
    const adapter = createObsAdapter({ createClient: () => client });

    await adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 });
    expect(adapter.getStatus().observed.lifecycle).toBe('ready');

    adapter.destroy();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('propagates a feature-gate rejection without connecting', async () => {
    const createClient = vi.fn();
    const requireFeatureGate = vi.fn(() => {
      throw new Error('feature gate required: obs-integration');
    });
    const adapter = createObsAdapter({ createClient, requireFeatureGate });

    await expect(
      adapter.configure({ enabled: true, host: '127.0.0.1', port: 4455 }),
    ).rejects.toThrow('feature gate required');
    expect(createClient).not.toHaveBeenCalled();
  });
});
