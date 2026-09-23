import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadSystemUsage() {
  const { useSystemUsage } = await import('./useSystemUsage.js');
  return useSystemUsage();
}

describe('useSystemUsage', () => {
  it('refreshes from the preload bridge and applies pushed status', async () => {
    let statusListener;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        getSystemUsage: vi.fn().mockResolvedValue({
          cpuPercent: 12,
          ramPercent: 34,
        }),
        onSystemUsage: vi.fn((listener) => {
          statusListener = listener;
          return unsubscribe;
        }),
      },
    });
    const systemUsage = await loadSystemUsage();

    await systemUsage.refreshSystemUsage();
    expect(systemUsage.state).toMatchObject({
      cpuPercent: 12,
      ramPercent: 34,
    });

    statusListener({ cpuPercent: 56, ramPercent: 78 });
    expect(systemUsage.state).toMatchObject({
      cpuPercent: 56,
      ramPercent: 78,
    });
    expect(window.Utawakui.onSystemUsage).toHaveBeenCalledOnce();
  });

  it('starts at null and leaves the placeholder in place when the bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const systemUsage = await loadSystemUsage();

    await systemUsage.refreshSystemUsage();

    expect(systemUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });
  });

  it('falls back to null and does not throw when getSystemUsage rejects', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onSystemUsage: vi.fn(() => vi.fn()),
        getSystemUsage: vi.fn().mockRejectedValue(new Error('IPC failed')),
      },
    });
    const systemUsage = await loadSystemUsage();

    await expect(systemUsage.refreshSystemUsage()).resolves.toBeUndefined();
    expect(systemUsage.state.cpuPercent).toBeNull();
  });

  it('ignores non-finite or missing fields in a pushed payload', async () => {
    let statusListener;
    vi.stubGlobal('window', {
      Utawakui: {
        onSystemUsage: vi.fn((listener) => {
          statusListener = listener;
          return vi.fn();
        }),
      },
    });
    const systemUsage = await loadSystemUsage();

    statusListener({ cpuPercent: 'not-a-number', ramPercent: NaN });
    expect(systemUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });

    statusListener(null);
    expect(systemUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });
  });
});
