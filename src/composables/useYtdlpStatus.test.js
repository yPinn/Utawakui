import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-scope singleton — resetModules + re-stubbing window before each
// dynamic import gives every test a fresh state instance.
let getYtdlpStatusMock;
let checkYtdlpUpdateMock;

beforeEach(() => {
  vi.resetModules();
  getYtdlpStatusMock = vi.fn();
  checkYtdlpUpdateMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      getYtdlpStatus: getYtdlpStatusMock,
      checkYtdlpUpdate: checkYtdlpUpdateMock,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadYtdlpStatus() {
  const { useYtdlpStatus } = await import('./useYtdlpStatus.js');
  return useYtdlpStatus();
}

describe('refreshStatus', () => {
  it('applies a successful status response', async () => {
    getYtdlpStatusMock.mockResolvedValue({
      version: '2026.07.04',
      binaryFound: true,
      lastCheckedAt: '2026-08-19T00:00:00.000Z',
      lastCheckResult: 'up-to-date',
    });

    const { state, refreshStatus } = await loadYtdlpStatus();
    await refreshStatus();

    expect(state.version).toBe('2026.07.04');
    expect(state.binaryFound).toBe(true);
    expect(state.lastCheckResult).toBe('up-to-date');
    expect(state.error).toBe('');
    expect(state.isLoading).toBe(false);
  });

  it('captures a rejected call into state.error without throwing', async () => {
    getYtdlpStatusMock.mockRejectedValue(new Error('spawn failed'));

    const { state, refreshStatus } = await loadYtdlpStatus();
    await expect(refreshStatus()).resolves.toBeUndefined();

    expect(state.error).toBe('讀取 yt-dlp 狀態失敗：spawn failed');
    expect(state.isLoading).toBe(false);
  });

  it('reports a bridge-missing error when the preload surface is unavailable', async () => {
    vi.stubGlobal('window', { Utawakui: {} });
    const { state, refreshStatus } = await loadYtdlpStatus();
    await refreshStatus();

    expect(state.error).toContain('重新啟動應用程式');
    expect(getYtdlpStatusMock).not.toHaveBeenCalled();
  });
});

describe('checkForUpdate', () => {
  it('applies the response and clears isChecking', async () => {
    checkYtdlpUpdateMock.mockResolvedValue({
      version: '2026.08.01',
      binaryFound: true,
      lastCheckedAt: '2026-08-19T00:00:00.000Z',
      lastCheckResult: 'updated',
    });

    const { state, checkForUpdate } = await loadYtdlpStatus();
    const promise = checkForUpdate();
    expect(state.isChecking).toBe(true);
    await promise;

    expect(state.version).toBe('2026.08.01');
    expect(state.lastCheckResult).toBe('updated');
    expect(state.isChecking).toBe(false);
  });

  it('captures a rejected update into state.error', async () => {
    checkYtdlpUpdateMock.mockRejectedValue(new Error('network unreachable'));

    const { state, checkForUpdate } = await loadYtdlpStatus();
    await checkForUpdate();

    expect(state.error).toBe('檢查更新失敗：network unreachable');
    expect(state.isChecking).toBe(false);
  });

  it('is a no-op while a check is already in flight', async () => {
    let resolveFirst;
    checkYtdlpUpdateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const { checkForUpdate } = await loadYtdlpStatus();
    const first = checkForUpdate();
    const second = checkForUpdate();

    resolveFirst({ version: '1', binaryFound: true });
    await Promise.all([first, second]);

    expect(checkYtdlpUpdateMock).toHaveBeenCalledTimes(1);
  });
});
