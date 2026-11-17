import { describe, expect, it, vi } from 'vitest';
import {
  createCompanionRuntime,
  normalizeCompanionSettings,
} from './runtime.js';

function setup(overrides = {}) {
  let settings = { enabled: false, interfaceAddress: null, port: 8710 };
  const state = {
    gate: true,
    scope: [
      { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
      { name: 'Hotel', address: '10.0.0.8', privateNetwork: false },
    ],
  };
  const servers = [];
  const createServer = vi.fn((options) => {
    let running = false;
    const server = {
      options,
      start: vi.fn(async () => {
        if (overrides.startError) throw overrides.startError;
        running = true;
      }),
      stop: vi.fn(async () => {
        running = false;
      }),
      isRunning: () => running,
    };
    servers.push(server);
    return server;
  });
  const devices = {
    available: () => overrides.secure ?? true,
    list: vi.fn(() => [{ id: 'd1', label: 'Phone' }]),
    revoke: vi.fn(() => true),
    revokeAll: vi.fn(() => 1),
  };
  const pairing = {
    begin: vi.fn(() => ({ code: 'C'.repeat(22), expiresAt: 5 })),
    cancel: vi.fn(),
    status: () => ({ pending: false, expiresAt: null }),
  };
  const onChange = vi.fn();
  const runtime = createCompanionRuntime({
    getSettings: () => settings,
    saveSettings: (next) => {
      settings = next;
    },
    isGateEnabled: () => state.gate,
    devices,
    pairing,
    describeNetworkScope: async () => state.scope,
    createServer,
    onChange,
  });
  return { runtime, state, servers, createServer, devices, pairing, onChange };
}

describe('companion runtime', () => {
  it('normalizes saved settings to safe defaults', () => {
    expect(normalizeCompanionSettings(null)).toEqual({
      enabled: false,
      interfaceAddress: null,
      port: 8710,
    });
    expect(
      normalizeCompanionSettings({
        enabled: 'yes',
        interfaceAddress: '8.8.8.8',
        port: 80,
      }),
    ).toEqual({ enabled: false, interfaceAddress: null, port: 8710 });
  });

  it('starts only on the chosen private interface and port', async () => {
    const { runtime, createServer } = setup();
    const status = await runtime.configure({
      enabled: true,
      interfaceAddress: '192.168.1.20',
      port: 8711,
    });
    expect(createServer).toHaveBeenCalledOnce();
    expect(createServer.mock.calls[0][0]).toMatchObject({
      address: '192.168.1.20',
      port: 8711,
    });
    expect(status).toMatchObject({ running: true, error: null, enabled: true });
    expect(status.devices).toEqual([{ id: 'd1', label: 'Phone' }]);
  });

  it('refuses public or missing interfaces and secure storage gaps', async () => {
    const { runtime, createServer } = setup();
    expect(
      await runtime.configure({ enabled: true, interfaceAddress: '10.0.0.8' }),
    ).toMatchObject({ running: false, error: 'public-network' });
    expect(
      await runtime.configure({ interfaceAddress: '192.168.9.9' }),
    ).toMatchObject({ running: false, error: 'no-interface' });
    expect(createServer).not.toHaveBeenCalled();

    const insecure = setup({ secure: false });
    expect(
      await insecure.runtime.configure({
        enabled: true,
        interfaceAddress: '192.168.1.20',
      }),
    ).toMatchObject({ running: false, error: 'secure-storage-unavailable' });
  });

  it('stops when the gate or setting turns off and never runs two listeners', async () => {
    const { runtime, state, servers } = setup();
    await runtime.configure({
      enabled: true,
      interfaceAddress: '192.168.1.20',
    });
    await runtime.configure({ port: 8712 });
    expect(servers).toHaveLength(2);
    expect(servers[0].stop).toHaveBeenCalled();
    state.gate = false;
    await runtime.refresh();
    expect(servers[1].stop).toHaveBeenCalled();
    expect(await runtime.status()).toMatchObject({
      running: false,
      interfaces: [],
    });
  });

  it('reports a busy port without running', async () => {
    const { runtime } = setup({
      startError: Object.assign(new Error('busy'), {
        companionStatus: 'port-in-use',
      }),
    });
    expect(
      await runtime.configure({
        enabled: true,
        interfaceAddress: '192.168.1.20',
      }),
    ).toMatchObject({ running: false, error: 'port-in-use' });
  });

  it('gives each listener a reader hub and disconnects revoked phones', async () => {
    const { runtime, servers, createServer } = setup();
    await runtime.configure({
      enabled: true,
      interfaceAddress: '192.168.1.20',
    });
    const options = createServer.mock.calls[0][0];
    expect(typeof options.readers.attach).toBe('function');
    expect(typeof options.loadPage).toBe('function');
    expect(options.commands).toBeNull();
    servers[0].closeDevice = vi.fn();
    runtime.revoke('d1');
    expect(servers[0].closeDevice).toHaveBeenCalledWith('d1');
    runtime.revokeAll();
    expect(servers[0].closeDevice).toHaveBeenCalledTimes(2);
  });

  it('builds a pairing URL with the code only in the fragment', async () => {
    const { runtime, pairing } = setup();
    await expect(runtime.beginPairing()).rejects.toMatchObject({
      companionStatus: 'not-running',
    });
    await runtime.configure({
      enabled: true,
      interfaceAddress: '192.168.1.20',
    });
    expect(await runtime.beginPairing()).toEqual({
      url: `http://192.168.1.20:8710/m/#pair=${'C'.repeat(22)}`,
      expiresAt: 5,
    });
    runtime.cancelPairing();
    expect(pairing.cancel).toHaveBeenCalled();
  });

  it('validates configuration and forwards revocation', async () => {
    const { runtime, devices, onChange } = setup();
    for (const input of [
      null,
      { enabled: 1 },
      { interfaceAddress: '8.8.8.8' },
      { port: 99999 },
      { port: 1.5 },
    ])
      await expect(runtime.configure(input)).rejects.toMatchObject({
        companionStatus: 'invalid',
      });
    expect(runtime.revoke('d1')).toBe(true);
    expect(devices.revoke).toHaveBeenCalledWith('d1');
    expect(() => runtime.revoke(5)).toThrow();
    expect(runtime.revokeAll()).toBe(1);
    expect(onChange).toHaveBeenCalled();
  });
});
