import { expect, it, vi } from 'vitest';
import { useLibraryReconciliation } from './useLibraryReconciliation.js';
function setup() {
  const page = {
    status: 'ready',
    scanId: 'scan',
    libraryEpoch: 1,
    items: [],
    offset: 0,
    total: 0,
    merges: [],
    summary: { tracks: 2, releases: 3, candidates: 1 },
  };
  let scope, progress;
  const off = vi.fn();
  const bridge = {
    scanLibraryReconciliation: vi.fn(async () => page),
    getLibraryReconciliationPage: vi.fn(async () => page),
    previewLibraryReconciliation: vi.fn(async () => ({
      status: 'ready',
      previewId: 'preview',
      libraryEpoch: 1,
      kind: 'metadata',
    })),
    commitLibraryReconciliation: vi.fn(async () => ({
      status: 'saved',
      libraryEpoch: 1,
    })),
    decideLibraryReconciliation: vi.fn(async () => ({
      status: 'saved',
      libraryEpoch: 1,
    })),
    cancelLibraryReconciliation: vi.fn(async () => ({})),
    recoverLibraryReconciliation: vi.fn(async () => ({ recovered: true })),
    undoLibraryReconciliation: vi.fn(async () => ({
      status: 'saved',
      libraryEpoch: 1,
    })),
    onReleaseOrganizationChanged: (fn) => {
      scope = fn;
      return off;
    },
    onLibraryReconciliationProgress: (fn) => {
      progress = fn;
      return off;
    },
  };
  const api = useLibraryReconciliation({ bridge });
  return {
    bridge,
    api,
    off,
    scope: (value) => scope(value),
    progress: (value) => progress(value),
  };
}
it('shares one session per bridge, opens read-only, saves and refreshes its evidence', async () => {
  const { bridge, api, off } = setup();
  expect(useLibraryReconciliation({ bridge })).toBe(api);
  await api.open();
  expect(api.state.page.scanId).toBe('scan');
  await api.preview({ itemId: 'item' });
  await api.commit({
    decisions: { title: { action: 'manual', value: 'Song' } },
  });
  expect(bridge.commitLibraryReconciliation).toHaveBeenCalledWith({
    previewId: 'preview',
    decisions: { title: { action: 'manual', value: 'Song' } },
  });
  expect(bridge.scanLibraryReconciliation).toHaveBeenCalledTimes(2);
  api.close();
  expect(off).toHaveBeenCalledTimes(2);
  expect(api.state.open).toBe(false);
});
it('rejects old progress/results when the library changes before first progress', async () => {
  const { bridge, api, scope, progress } = setup();
  let resolve;
  bridge.scanLibraryReconciliation.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = api.open();
  scope({ libraryEpoch: 2 });
  progress({ libraryEpoch: 1, completed: 1, total: 3 });
  resolve({ status: 'ready', scanId: 'old', libraryEpoch: 1, items: [] });
  await pending;
  expect(api.state.page).toBeNull();
  expect(api.state.error).toContain('曲庫位置');
});
it('shows conflict and recovery separately, and cancellation never saves edits', async () => {
  const { bridge, api } = setup();
  await api.open();
  await api.preview({ itemId: 'item' });
  bridge.commitLibraryReconciliation.mockResolvedValueOnce({
    status: 'conflict',
  });
  expect(await api.commit({})).toBe(false);
  expect(api.state.error).toContain('重新檢查');
  bridge.scanLibraryReconciliation.mockResolvedValueOnce({
    status: 'recovery-required',
  });
  await api.scan();
  expect(api.state.needsRecovery).toBe(true);
  await api.recover();
  expect(bridge.recoverLibraryReconciliation).toHaveBeenCalled();
});

it('pages, dismisses, undoes and returns to the result without mutating playback', async () => {
  const { bridge, api } = setup();
  await api.open();
  await api.page(25, 'metadata');
  expect(bridge.getLibraryReconciliationPage).toHaveBeenCalledWith({
    scanId: 'scan',
    offset: 25,
    limit: 25,
    kind: 'metadata',
  });
  await api.preview({ itemId: 'song' });
  api.back();
  expect(api.state.preview).toBeNull();
  await api.decide({ itemId: 'pair' }, 'dismiss');
  expect(bridge.decideLibraryReconciliation).toHaveBeenCalledWith({
    scanId: 'scan',
    itemId: 'pair',
    action: 'dismiss',
  });
  await api.undo('merge');
  expect(bridge.undoLibraryReconciliation).toHaveBeenCalledWith({
    mergeId: 'merge',
    libraryEpoch: 1,
  });
  expect(api.state.message).toContain('復原');
});

it('keeps a running scan owned by one session, reports progress, cancels, and releases subscriptions', async () => {
  const { bridge, api, progress, off } = setup();
  let resolve;
  bridge.scanLibraryReconciliation.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = api.open();
  progress({ libraryEpoch: 1, completed: 1, total: 4 });
  expect(api.state.progress.completed).toBe(1);
  api.close();
  expect(api.state.open).toBe(true);
  expect(await api.scan()).toBe(false);
  await api.cancel();
  expect(api.state.cancelling).toBe(true);
  expect(await api.cancel()).toBe(false);
  resolve({ status: 'cancelled', libraryEpoch: 1 });
  await pending;
  expect(api.state.message).toContain('已停止');
  expect(bridge.commitLibraryReconciliation).not.toHaveBeenCalled();
  api.close();
  expect(off).toHaveBeenCalledTimes(2);
  expect(await api.cancel()).toBe(false);
});

it('retains cancellation errors and lets a failed stop be retried', async () => {
  const { bridge, api } = setup();
  let resolve;
  bridge.scanLibraryReconciliation.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = api.open();
  bridge.cancelLibraryReconciliation.mockRejectedValueOnce(Error('private'));
  expect(await api.cancel()).toBe(false);
  expect(api.state.error).toContain('無法停止');
  expect(api.state.cancelling).toBe(false);
  resolve({ status: 'cancelled', libraryEpoch: 1 });
  await pending;
});

it.each([
  'unavailable',
  'expired',
  'source-missing',
  'invalid-intent',
  'asset-conflict',
  'asset-limit',
  'limit',
])(
  'presents bounded %s results and never submits stale data automatically',
  async (status) => {
    const { bridge, api } = setup();
    await api.open();
    bridge.previewLibraryReconciliation.mockResolvedValueOnce({ status });
    expect(await api.preview({ itemId: 'a' })).toBe(false);
    expect(api.state.error).not.toBe('');
    expect(api.state.preview).toBeNull();
    expect(bridge.commitLibraryReconciliation).not.toHaveBeenCalled();
  },
);

it('surfaces transport failures and recovery conflicts without hiding existing data', async () => {
  const { bridge, api } = setup();
  bridge.scanLibraryReconciliation.mockRejectedValueOnce(Error('private path'));
  expect(await api.open()).toBe(false);
  expect(api.state.error).not.toContain('private');
  bridge.recoverLibraryReconciliation.mockResolvedValueOnce({
    status: 'recovery-conflict',
  });
  expect(await api.recover()).toBe(false);
  expect(api.state.needsRecovery).toBe(true);
  expect(api.state.error).toContain('資料已被修改');
});

it('invalidates an open preview after an epoch event and rejects the late reply', async () => {
  const { bridge, api, scope } = setup();
  await api.open();
  let resolve;
  bridge.previewLibraryReconciliation.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = api.preview({ itemId: 'x' });
  scope({ libraryEpoch: 2 });
  resolve({ status: 'ready', previewId: 'old', libraryEpoch: 1 });
  await pending;
  expect(api.state.preview).toBeNull();
  expect(api.state.error).toContain('曲庫位置');
});
