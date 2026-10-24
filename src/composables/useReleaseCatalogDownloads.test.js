import { afterEach, expect, it, vi } from 'vitest';
import { createReleaseCatalogDownloads } from './useReleaseCatalogDownloads.js';
afterEach(() => vi.unstubAllGlobals());
const collection = {
  id: 'album',
  releaseLibraryEpoch: 4,
  resolvedRelease: { revision: 7 },
};
const row = { key: 'slot-2', title: 'Song' };
const input = {
  collectionId: 'album',
  libraryEpoch: 4,
  expectedRevision: 7,
  slotKey: 'slot-2',
};
function setup() {
  const bridge = {
    downloadReleaseCatalogTrack: vi.fn(async () => ({ status: 'ok' })),
    linkLocalReleaseCatalogTrack: vi.fn(async () => ({ status: 'ok' })),
  };
  const gate = vi.fn(async () => true),
    refresh = vi.fn(async () => {}),
    notify = vi.fn();
  return {
    bridge,
    gate,
    refresh,
    notify,
    api: createReleaseCatalogDownloads({
      bridge,
      requireFeatureGate: gate,
      refresh,
      notify,
    }),
  };
}
it.each(['tracks', 'playlists'])(
  'detects a caught %s refresh error through the production singleton wrapper',
  async (failedRead) => {
    vi.resetModules();
    vi.stubGlobal('window', {
      Utawakui: {
        linkLocalReleaseCatalogTrack: vi.fn(async () => ({ status: 'ok' })),
        listTracks: vi.fn(async () => {
          if (failedRead === 'tracks') throw Error('private read failure');
          return [];
        }),
        listPlaylists: vi.fn(async () => {
          if (failedRead === 'playlists') throw Error('private read failure');
          return [];
        }),
      },
    });
    const { useReleaseCatalogDownloads } =
      await import('./useReleaseCatalogDownloads.js');
    const api = useReleaseCatalogDownloads();
    expect(
      await api.download(collection, {
        ...row,
        localCandidateTrackId: 'existing',
      }),
    ).toBe(true);
    expect(api.errorFor(collection)).toContain('畫面更新失敗');
    expect(api.errorFor(collection)).not.toContain('private');
  },
);
it('sends only the bounded slot intent and deduplicates repeated row actions without an import draft', async () => {
  const h = setup();
  const first = h.api.download(collection, row);
  expect(h.api.download(collection, row)).toBe(first);
  expect(h.api.pendingSlots(collection).has(row.key)).toBe(true);
  expect(await first).toBe(true);
  expect(h.bridge.downloadReleaseCatalogTrack).toHaveBeenCalledExactlyOnceWith(
    input,
  );
  expect(h.gate).toHaveBeenCalledOnce();
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.api.pendingSlots(collection).size).toBe(0);
});
it('reuses an exact local candidate offline instead of invoking download or provider setup', async () => {
  const h = setup();
  expect(
    await h.api.download(collection, {
      ...row,
      localCandidateTrackId: 'existing',
    }),
  ).toBe(true);
  expect(h.bridge.linkLocalReleaseCatalogTrack).toHaveBeenCalledExactlyOnceWith(
    input,
  );
  expect(h.bridge.downloadReleaseCatalogTrack).not.toHaveBeenCalled();
  expect(h.gate).not.toHaveBeenCalled();
});
it('reports a refresh failure without misreporting a durable successful import as a failed download', async () => {
  const h = setup();
  h.refresh.mockRejectedValueOnce(Error('private refresh failure'));
  expect(await h.api.download(collection, row)).toBe(true);
  expect(h.api.errorFor(collection)).toContain('曲目已納入專輯');
  expect(h.notify).toHaveBeenCalledWith(
    expect.objectContaining({ title: '下載完成', tone: 'warning' }),
  );
  expect(h.api.pendingSlots(collection).size).toBe(0);
});
it('retains per-library feedback for partial attachment and gate refusal and clears pending jobs', async () => {
  const h = setup();
  h.gate.mockResolvedValueOnce(false);
  expect(await h.api.download(collection, row)).toBe(false);
  expect(h.bridge.downloadReleaseCatalogTrack).not.toHaveBeenCalled();
  h.bridge.downloadReleaseCatalogTrack.mockResolvedValueOnce({
    status: 'downloaded-unlinked',
  });
  expect(await h.api.download(collection, row)).toBe(false);
  expect(h.api.errorFor(collection)).toContain('音檔已下載');
  expect(h.api.errorFor({ ...collection, releaseLibraryEpoch: 5 })).toBe('');
  h.bridge.downloadReleaseCatalogTrack.mockRejectedValueOnce(
    Error('private path'),
  );
  expect(await h.api.download(collection, row)).toBe(false);
  expect(h.api.errorFor(collection)).not.toContain('private path');
  expect(h.api.pendingSlots(collection).size).toBe(0);
});
