import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useLibrary.js is a module-scope singleton that fetches once and
// subscribes to window.Utawakui.onLibraryUpdated when explicitly initialized —
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance, same approach as usePlaylists.test.js.
let libraryUpdatedCallback;
let listTracksMock;
let listPlaylistsMock;

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
  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
      listPlaylists: listPlaylistsMock,
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
  it('finishes singleton hydration after the requesting page unmounts', async () => {
    const read = Promise.withResolvers();
    listTracksMock.mockReturnValueOnce(read.promise);
    const library = await importLibrary(),
      { effectScope } = await import('vue');
    const page = effectScope();
    let settled = false;
    page.run(() =>
      library.initialize().then(() => {
        settled = true;
      }),
    );
    page.stop();
    read.resolve([{ id: 'new' }]);
    await flushMicrotasks();
    expect(settled).toBe(true);
    expect(library.state.isInitialized).toBe(true);
  });
  it('shows a saved release cover at cold start and keeps it independent of action admission', async () => {
    const collection = {
      id: 'r',
      kind: 'album',
      trackIds: ['a'],
      coverUrl: 'release-cover',
      releaseLibraryEpoch: 1,
      requiresMembershipVerification: true,
      availableTrackIds: [],
      resolvedRelease: { revision: 2 },
    };
    listPlaylistsMock.mockResolvedValue([collection]);
    listTracksMock.mockResolvedValue([
      { id: 'a', thumbnailUrl: 'track-cover' },
    ]);
    const library = await loadLibrary();
    expect(library.state.tracks[0].thumbnailUrl).toBe('release-cover');
    const { releaseMembershipProjection, releaseMembershipKey } =
      await import('./useReleaseMembershipProjection.js');
    releaseMembershipProjection.cache.set(releaseMembershipKey(collection), [
      'a',
    ]);
    expect(library.state.tracks[0].thumbnailUrl).toBe('release-cover');
    releaseMembershipProjection.cache.clear();
    expect(library.state.tracks[0].thumbnailUrl).toBe('release-cover');
  });
  it('can finish hydration from the latest read while the superseded read is unresolved', async () => {
    const older = Promise.withResolvers();
    listTracksMock
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce([{ id: 'current' }]);
    const library = await importLibrary();
    let initialized = false;
    const startup = library.initialize().then(() => {
      initialized = true;
    });
    await library.refresh();
    await flushMicrotasks();
    expect(initialized).toBe(true);
    expect(library.state.isInitialized).toBe(true);
    older.resolve([{ id: 'stale' }]);
    await startup;
    await flushMicrotasks();
    expect(library.state.tracks[0].id).toBe('current');
  });
  it('waits for the current snapshot when initialization is superseded', async () => {
    const older = Promise.withResolvers();
    const latest = Promise.withResolvers();
    listTracksMock
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const library = await importLibrary();
    let initialized = false;
    const startup = library.initialize().then(() => {
      initialized = true;
    });
    const currentRead = library.refresh();
    older.resolve([{ id: 'stale' }]);
    await flushMicrotasks();
    expect(initialized).toBe(false);
    expect(library.state.isInitialized).toBe(false);
    latest.resolve([{ id: 'current' }]);
    await Promise.all([startup, currentRead]);
    expect(library.state.isInitialized).toBe(true);
    expect(library.state.tracks[0].id).toBe('current');
  });
  it.each(['resolve', 'reject'])(
    'ignores an older %s while the latest read is pending',
    async (outcome) => {
      const older = Promise.withResolvers();
      const latest = Promise.withResolvers();
      listTracksMock
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise);
      const { state, refresh } = await importLibrary();
      const oldRead = refresh();
      const newRead = refresh();
      if (outcome === 'resolve') older.resolve([{ id: 'stale' }]);
      else older.reject(new Error('stale error'));
      await oldRead;
      expect(state.tracks).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.hasLoaded).toBe(false);
      expect(state.isLoading).toBe(true);
      latest.resolve([{ id: 'current' }]);
      await newRead;
      expect(state.tracks[0].id).toBe('current');
      expect(state.isLoading).toBe(false);
    },
  );

  it.each(['resolve', 'reject'])(
    'keeps the latest successful snapshot after a late %s',
    async (outcome) => {
      const older = Promise.withResolvers();
      listTracksMock
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce([{ id: 'current' }]);
      const { state, refresh } = await importLibrary();
      const oldRead = refresh();
      await refresh();
      if (outcome === 'resolve') older.resolve([{ id: 'stale' }]);
      else older.reject(new Error('stale error'));
      await oldRead;
      expect(state.tracks[0].id).toBe('current');
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    },
  );

  it('settles the latest failed read without waiting for an older request', async () => {
    const older = Promise.withResolvers();
    listTracksMock
      .mockReturnValueOnce(older.promise)
      .mockRejectedValueOnce(new Error('current failure'));
    const { state, refresh } = await importLibrary();
    const oldRead = refresh();
    await refresh();
    const error = state.error;
    expect(error).toBeTruthy();
    expect(state.isLoading).toBe(false);
    older.resolve([{ id: 'stale' }]);
    await oldRead;
    expect(state.tracks).toEqual([]);
    expect(state.error).toEqual(error);
    expect(state.hasLoaded).toBe(false);
  });
  it('settles without a desktop bridge instead of leaving an initial placeholder active', async () => {
    vi.stubGlobal('window', undefined);
    const library = await loadLibrary();
    expect(library.state.isLoading).toBe(false);
    expect(library.state.isInitialized).toBe(true);
  });
  it('re-enters loading for initial retry and preserves tracks on a failed background refresh', async () => {
    listTracksMock.mockRejectedValueOnce(new Error('read failed'));
    const { state, refresh } = await loadLibrary();
    let finish;
    listTracksMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const retry = refresh();
    expect(state.isLoading).toBe(true);
    finish([{ id: 'kept', title: 'Keep me' }]);
    await retry;
    expect(state.hasLoaded).toBe(true);
    listTracksMock.mockRejectedValueOnce(new Error('refresh failed'));
    const update = refresh();
    expect(state.isLoading).toBe(false);
    expect(state.tracks[0].id).toBe('kept');
    await update;
    expect(state.tracks[0].id).toBe('kept');
  });
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

  it('folds notices that arrive during a read into one follow-up read', async () => {
    await loadLibrary();
    const inFlight = Promise.withResolvers();
    listTracksMock.mockReturnValueOnce(inFlight.promise);

    libraryUpdatedCallback({ allowProviderBackfill: false });
    libraryUpdatedCallback({ allowProviderBackfill: false });
    libraryUpdatedCallback({ allowProviderBackfill: false });
    libraryUpdatedCallback({ allowProviderBackfill: false });
    expect(listTracksMock).toHaveBeenCalledTimes(2);

    inFlight.resolve([]);
    await flushMicrotasks();
    expect(listTracksMock).toHaveBeenCalledTimes(3);
    expect(listTracksMock).toHaveBeenLastCalledWith({
      allowProviderBackfill: false,
    });

    await flushMicrotasks();
    expect(listTracksMock).toHaveBeenCalledTimes(3);
  });

  it('lets a folded read backfill when any merged notice allowed it', async () => {
    await loadLibrary();
    const inFlight = Promise.withResolvers();
    listTracksMock.mockReturnValueOnce(inFlight.promise);

    libraryUpdatedCallback({ allowProviderBackfill: false });
    libraryUpdatedCallback({ allowProviderBackfill: false });
    libraryUpdatedCallback({ reason: 'metadata' });
    inFlight.resolve([]);
    await flushMicrotasks();

    expect(listTracksMock).toHaveBeenCalledTimes(3);
    expect(listTracksMock).toHaveBeenLastCalledWith();
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
