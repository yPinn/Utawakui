import { describe, expect, it, vi } from 'vitest';
import { useCompanionSettings } from './useCompanionSettings.js';

function createBridge(overrides = {}) {
  let listener = null;
  return {
    bridge: {
      getCompanionStatus: vi.fn(async () => ({
        ok: true,
        enabled: true,
        running: true,
        pairing: { pending: false },
        devices: [],
      })),
      configureCompanion: vi.fn(async () => ({ ok: true })),
      beginCompanionPairing: vi.fn(async () => ({
        ok: true,
        url: 'http://192.168.1.2:8710/m/#pair=x',
        expiresAt: 9,
      })),
      cancelCompanionPairing: vi.fn(async () => ({ ok: true })),
      revokeCompanionDevice: vi.fn(async () => ({ ok: true, removed: true })),
      revokeAllCompanionDevices: vi.fn(async () => ({ ok: true, removed: 2 })),
      onCompanionStatusChanged: vi.fn((callback) => {
        listener = callback;
        return vi.fn();
      }),
      ...overrides,
    },
    notify: () => listener?.(),
  };
}

describe('useCompanionSettings', () => {
  it('mirrors Main status without the ok flag and follows change events', async () => {
    const { bridge, notify } = createBridge();
    const settings = useCompanionSettings({ bridge });
    await settings.start();
    expect(settings.status.value).toEqual({
      enabled: true,
      running: true,
      pairing: { pending: false },
      devices: [],
    });
    notify();
    await vi.waitFor(() =>
      expect(bridge.getCompanionStatus).toHaveBeenCalledTimes(2),
    );
    settings.stop();
  });

  it('keeps the pairing address only while pairing is pending', async () => {
    const { bridge } = createBridge();
    const settings = useCompanionSettings({ bridge });
    bridge.getCompanionStatus.mockResolvedValue({
      ok: true,
      pairing: { pending: true },
      devices: [],
    });
    expect(await settings.beginPairing()).toBe(true);
    expect(settings.pairing.value.url).toContain('#pair=');
    await settings.cancelPairing();
    expect(settings.pairing.value).toBeNull();
    expect(bridge.cancelCompanionPairing).toHaveBeenCalled();
  });

  it('exposes bounded failure codes and recovers on the next action', async () => {
    const { bridge } = createBridge({
      configureCompanion: vi.fn(async () => ({
        ok: false,
        status: 'public-network',
      })),
    });
    const settings = useCompanionSettings({ bridge });
    expect(await settings.configure({ enabled: true })).toBe(false);
    expect(settings.error.value).toBe('public-network');
    expect(await settings.revoke('d1')).toMatchObject({ ok: true });
    expect(settings.error.value).toBe('');
    expect(await settings.revokeAll()).toMatchObject({ removed: 2 });
  });

  it('reports unreadable status and thrown bridge calls', async () => {
    const { bridge } = createBridge({
      getCompanionStatus: vi.fn(async () => {
        throw new Error('private');
      }),
      configureCompanion: vi.fn(async () => {
        throw new Error('private');
      }),
    });
    const settings = useCompanionSettings({ bridge });
    expect(await settings.refresh()).toBe(false);
    expect(settings.error.value).toBe('read-failed');
    expect(await settings.configure({ enabled: true })).toBe(false);
  });
});
