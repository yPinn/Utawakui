import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadDiagnostics() {
  const recordDiagnostic = vi.fn(() => Promise.resolve({ ok: true }));
  vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
  const { useAppDiagnostics } = await import('./useAppDiagnostics.js');
  return { diagnostics: useAppDiagnostics(), recordDiagnostic };
}

describe('useAppDiagnostics', () => {
  it('records normalized errors newest first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
    const { diagnostics } = await loadDiagnostics();

    const first = diagnostics.recordError(new Error('first'), {
      id: 'first-id',
      source: 'feature-dependencies',
      operation: 'refresh',
      message: '無法讀取準備狀態，請再試一次。',
    });
    const second = diagnostics.recordError('second', {
      id: 'second-id',
      severity: 'warning',
      source: 'separation',
      operation: 'run',
      message: '請先完成音訊處理設定。',
    });

    expect(first.message).toBe('無法讀取準備狀態，請再試一次。');
    expect(second.message).toBe('請先完成音訊處理設定。');
    expect(diagnostics.state.records.map((record) => record.id)).toEqual([
      'second-id',
      'first-id',
    ]);
    expect(diagnostics.recentRecords.value).toHaveLength(2);
  });

  it('caps records to the latest 100', async () => {
    const { diagnostics } = await loadDiagnostics();

    for (let i = 0; i < 105; i += 1) {
      diagnostics.recordError(`error-${i}`, {
        id: `id-${i}`,
        message: '操作未完成。',
      });
    }

    expect(diagnostics.state.records).toHaveLength(100);
    expect(diagnostics.state.records[0].id).toBe('id-104');
    expect(diagnostics.state.records[99].id).toBe('id-5');
  });

  it('clears records through an explicit action', async () => {
    const { diagnostics } = await loadDiagnostics();
    diagnostics.recordError('error', { id: 'id', message: '操作未完成。' });

    diagnostics.clearRecords();

    expect(diagnostics.state.records).toEqual([]);
  });

  it('submits one bounded categorical diagnostic without raw error text', async () => {
    const { diagnostics, recordDiagnostic } = await loadDiagnostics();
    const error = new Error(
      'ENOENT C:\\Users\\Singer\\Music\\secret.wav https://provider.test/x',
    );

    const first = diagnostics.recordError(error, {
      id: 'library-list-id',
      code: 'LIBRARY_LIST_FAILED',
      source: 'library',
      operation: 'list',
      message: '目前無法讀取曲庫，請再試一次。',
      context: {
        retryable: true,
        trackId: 'private-track-id',
        technicalMessage: error.message,
      },
    });
    const second = diagnostics.recordError(error, {
      message: '不應新增第二筆。',
    });

    expect(second).toBe(first);
    expect(recordDiagnostic).toHaveBeenCalledTimes(1);
    expect(recordDiagnostic).toHaveBeenCalledWith({
      level: 'error',
      source: 'library',
      operation: 'list',
      code: 'LIBRARY_LIST_FAILED',
      message: 'Renderer operation failed',
      correlationId: 'library-list-id',
      context: { retryable: true },
    });
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'secret.wav',
    );
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'private-track-id',
    );
  });

  it('stays fail-open when persistent recording throws or rejects', async () => {
    const recordDiagnostic = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('bridge failed');
      })
      .mockRejectedValueOnce(new Error('write failed'));
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
    const { useAppDiagnostics } = await import('./useAppDiagnostics.js');
    const diagnostics = useAppDiagnostics();

    expect(() =>
      diagnostics.recordError(new Error('first raw error'), {
        id: 'first',
        message: '第一次操作未完成。',
      }),
    ).not.toThrow();
    expect(() =>
      diagnostics.recordError(new Error('second raw error'), {
        id: 'second',
        message: '第二次操作未完成。',
      }),
    ).not.toThrow();

    await Promise.resolve();
    expect(diagnostics.state.records).toHaveLength(2);
  });

  it('does not persist a duplicate when main already recorded the failure', async () => {
    const { diagnostics, recordDiagnostic } = await loadDiagnostics();
    const error = new Error(
      'UTAWAKUI_APP_ERROR:{"code":"FEATURE_DEPENDENCY_PREPARE_FAILED","message":"無法準備這個項目，請稍後再試。","context":{"dependencyId":"ffmpeg-gyan-essentials","diagnosticRecorded":true}}',
    );

    const record = diagnostics.recordError(error, {
      source: 'feature-dependencies',
      operation: 'prepare',
    });

    expect(record.context).toEqual({
      dependencyId: 'ffmpeg-gyan-essentials',
      diagnosticRecorded: true,
    });
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });
});
