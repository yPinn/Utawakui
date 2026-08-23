import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useLibrary.js is a module-scope singleton that fetches once and
// subscribes to window.Utawakui.onLibraryUpdated when explicitly initialized —
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance, same approach as usePlaylists.test.js.
let libraryUpdatedCallback;
let listTracksMock;
let listPlaylistsMock;
let refreshLibraryMetadataMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  libraryUpdatedCallback = undefined;
  listTracksMock = vi.fn().mockResolvedValue([]);
  // useLibrary.js imports usePlaylists.js (for the album-cover-override
  // enrichment below), which independently fetches on module load — stub it
  // too so that fetch resolves instead of throwing on a missing mock.
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  refreshLibraryMetadataMock = vi.fn().mockResolvedValue({ updated: 0 });
  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
      listPlaylists: listPlaylistsMock,
      refreshLibraryMetadata: refreshLibraryMetadataMock,
      onLibraryUpdated: (callback) => {
        libraryUpdatedCallback = callback;
        return vi.fn();
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadLibrary() {
  const library = await importLibrary();
  await library.initialize();
  return library;
}

async function importLibrary() {
  const { useLibrary } = await import('./useLibrary.js');
  return useLibrary();
}

describe('initial load', () => {
  it('does not fetch or subscribe at module import time', async () => {
    const { state } = await importLibrary();

    expect(listTracksMock).not.toHaveBeenCalled();
    expect(libraryUpdatedCallback).toBeUndefined();
    expect(state.isLoading).toBe(true);
  });

  it('populates tracks once through idempotent initialization', async () => {
    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    const { state, initialize } = await importLibrary();

    await Promise.all([initialize(), initialize()]);

    expect(state.tracks).toEqual([{ id: 't1', title: 'Track 1' }]);
    expect(state.isLoading).toBe(false);
    expect(listTracksMock).toHaveBeenCalledOnce();
    expect(libraryUpdatedCallback).toBeTypeOf('function');
  });

  it('refetches with the backfill policy from the library-updated event', async () => {
    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    const { state } = await loadLibrary();
    expect(listTracksMock).toHaveBeenCalledTimes(1);

    listTracksMock.mockResolvedValue([{ id: 't2', title: 'Track 2' }]);
    libraryUpdatedCallback({ allowProviderBackfill: false });
    await flushMicrotasks();

    expect(listTracksMock).toHaveBeenCalledTimes(2);
    expect(listTracksMock).toHaveBeenLastCalledWith({
      allowProviderBackfill: false,
    });
    expect(state.tracks).toEqual([{ id: 't2', title: 'Track 2' }]);
  });

  it('records a fetch error and clears it on the next successful fetch', async () => {
    listTracksMock.mockRejectedValueOnce(
      new Error('EACCES C:\\Users\\Singer\\Music\\private'),
    );
    const { state, refresh } = await loadLibrary();
    expect(state.error).toMatchObject({
      title: '曲庫讀取失敗',
      message: '目前無法讀取曲庫，請再試一次。',
      actionLabel: '重試',
    });
    expect(JSON.stringify(state.error)).not.toContain('Singer');

    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    await refresh();

    expect(state.error).toBe(null);
    expect(state.tracks).toEqual([{ id: 't1', title: 'Track 1' }]);
  });
});

describe('album cover override', () => {
  it('replaces a member track thumbnailUrl with the album cover', async () => {
    listTracksMock.mockResolvedValue([
      { id: 't1', title: 'Track 1', thumbnailUrl: 'own-thumb.jpg' },
    ]);
    listPlaylistsMock.mockResolvedValue([
      {
        id: 'album-1',
        kind: 'album',
        coverUrl: 'utawakui-media://playlist-cover/album-1/cover.jpg',
        trackIds: ['t1'],
      },
    ]);
    const { state } = await loadLibrary();
    await flushMicrotasks();

    expect(state.tracks[0].thumbnailUrl).toBe(
      'utawakui-media://playlist-cover/album-1/cover.jpg',
    );
  });

  it('leaves tracks alone when the containing collection is a playlist, not an album', async () => {
    listTracksMock.mockResolvedValue([
      { id: 't1', title: 'Track 1', thumbnailUrl: 'own-thumb.jpg' },
    ]);
    listPlaylistsMock.mockResolvedValue([
      {
        id: 'p1',
        kind: 'playlist',
        coverUrl: 'utawakui-media://playlist-cover/p1/cover.jpg',
        trackIds: ['t1'],
      },
    ]);
    const { state } = await loadLibrary();
    await flushMicrotasks();

    expect(state.tracks[0].thumbnailUrl).toBe('own-thumb.jpg');
  });

  it('leaves tracks alone when the album has no custom cover', async () => {
    listTracksMock.mockResolvedValue([
      { id: 't1', title: 'Track 1', thumbnailUrl: 'own-thumb.jpg' },
    ]);
    listPlaylistsMock.mockResolvedValue([
      { id: 'album-1', kind: 'album', trackIds: ['t1'] },
    ]);
    const { state } = await loadLibrary();
    await flushMicrotasks();

    expect(state.tracks[0].thumbnailUrl).toBe('own-thumb.jpg');
  });

  it('tracksById reflects the same enriched thumbnailUrl', async () => {
    listTracksMock.mockResolvedValue([
      { id: 't1', title: 'Track 1', thumbnailUrl: 'own-thumb.jpg' },
    ]);
    listPlaylistsMock.mockResolvedValue([
      {
        id: 'album-1',
        kind: 'album',
        coverUrl: 'utawakui-media://playlist-cover/album-1/cover.jpg',
        trackIds: ['t1'],
      },
    ]);
    const { tracksById } = await loadLibrary();
    await flushMicrotasks();

    expect(tracksById.value.get('t1').thumbnailUrl).toBe(
      'utawakui-media://playlist-cover/album-1/cover.jpg',
    );
  });
});

describe('refreshMetadata', () => {
  it('calls the refreshLibraryMetadata bridge and returns the maintenance summary', async () => {
    const summary = {
      updated: 95,
      normalized: 12,
      enriched: 90,
      skipped: 3,
    };
    refreshLibraryMetadataMock.mockResolvedValue(summary);
    const { refreshMetadata } = await loadLibrary();

    const result = await refreshMetadata();

    expect(refreshLibraryMetadataMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(summary);
  });
});

describe('tracksById', () => {
  it('derives a Map keyed by track id from state.tracks', async () => {
    listTracksMock.mockResolvedValue([
      { id: 't1', title: 'Track 1' },
      { id: 't2', title: 'Track 2' },
    ]);
    const { tracksById } = await loadLibrary();
    expect(tracksById.value.get('t1')).toEqual({ id: 't1', title: 'Track 1' });
    expect(tracksById.value.size).toBe(2);
  });
});
