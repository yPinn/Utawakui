import { describe, expect, it, vi } from 'vitest';
import { registerCompanionHandlers } from './companionHandlers.js';

function setup({ gate = true } = {}) {
  const handlers = new Map();
  const runtime = {
    status: vi.fn(async () => ({ running: false })),
    configure: vi.fn(async (input) => ({ running: true, ...input })),
    beginPairing: vi.fn(async () => ({
      url: 'http://x/m/#pair=c',
      expiresAt: 1,
    })),
    cancelPairing: vi.fn(),
    revoke: vi.fn(() => true),
    revokeAll: vi.fn(() => 2),
  };
  const requireFeatureGate = vi.fn(() => {
    if (!gate)
      throw Object.assign(new Error('gate'), { code: 'FEATURE_GATE_REQUIRED' });
  });
  registerCompanionHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    runtime,
    requireFeatureGate,
    featureId: 'mobile-companion',
    recordDiagnostic: vi.fn(),
  });
  const call = (channel, ...args) => handlers.get(channel)(null, ...args);
  return { call, runtime, requireFeatureGate };
}

describe('companion IPC', () => {
  it('reads status without the gate and changes settings only with it', async () => {
    const { call, requireFeatureGate } = setup();
    await expect(call('companion:get-status')).resolves.toEqual({
      ok: true,
      running: false,
    });
    expect(requireFeatureGate).not.toHaveBeenCalled();
    await expect(
      call('companion:configure', { enabled: true }),
    ).resolves.toMatchObject({ ok: true, running: true });
    expect(requireFeatureGate).toHaveBeenCalledWith('mobile-companion');
  });

  it('blocks configuration and pairing while the gate is off', async () => {
    const { call, runtime } = setup({ gate: false });
    await expect(
      call('companion:configure', { enabled: true }),
    ).rejects.toThrow();
    await expect(call('companion:begin-pairing')).rejects.toThrow();
    expect(runtime.configure).not.toHaveBeenCalled();
    expect(runtime.beginPairing).not.toHaveBeenCalled();
  });

  it('always allows cancelling pairing and revoking devices', async () => {
    const { call, runtime } = setup({ gate: false });
    await expect(call('companion:cancel-pairing')).resolves.toEqual({
      ok: true,
    });
    await expect(call('companion:revoke', 'd1')).resolves.toEqual({
      ok: true,
      removed: true,
    });
    await expect(call('companion:revoke-all')).resolves.toEqual({
      ok: true,
      removed: 2,
    });
    expect(runtime.revoke).toHaveBeenCalledWith('d1');
  });

  it('settles renderer command results through the relay only', async () => {
    const handlers = new Map();
    const commandRelay = { settle: vi.fn(() => true) };
    registerCompanionHandlers({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      runtime: {},
      requireFeatureGate: vi.fn(),
      featureId: 'mobile-companion',
      recordDiagnostic: vi.fn(),
      commandRelay,
    });
    const settle = handlers.get('companion:command-result');
    expect(await settle(null, 'id-1', 'applied')).toBe(true);
    expect(commandRelay.settle).toHaveBeenCalledWith('id-1', 'applied');
    expect(await settle(null, 5, 'applied')).toBe(false);
  });

  it('approves pairing only with the gate and always allows denial', async () => {
    const open = setup();
    open.runtime.approvePairing = vi.fn(() => true);
    open.runtime.denyPairing = vi.fn(() => true);
    await expect(open.call('companion:approve-pairing', 'r1')).resolves.toEqual(
      {
        ok: true,
        approved: true,
      },
    );
    expect(open.runtime.approvePairing).toHaveBeenCalledWith('r1');
    const closed = setup({ gate: false });
    closed.runtime.approvePairing = vi.fn();
    closed.runtime.denyPairing = vi.fn(() => true);
    await expect(
      closed.call('companion:approve-pairing', 'r1'),
    ).rejects.toThrow();
    await expect(closed.call('companion:deny-pairing', 'r1')).resolves.toEqual({
      ok: true,
      denied: true,
    });
  });

  it('returns bounded statuses for expected companion errors', async () => {
    const { call, runtime } = setup();
    runtime.beginPairing.mockRejectedValueOnce(
      Object.assign(new Error('x'), { companionStatus: 'not-running' }),
    );
    await expect(call('companion:begin-pairing')).resolves.toEqual({
      ok: false,
      status: 'not-running',
    });
  });
});
