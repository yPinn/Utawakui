import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadAppUsage() {
  const { useAppUsage } = await import('./useAppUsage.js');
  return useAppUsage();
}

describe('useAppUsage', () => {
  it('refreshes from the preload bridge and applies pushed status', async () => {
    let statusListener;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        getAppUsage: vi.fn().mockResolvedValue({
          cpuPercent: 12,
          ramPercent: 34,
        }),
        onAppUsage: vi.fn((listener) => {
          statusListener = listener;
          return unsubscribe;
        }),
      },
    });
    const appUsage = await loadAppUsage();

    await appUsage.refreshAppUsage();
    expect(appUsage.state).toMatchObject({
      cpuPercent: 12,
      ramPercent: 34,
    });

    statusListener({ cpuPercent: 56, ramPercent: 78 });
    expect(appUsage.state).toMatchObject({
      cpuPercent: 56,
      ramPercent: 78,
    });
    expect(window.Utawakui.onAppUsage).toHaveBeenCalledOnce();
  });

  it('starts at null and leaves the placeholder in place when the bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const appUsage = await loadAppUsage();

    await appUsage.refreshAppUsage();

    expect(appUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });
  });

  it('falls back to null and does not throw when getAppUsage rejects', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUsage: vi.fn(() => vi.fn()),
        getAppUsage: vi.fn().mockRejectedValue(new Error('IPC failed')),
      },
    });
    const appUsage = await loadAppUsage();

    await expect(appUsage.refreshAppUsage()).resolves.toBeUndefined();
    expect(appUsage.state.cpuPercent).toBeNull();
  });

  it('ignores non-finite or missing fields in a pushed payload', async () => {
    let statusListener;
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUsage: vi.fn((listener) => {
          statusListener = listener;
          return vi.fn();
        }),
      },
    });
    const appUsage = await loadAppUsage();

    statusListener({ cpuPercent: 'not-a-number', ramPercent: NaN });
    expect(appUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });

    statusListener(null);
    expect(appUsage.state).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });
  });
});
