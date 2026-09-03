import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadComposable(bridge) {
  vi.stubGlobal('window', { Utawakui: bridge });
  const { usePersistentDiagnostics } =
    await import('./usePersistentDiagnostics.js');
  return usePersistentDiagnostics();
}

describe('usePersistentDiagnostics', () => {
  it('loads only a bounded record count for the non-technical settings summary', async () => {
    const listRecentDiagnostics = vi.fn().mockResolvedValue([
      { id: 'one', message: 'private diagnostic detail' },
      { id: 'two', message: 'another private detail' },
    ]);
    const diagnostics = await loadComposable({ listRecentDiagnostics });

    await diagnostics.refresh();

    expect(listRecentDiagnostics).toHaveBeenCalledWith(100);
    expect(diagnostics.state.recordCount).toBe(2);
    expect(diagnostics.state.notice).toBeNull();
    expect(diagnostics.state).not.toHaveProperty('records');
  });

  it('converts read failures into concise copy without the raw exception', async () => {
    const diagnostics = await loadComposable({
      listRecentDiagnostics: vi
        .fn()
        .mockRejectedValue(
          new Error('EACCES C:\\Users\\Singer\\AppData\\private.jsonl'),
        ),
    });

    await diagnostics.refresh();

    expect(diagnostics.state.notice).toMatchObject({
      title: '無法讀取錯誤紀錄',
      message: '請稍後再試一次。',
      actionLabel: '重試',
    });
    expect(JSON.stringify(diagnostics.state)).not.toContain('EACCES');
    expect(JSON.stringify(diagnostics.state)).not.toContain('Singer');
  });

  it('clears managed records and reports a short success state', async () => {
    const clearDiagnostics = vi.fn().mockResolvedValue({
      ok: true,
      removed: 3,
    });
    const diagnostics = await loadComposable({ clearDiagnostics });

    await diagnostics.clear();

    expect(diagnostics.state.recordCount).toBe(0);
    expect(diagnostics.state.notice).toMatchObject({
      severity: 'success',
      title: '錯誤紀錄已清除',
      message: '已移除這台電腦上的錯誤紀錄。',
    });
  });

  it('uses one safe recovery notice when opening the folder fails', async () => {
    const diagnostics = await loadComposable({
      openDiagnosticsFolder: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: 'OPEN_LOGS_DIRECTORY_FAILED',
        raw: 'private path',
      }),
    });

    await diagnostics.openFolder();

    expect(diagnostics.state.notice).toMatchObject({
      title: '無法開啟錯誤紀錄資料夾',
      message: '請稍後再試一次。',
    });
    expect(JSON.stringify(diagnostics.state)).not.toContain('private path');
  });

  it('reports a short success state after exporting the bundle', async () => {
    const exportDiagnostics = vi
      .fn()
      .mockResolvedValue({ ok: true, cancelled: false });
    const diagnostics = await loadComposable({ exportDiagnostics });

    await expect(diagnostics.exportBundle()).resolves.toBe(true);

    expect(diagnostics.state.notice).toMatchObject({
      severity: 'success',
      title: '已匯出錯誤紀錄',
    });
  });

  it('treats a cancelled export as expected control flow, not a failure', async () => {
    const exportDiagnostics = vi
      .fn()
      .mockResolvedValue({ ok: true, cancelled: true });
    const diagnostics = await loadComposable({ exportDiagnostics });

    await expect(diagnostics.exportBundle()).resolves.toBe(true);

    expect(diagnostics.state.notice).toBeNull();
  });

  it('uses one safe recovery notice when export fails', async () => {
    const exportDiagnostics = vi.fn().mockResolvedValue({
      ok: false,
      errorCode: 'DIAGNOSTICS_EXPORT_FAILED',
    });
    const diagnostics = await loadComposable({ exportDiagnostics });

    await expect(diagnostics.exportBundle()).resolves.toBe(false);

    expect(diagnostics.state.notice).toMatchObject({
      title: '無法匯出錯誤紀錄',
      message: '請稍後再試一次。',
    });
  });
});
