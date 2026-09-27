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
      downloadBytesPerSecond: 3_145_728,
      downloadEtaSeconds: 25,
      releaseDate: '2026-08-22T05:00:00.000Z',
      error: null,
    });
    expect(appUpdate.state).toMatchObject({
      phase: 'downloading',
      availableVersion: '0.2.0',
      progress: 24.5,
      downloadBytesPerSecond: 3_145_728,
      downloadEtaSeconds: 25,
    });
    expect(appUpdate.updateReady.value).toBe(false);
    expect(window.Utawakui.onAppUpdateStatus).toHaveBeenCalledOnce();
  });

  it('flags updateReady for available and downloaded phases only', async () => {
    let statusListener;
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUpdateStatus: vi.fn((listener) => {
          statusListener = listener;
          return vi.fn();
        }),
      },
    });
    const appUpdate = await loadAppUpdate();

    statusListener({
      enabled: true,
      phase: 'available',
      currentVersion: '0.1.0',
    });
    expect(appUpdate.updateReady.value).toBe(true);

    statusListener({
      enabled: true,
      phase: 'downloaded',
      currentVersion: '0.1.0',
    });
    expect(appUpdate.updateReady.value).toBe(true);

    statusListener({
      enabled: true,
      phase: 'not-available',
      currentVersion: '0.1.0',
    });
    expect(appUpdate.updateReady.value).toBe(false);
  });

  it('reads and stores the automatic check preference with optimistic rollback', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onAppUpdateStatus: vi.fn(() => vi.fn()),
        getAppUpdateAutoCheck: vi.fn().mockResolvedValue(false),
        setAppUpdateAutoCheck: vi
          .fn()
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error('IPC failed')),
      },
    });
    const appUpdate = await loadAppUpdate();

    await appUpdate.refreshAppUpdateAutoCheck();
    expect(appUpdate.state.autoCheckEnabled).toBe(false);

    await appUpdate.setAppUpdateAutoCheck(true);
    expect(appUpdate.state.autoCheckEnabled).toBe(true);

    await appUpdate.setAppUpdateAutoCheck(false);
    expect(appUpdate.state.autoCheckEnabled).toBe(true);
    expect(appUpdate.state.autoCheckError).toBe('請再試一次。');
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

    expect(appUpdate.state.error).toBe('請重新啟動 Utawakui 後再試。');
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

    expect(appUpdate.state.error).toBe('更新失敗，請再試一次。');
  });
});
