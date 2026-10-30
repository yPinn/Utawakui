import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadComposable(bridge) {
  vi.stubGlobal('window', { Utawakui: bridge });
  const { useDiagnosticsWorkbench } =
    await import('./useDiagnosticsWorkbench.js');
  return useDiagnosticsWorkbench();
}

describe('useDiagnosticsWorkbench', () => {
  it('loads the full recent event list for a dev-only reader, not just a count', async () => {
    const events = [
      { id: 'one', level: 'error', message: 'first' },
      { id: 'two', level: 'warning', message: 'second' },
    ];
    const listRecentDiagnostics = vi.fn().mockResolvedValue(events);
    const workbench = await loadComposable({ listRecentDiagnostics });

    await expect(workbench.refresh()).resolves.toBe(true);

    expect(listRecentDiagnostics).toHaveBeenCalledWith(500);
    expect(workbench.state.events).toEqual(events);
    expect(workbench.state.error).toBeNull();
    expect(workbench.state.isLoading).toBe(false);
  });

  it('reports a plain error and keeps the previous events when the bridge is unavailable', async () => {
    const workbench = await loadComposable({});

    await expect(workbench.refresh()).resolves.toBe(false);

    expect(workbench.state.events).toEqual([]);
    expect(workbench.state.error).toBeTruthy();
  });

  it('reports a plain error without leaking the raw exception when the read fails', async () => {
    const workbench = await loadComposable({
      listRecentDiagnostics: vi
        .fn()
        .mockRejectedValue(
          new Error('EACCES C:\\Users\\Singer\\AppData\\diagnostics.jsonl'),
        ),
    });

    await expect(workbench.refresh()).resolves.toBe(false);

    expect(workbench.state.error).toBeTruthy();
    expect(workbench.state.error).not.toContain('EACCES');
    expect(workbench.state.error).not.toContain('Singer');
  });

  it('treats a non-array bridge response as an empty list', async () => {
    const workbench = await loadComposable({
      listRecentDiagnostics: vi.fn().mockResolvedValue(null),
    });

    await expect(workbench.refresh()).resolves.toBe(true);

    expect(workbench.state.events).toEqual([]);
  });

  it('replaces live records with a bundle chosen in the main-owned dialog', async () => {
    const events = [{ id: 'a', level: 'error', message: 'boom' }];
    const openDiagnosticsBundle = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        cancelled: false,
        name: 'bundle.json',
        text: JSON.stringify({ bundleVersion: 1, events }),
      })
      .mockResolvedValueOnce({ ok: true, cancelled: true })
      .mockResolvedValueOnce({
        ok: true,
        cancelled: false,
        name: 'notes.json',
        text: 'not json',
      })
      .mockResolvedValueOnce({
        ok: false,
        errorCode: 'DIAGNOSTICS_BUNDLE_READ_FAILED',
      });
    const workbench = await loadComposable({ openDiagnosticsBundle });

    await expect(workbench.openBundle()).resolves.toBe(true);
    expect(workbench.state.events).toEqual(events);
    expect(workbench.state.bundleName).toBe('bundle.json');

    await expect(workbench.openBundle()).resolves.toBe(false);
    expect(workbench.state.error).toBeNull();

    await expect(workbench.openBundle()).resolves.toBe(false);
    expect(workbench.state.error).toBe('這個檔案不是錯誤紀錄匯出檔。');
    expect(workbench.state.events).toEqual(events);

    await expect(workbench.openBundle()).resolves.toBe(false);
    expect(workbench.state.error).toBe('無法讀取這個檔案。');
  });

  it('keeps triage marks per issue and persists them when storage is available', async () => {
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    });
    const workbench = await loadComposable({});

    expect(workbench.triageOf('main|a|b|C')).toBe('open');
    workbench.setTriage('main|a|b|C', 'confirmed');
    expect(workbench.triageOf('main|a|b|C')).toBe('confirmed');
    expect(JSON.parse(storage.get('utawakui.dev.diagnosticsTriage'))).toEqual({
      'main|a|b|C': 'confirmed',
    });
    workbench.setTriage('main|a|b|C', 'open');
    expect(workbench.triageOf('main|a|b|C')).toBe('open');
    workbench.setTriage('main|a|b|C', 'bogus');
    expect(workbench.triageOf('main|a|b|C')).toBe('open');
  });
});
