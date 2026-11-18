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
  const busyPorts = new Set(overrides.busyPorts ?? []);
  const createServer = vi.fn((options) => {
    let running = false;
    const server = {
      options,
      start: vi.fn(async () => {
        if (overrides.startError) throw overrides.startError;
        if (busyPorts.has(options.port))
          throw Object.assign(new Error('busy'), {
            companionStatus: 'port-in-use',
          });
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
    ...(overrides.approvals ? { approvals: overrides.approvals } : {}),
  });
  return {
    runtime,
    state,
    servers,
    createServer,
    devices,
    pairing,
    onChange,
    saved: () => settings,
  };
}

const twoPrivate = [
  { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
  { name: 'Ethernet', address: '192.168.1.30', privateNetwork: true },
];

describe('companion runtime', () => {
  it('normalizes saved settings to safe defaults', () => {
    // On by default; only an explicit stop turns it off.
    expect(normalizeCompanionSettings(null)).toEqual({
      enabled: true,
      interfaceAddress: null,
      port: 8710,
    });
    expect(
      normalizeCompanionSettings({
        enabled: false,
        interfaceAddress: '8.8.8.8',
        port: 80,
      }),
    ).toEqual({ enabled: false, interfaceAddress: null, port: 8710 });
  });

  it('retries a failed start in the background until it recovers', async () => {
    vi.useFakeTimers();
    try {
      const { runtime, state, onChange } = setup();
      state.scope = [state.scope[1]];
      await runtime.configure({ enabled: true });
      expect(await runtime.status()).toMatchObject({
        running: false,
        error: 'public-network',
      });
      const notified = onChange.mock.calls.length;
      // An unchanged outcome stays quiet.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onChange).toHaveBeenCalledTimes(notified);
      // The user switches the network to private in Windows.
      state.scope = [{ ...state.scope[0], privateNetwork: true }];
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await runtime.status()).toMatchObject({
        running: true,
        error: null,
      });
      expect(onChange.mock.calls.length).toBeGreaterThan(notified);
      await runtime.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry when stopped or when secure storage is missing', async () => {
    vi.useFakeTimers();
    try {
      const off = setup();
      await off.runtime.configure({ enabled: false });
      expect(vi.getTimerCount()).toBe(0);
      const insecure = setup({ secure: false });
      await insecure.runtime.configure({ enabled: true });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks the only private network and the default port by itself', async () => {
    const { runtime, createServer, saved } = setup();
    const status = await runtime.configure({ enabled: true });
    expect(createServer).toHaveBeenCalledOnce();
    expect(createServer.mock.calls[0][0]).toMatchObject({
      address: '192.168.1.20',
      port: 8710,
    });
    expect(status).toMatchObject({
      running: true,
      error: null,
      enabled: true,
      interfaceAddress: '192.168.1.20',
    });
    expect(saved().interfaceAddress).toBe('192.168.1.20');
    expect(status.devices).toEqual([{ id: 'd1', label: 'Phone' }]);
  });

  it('asks for a choice only between several private networks', async () => {
    const { runtime, state, createServer } = setup();
    state.scope = twoPrivate;
    expect(await runtime.configure({ enabled: true })).toMatchObject({
      running: false,
      error: 'choose-interface',
    });
    expect(createServer).not.toHaveBeenCalled();
    expect(
      await runtime.configure({ interfaceAddress: '192.168.1.30' }),
    ).toMatchObject({ running: true, interfaceAddress: '192.168.1.30' });
  });

  it('refuses public-only or missing networks and secure storage gaps', async () => {
    const { runtime, state, createServer } = setup();
    state.scope = [state.scope[1]];
    expect(
      await runtime.configure({ enabled: true, interfaceAddress: '10.0.0.8' }),
    ).toMatchObject({ running: false, error: 'public-network' });
    state.scope = [];
    expect(await runtime.refresh().then(runtime.status)).toMatchObject({
      running: false,
      error: 'no-interface',
    });
    expect(createServer).not.toHaveBeenCalled();

    const insecure = setup({ secure: false });
    expect(await insecure.runtime.configure({ enabled: true })).toMatchObject({
      running: false,
      error: 'secure-storage-unavailable',
    });
  });

  it('stops when the gate or setting turns off and never runs two listeners', async () => {
    const { runtime, state, servers } = setup();
    state.scope = twoPrivate;
    await runtime.configure({
      enabled: true,
      interfaceAddress: '192.168.1.20',
    });
    await runtime.configure({ interfaceAddress: '192.168.1.30' });
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

  it('moves to the next free port and keeps it for later starts', async () => {
    const { runtime, createServer, saved } = setup({ busyPorts: [8710] });
    expect(await runtime.configure({ enabled: true })).toMatchObject({
      running: true,
      error: null,
      port: 8711,
    });
    expect(createServer.mock.calls.map(([options]) => options.port)).toEqual([
      8710, 8711,
    ]);
    expect(saved().port).toBe(8711);
  });

  it('reports a busy port when every fallback is taken', async () => {
    const { runtime, createServer } = setup({
      busyPorts: [8710, 8711, 8712, 8713, 8714],
    });
    expect(await runtime.configure({ enabled: true })).toMatchObject({
      running: false,
      error: 'port-in-use',
    });
    expect(createServer).toHaveBeenCalledTimes(5);
  });

  it('stops trying other ports on a non-port failure', async () => {
    const { runtime, createServer } = setup({
      startError: new Error('boom'),
    });
    expect(await runtime.configure({ enabled: true })).toMatchObject({
      running: false,
      error: 'listen-failed',
    });
    expect(createServer).toHaveBeenCalledOnce();
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

  it('approves a waiting phone by issuing a credential, or denies it', async () => {
    const approvals = {
      approve: vi.fn((id, issue) => (issue('Pixel'), true)),
      deny: vi.fn(() => true),
      cancel: vi.fn(),
      status: () => ({ id: 'r1', label: 'Pixel', matchCode: '1234' }),
    };
    const { runtime, devices } = setup({ approvals });
    devices.add = vi.fn(() => ({ credential: 'c' }));
    expect((await runtime.status()).pairing.request).toMatchObject({
      matchCode: '1234',
    });
    expect(runtime.approvePairing('r1')).toBe(true);
    expect(devices.add).toHaveBeenCalledWith('Pixel');
    expect(runtime.denyPairing('r1')).toBe(true);
    expect(() => runtime.approvePairing(1)).toThrow();
    expect(() => runtime.denyPairing(null)).toThrow();
  });

  it('denies the request when the device list is full', () => {
    const approvals = {
      approve: vi.fn((id, issue) => issue('Pixel')),
      deny: vi.fn(() => true),
      cancel: vi.fn(),
      status: () => null,
    };
    const { runtime, devices } = setup({ approvals });
    devices.add = vi.fn(() => {
      throw Object.assign(new Error('full'), { companionStatus: 'full' });
    });
    expect(() => runtime.approvePairing('r1')).toThrow(
      expect.objectContaining({ companionStatus: 'full' }),
    );
    expect(approvals.deny).toHaveBeenCalledWith('r1');
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
      { port: 8711 },
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
