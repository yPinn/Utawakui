import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReleaseCatalogBatchDownloads } from './useReleaseCatalogBatchDownloads.js';
const collection = {
  id: 'album',
  releaseLibraryEpoch: 1,
  resolvedRelease: { revision: 3 },
};
const snapshot = (extra) => ({
  batchId: 1,
  collectionId: 'album',
  libraryEpoch: 1,
  active: false,
  phase: 'idle',
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  unlinked: 0,
  skipped: 0,
  cancelled: 0,
  pendingSlots: [],
  downloadableCount: 11,
  ...extra,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('release catalog batch facade', () => {
  it('reuses the production singleton across remounts and refreshes the canonical library after completion', async () => {
    vi.resetModules();
    const bridge = {
      releaseCatalogDownloadBatch: vi.fn(async () => ({
        status: 'ok',
        snapshot: snapshot({
          phase: 'complete',
          total: 1,
          completed: 1,
          succeeded: 1,
        }),
      })),
      listTracks: vi.fn(async () => []),
      listPlaylists: vi.fn(async () => []),
    };
    vi.stubGlobal('window', { Utawakui: bridge });
    const { useReleaseCatalogBatchDownloads } =
      await import('./useReleaseCatalogBatchDownloads.js');
    const api = useReleaseCatalogBatchDownloads();
    expect(useReleaseCatalogBatchDownloads()).toBe(api);
    const read = api.inspect(collection);
    expect(api.busyFor(collection)).toBe(true);
    await read;
    expect(api.busyFor(collection)).toBe(false);
    expect(bridge.listTracks).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });
    expect(bridge.listPlaylists).toHaveBeenCalled();
    api.dispose();
  });
  it('bounds failed polling retries and recovers with an explicit read', async () => {
    vi.useFakeTimers();
    const bridge = {
      releaseCatalogDownloadBatch: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          snapshot: snapshot({ active: true, phase: 'running', total: 1 }),
        })
        .mockRejectedValue(Error('private detail')),
    };
    const api = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: async () => true,
      refresh: async () => {},
    });
    await api.start(collection);
    await vi.advanceTimersByTimeAsync(10000);
    expect(bridge.releaseCatalogDownloadBatch).toHaveBeenCalledTimes(5);
    expect(api.errorFor(collection)).not.toContain('private');
    bridge.releaseCatalogDownloadBatch.mockResolvedValue({
      status: 'ok',
      snapshot: snapshot({
        phase: 'complete',
        total: 1,
        completed: 1,
        succeeded: 1,
      }),
    });
    await api.inspect(collection);
    expect(api.errorFor(collection)).toBe('');
    api.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(bridge.releaseCatalogDownloadBatch).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });
  it('sends stop without a provider prompt and reports incomplete refresh as a warning', async () => {
    const bridge = {
      releaseCatalogDownloadBatch: vi.fn(async () => ({
        status: 'ok',
        snapshot: snapshot({
          phase: 'stopped',
          total: 3,
          completed: 3,
          succeeded: 1,
          cancelled: 1,
          unlinked: 1,
        }),
      })),
    };
    const gate = vi.fn(),
      notify = vi.fn();
    const api = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: gate,
      refresh: async () => {
        throw Error('private');
      },
      notify,
    });
    await api.stop(collection);
    expect(gate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'warning',
        message: expect.stringContaining('畫面更新失敗'),
      }),
    );
    expect(bridge.releaseCatalogDownloadBatch).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'stop' }),
    );
    api.dispose();
  });
  it('does not let a late older revision overwrite a newer read and coalesces duplicate retry commands', async () => {
    let resolve;
    const old = new Promise((done) => {
      resolve = done;
    });
    const bridge = {
      releaseCatalogDownloadBatch: vi
        .fn()
        .mockReturnValueOnce(old)
        .mockResolvedValue({
          status: 'ok',
          snapshot: snapshot({ downloadableCount: 9 }),
        }),
    };
    const api = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: async () => true,
      refresh: async () => {},
    });
    const first = api.inspect(collection);
    await Promise.resolve();
    await api.inspect({ ...collection, resolvedRelease: { revision: 4 } });
    resolve({ status: 'ok', snapshot: snapshot({ downloadableCount: 11 }) });
    await first;
    expect(api.snapshotFor(collection).downloadableCount).toBe(9);
    const retry = api.retry(collection);
    expect(api.retry(collection)).toBe(retry);
    await retry;
    expect(
      bridge.releaseCatalogDownloadBatch.mock.calls.filter(
        ([value]) => value.operation === 'retry',
      ),
    ).toHaveLength(1);
    api.dispose();
  });
  it('starts through the provider gate, polls across view changes and refreshes/notifies once on completion', async () => {
    vi.useFakeTimers();
    const bridge = {
      releaseCatalogDownloadBatch: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          snapshot: snapshot({ active: true, phase: 'running', total: 11 }),
        })
        .mockResolvedValue({
          status: 'ok',
          snapshot: snapshot({
            phase: 'complete',
            total: 11,
            completed: 11,
            succeeded: 11,
            downloadableCount: 0,
          }),
        }),
    };
    const refresh = vi.fn(async () => {}),
      notify = vi.fn(),
      gate = vi.fn(async () => true);
    const api = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: gate,
      refresh,
      notify,
    });
    await api.start(collection);
    expect(gate).toHaveBeenCalledOnce();
    expect(bridge.releaseCatalogDownloadBatch).toHaveBeenCalledWith({
      operation: 'start',
      collectionId: 'album',
      libraryEpoch: 1,
      expectedRevision: 3,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.snapshotFor(collection).succeeded).toBe(11);
    expect(refresh).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    await api.inspect(collection);
    expect(notify).toHaveBeenCalledOnce();
    api.dispose();
    vi.useRealTimers();
  });
  it('contains invalid/stale responses and gate denial without sending another start', async () => {
    const bridge = {
      releaseCatalogDownloadBatch: vi.fn(async () => ({
        status: 'ok',
        snapshot: snapshot({ collectionId: 'other' }),
      })),
    };
    const api = createReleaseCatalogBatchDownloads({
      bridge,
      requireFeatureGate: async () => false,
      refresh: async () => {},
    });
    await api.start(collection);
    expect(bridge.releaseCatalogDownloadBatch).not.toHaveBeenCalled();
    await api.inspect(collection);
    expect(api.snapshotFor(collection)).toBeNull();
    expect(api.errorFor(collection)).toBeTruthy();
    api.dispose();
  });
});
