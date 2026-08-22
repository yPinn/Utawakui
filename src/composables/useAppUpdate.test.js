import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadAppUpdate() {
  const { useAppUpdate } = await import('./useAppUpdate.js');
  return useAppUpdate();
}

describe('useAppUpdate', () => {
  it('loads status and applies main-process status events', async () => {
    let statusListener;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        getAppUpdateStatus: vi.fn().mockResolvedValue({
          enabled: true,
          phase: 'idle',
          currentVersion: '0.1.0',
        }),
        onAppUpdateStatus: vi.fn((listener) => {
          statusListener = listener;
          return unsubscribe;
        }),
      },
    });
    const appUpdate = await loadAppUpdate();

    await appUpdate.refreshAppUpdateStatus();
    expect(appUpdate.state).toMatchObject({
      enabled: true,
      phase: 'idle',
      currentVersion: '0.1.0',
    });

    statusListener({
      enabled: true,
      phase: 'downloading',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      progress: 24.5,
      releaseDate: '2026-08-22T05:00:00.000Z',
      error: null,
    });
    expect(appUpdate.state).toMatchObject({
      phase: 'downloading',
      availableVersion: '0.2.0',
      progress: 24.5,
    });
    expect(window.Utawakui.onAppUpdateStatus).toHaveBeenCalledOnce();
  });

  it('routes fixed check, download, and install actions through preload', async () => {
    const status = {
      enabled: true,
      phase: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
    };
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUpdateStatus: vi.fn(() => vi.fn()),
        checkForAppUpdate: vi.fn().mockResolvedValue(status),
        downloadAppUpdate: vi
          .fn()
          .mockResolvedValue({ ...status, phase: 'downloading', progress: 0 }),
        installAppUpdate: vi
          .fn()
          .mockResolvedValue({ ...status, phase: 'downloaded', progress: 100 }),
      },
    });
    const appUpdate = await loadAppUpdate();

    await appUpdate.checkForAppUpdate();
    await appUpdate.downloadAppUpdate();
    await appUpdate.installAppUpdate();

    expect(window.Utawakui.checkForAppUpdate).toHaveBeenCalledOnce();
    expect(window.Utawakui.downloadAppUpdate).toHaveBeenCalledOnce();
    expect(window.Utawakui.installAppUpdate).toHaveBeenCalledOnce();
    expect(appUpdate.state.phase).toBe('downloaded');
  });

  it('reports a restart requirement when the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const appUpdate = await loadAppUpdate();

    await appUpdate.refreshAppUpdateStatus();

    expect(appUpdate.state.error).toBe(
      '需要重新啟動應用程式才能使用更新功能。',
    );
  });

  it('ignores unrecognized status phases', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUpdateStatus: vi.fn(() => vi.fn()),
        getAppUpdateStatus: vi.fn().mockResolvedValue({
          enabled: true,
          phase: 'arbitrary',
          currentVersion: '9.9.9',
        }),
      },
    });
    const appUpdate = await loadAppUpdate();

    await appUpdate.refreshAppUpdateStatus();

    expect(appUpdate.state.phase).toBe('disabled');
    expect(appUpdate.state.currentVersion).toBe('');
  });

  it('keeps preload action failures readable', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUpdateStatus: vi.fn(() => vi.fn()),
        checkForAppUpdate: vi.fn().mockRejectedValue(new Error('IPC failed')),
      },
    });
    const appUpdate = await loadAppUpdate();

    await appUpdate.checkForAppUpdate();

    expect(appUpdate.state.error).toBe('IPC failed');
  });
});
