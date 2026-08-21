import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadAppInfo() {
  const { useAppInfo } = await import('./useAppInfo.js');
  return useAppInfo();
}

describe('useAppInfo', () => {
  it('reads the running application version through preload', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
      },
    });
    const appInfo = await loadAppInfo();

    await appInfo.refreshAppInfo();

    expect(appInfo.state.currentVersion).toBe('0.1.0');
    expect(appInfo.state.error).toBeNull();
    expect(appInfo.state.isLoading).toBe(false);
  });

  it('reports that the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const appInfo = await loadAppInfo();

    await appInfo.refreshAppInfo();

    expect(appInfo.state.currentVersion).toBe('');
    expect(appInfo.state.error).toBe('需要重新啟動應用程式才能讀取版本資訊。');
  });

  it('preserves a readable error when version lookup fails', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAppVersion: vi.fn().mockRejectedValue(new Error('IPC failed')),
      },
    });
    const appInfo = await loadAppInfo();

    await appInfo.refreshAppInfo();

    expect(appInfo.state.currentVersion).toBe('');
    expect(appInfo.state.error).toBe('IPC failed');
    expect(appInfo.state.isLoading).toBe(false);
  });

  it('rejects an empty version returned by preload', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAppVersion: vi.fn().mockResolvedValue(''),
      },
    });
    const appInfo = await loadAppInfo();

    await appInfo.refreshAppInfo();

    expect(appInfo.state.currentVersion).toBe('');
    expect(appInfo.state.error).toBe('版本資訊格式不正確');
  });
});
