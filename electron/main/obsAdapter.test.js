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
