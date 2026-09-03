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
});
