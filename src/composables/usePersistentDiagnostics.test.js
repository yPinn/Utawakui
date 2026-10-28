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
  it('keeps a late pre-clear read from restoring removed records', async () => {
    let finish;
    const diagnostics = await loadComposable({
      listRecentDiagnostics: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      clearDiagnostics: vi.fn().mockResolvedValue({ ok: true }),
    });
    const reading = diagnostics.refresh();
    await diagnostics.clear();
    finish([{}, {}]);
    await reading;
    expect(diagnostics.state.recordCount).toBe(0);
    expect(diagnostics.state.isLoading).toBe(false);
  });
  it('coalesces repeated export requests while a save dialog is open', async () => {
    let finish;
    const exportDiagnostics = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const diagnostics = await loadComposable({ exportDiagnostics });
    const first = diagnostics.exportBundle();
    const second = diagnostics.exportBundle();
    expect(exportDiagnostics).toHaveBeenCalledOnce();
    finish({ ok: true });
    await Promise.all([first, second]);
  });
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
      message: '請再試一次。',
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
    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(diagnostics.state.notice).toBeNull();
    expect(useAppNotifications().items.value[0]).toMatchObject({
      tone: 'success',
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

    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(diagnostics.state.notice).toBeNull();
    expect(useAppNotifications().items.value[0]).toMatchObject({
      title: '無法開啟錯誤紀錄資料夾',
      message: '請再試一次。',
    });
    expect(JSON.stringify(diagnostics.state)).not.toContain('private path');
  });

  it('reports a short success state after exporting the bundle', async () => {
    const exportDiagnostics = vi
      .fn()
      .mockResolvedValue({ ok: true, cancelled: false });
    const diagnostics = await loadComposable({ exportDiagnostics });

    await expect(diagnostics.exportBundle()).resolves.toBe(true);

    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(diagnostics.state.notice).toBeNull();
    expect(useAppNotifications().items.value[0]).toMatchObject({
      tone: 'success',
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
    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(useAppNotifications().items.value).toEqual([]);
  });

  it('does not offer an unconfirmed destructive retry and keeps counts on clear failure', async () => {
    const diagnostics = await loadComposable({
      listRecentDiagnostics: vi.fn().mockResolvedValue([{}, {}]),
      clearDiagnostics: vi.fn().mockResolvedValue({ ok: false }),
    });
    const { useAppNotifications } = await import('./useAppNotifications.js');
    await diagnostics.refresh();
    await diagnostics.clear();
    expect(diagnostics.state.recordCount).toBe(2);
    expect(useAppNotifications().items.value[0]).toMatchObject({
      tone: 'danger',
      title: '無法清除錯誤紀錄',
    });
    expect(useAppNotifications().items.value[0]).not.toHaveProperty(
      'actionLabel',
    );
  });

  it('uses one safe recovery notice when export fails', async () => {
    const exportDiagnostics = vi.fn().mockResolvedValue({
      ok: false,
      errorCode: 'DIAGNOSTICS_EXPORT_FAILED',
    });
    const diagnostics = await loadComposable({ exportDiagnostics });

    await expect(diagnostics.exportBundle()).resolves.toBe(false);

    const { useAppNotifications } = await import('./useAppNotifications.js');
    expect(diagnostics.state.notice).toBeNull();
    expect(useAppNotifications().items.value[0]).toMatchObject({
      title: '無法匯出錯誤紀錄',
      message: '請再試一次。',
    });
  });

  it('preserves read failures when exporting and retries only the failed export', async () => {
    const exportDiagnostics = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const diagnostics = await loadComposable({
      listRecentDiagnostics: vi.fn().mockRejectedValue(new Error('private')),
      exportDiagnostics,
    });
    const { useAppNotifications } = await import('./useAppNotifications.js');
    await diagnostics.refresh();
    await diagnostics.exportBundle();
    await useAppNotifications().runAction(
      useAppNotifications().items.value[0].id,
    );
    expect(exportDiagnostics).toHaveBeenCalledTimes(2);
    expect(diagnostics.state.notice.title).toBe('無法讀取錯誤紀錄');
    expect(useAppNotifications().items.value.map(({ title }) => title)).toEqual(
      ['已匯出錯誤紀錄'],
    );
  });
});
