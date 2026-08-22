import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// usePlaylists.js is a module-scope singleton that fetches once and
// subscribes to window.Utawakui.onLibraryUpdated when explicitly initialized —
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance instead of leaking playlists/selectedId
// state between tests, same approach as useSeparation.test.js.
let libraryUpdatedCallback;
let listPlaylistsMock;
let createPlaylistMock;
let renamePlaylistMock;
let deletePlaylistMock;
let reorderPlaylistMock;
let setPlaylistTracksMock;
let upsertAlbumMock;
let setPlaylistKindMock;
let setPlaylistDescriptionMock;
let choosePlaylistCoverMock;
let clearPlaylistCoverMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  libraryUpdatedCallback = undefined;
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  createPlaylistMock = vi.fn();
  renamePlaylistMock = vi.fn();
  deletePlaylistMock = vi.fn();
  reorderPlaylistMock = vi.fn();
  setPlaylistTracksMock = vi.fn();
  upsertAlbumMock = vi.fn();
  setPlaylistKindMock = vi.fn();
  setPlaylistDescriptionMock = vi.fn();
  choosePlaylistCoverMock = vi.fn();
  clearPlaylistCoverMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      listPlaylists: listPlaylistsMock,
      createPlaylist: createPlaylistMock,
      renamePlaylist: renamePlaylistMock,
      deletePlaylist: deletePlaylistMock,
      reorderPlaylist: reorderPlaylistMock,
      setPlaylistTracks: setPlaylistTracksMock,
      upsertAlbum: upsertAlbumMock,
      setPlaylistKind: setPlaylistKindMock,
      setPlaylistDescription: setPlaylistDescriptionMock,
      choosePlaylistCover: choosePlaylistCoverMock,
      clearPlaylistCover: clearPlaylistCoverMock,
      onLibraryUpdated: (callback) => {
        libraryUpdatedCallback = callback;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPlaylists() {
  const playlists = await importPlaylists();
  await playlists.initialize();
  return playlists;
}

async function importPlaylists() {
  const { usePlaylists } = await import('./usePlaylists.js');
  return usePlaylists();
}

describe('initial load', () => {
  it('does not fetch or subscribe at module import time', async () => {
    const { state } = await importPlaylists();

    expect(listPlaylistsMock).not.toHaveBeenCalled();
    expect(libraryUpdatedCallback).toBeUndefined();
    expect(state.playlists).toEqual([]);
  });

  it('populates playlists once through idempotent initialization', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'Encore', trackIds: [] },
    ]);
    const { state, initialize } = await importPlaylists();

    await Promise.all([initialize(), initialize()]);

    expect(state.playlists).toEqual([
      { id: 'p1', name: 'Encore', trackIds: [] },
    ]);
    expect(listPlaylistsMock).toHaveBeenCalledOnce();
    expect(libraryUpdatedCallback).toBeTypeOf('function');
  });

  it('refetches when the captured onLibraryUpdated callback fires', async () => {
    listPlaylistsMock.mockResolvedValueOnce([]);
    const { state } = await loadPlaylists();
    expect(state.playlists).toEqual([]);

    listPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'New', trackIds: [] },
    ]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.playlists).toEqual([{ id: 'p1', name: 'New', trackIds: [] }]);
  });
});

describe('selectedPlaylist', () => {
  it('is null when selectedId does not match any playlist', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    const { selectedPlaylist, select } = await loadPlaylists();
    select('unknown');
    expect(selectedPlaylist.value).toBe(null);
  });

  it('is nulled out when a refresh drops the currently selected id', async () => {
    listPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    const { state, select } = await loadPlaylists();
    select('p1');
    expect(state.selectedId).toBe('p1');

    listPlaylistsMock.mockResolvedValueOnce([]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.selectedId).toBe(null);
  });
});

describe('addTrack', () => {
  it('is a no-op (no IPC call) when the track is already a member', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    const { addTrack } = await loadPlaylists();

    addTrack('p1', 't1');
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('appends a new track and persists it', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    setPlaylistTracksMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    const { addTrack } = await loadPlaylists();

    addTrack('p1', 't1');
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith('p1', ['t1']);
  });

  it('keeps optimistic membership while a library refresh waits for a pending mutation', async () => {
    const save = createDeferred();
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    setPlaylistTracksMock.mockReturnValueOnce(save.promise);
    const { addTrack, state } = await loadPlaylists();

    addTrack('p1', 't1');
    expect(state.playlists[0].trackIds).toEqual(['t1']);

    listPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.playlists[0].trackIds).toEqual(['t1']);
    expect(listPlaylistsMock).toHaveBeenCalledTimes(1);

    save.resolve([{ id: 'p1', name: 'A', trackIds: ['t1'] }]);
    await flushMicrotasks();

    expect(state.playlists[0].trackIds).toEqual(['t1']);
    expect(listPlaylistsMock).toHaveBeenCalledTimes(2);
  });
});

describe('addTracks', () => {
  it('is a no-op (no IPC call) when every track is already a member', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { addTracks } = await loadPlaylists();

    addTracks('p1', ['t1', 't2']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('appends only the missing tracks, in source order, after the existing ones', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    setPlaylistTracksMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2', 't3'] },
    ]);
    const { addTracks } = await loadPlaylists();

    addTracks('p1', ['t2', 't1', 't3']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith('p1', [
      't1',
      't2',
      't3',
    ]);
  });

  it('de-dupes the incoming track ids', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    setPlaylistTracksMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    const { addTracks } = await loadPlaylists();

    addTracks('p1', ['t1', 't1']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith('p1', ['t1']);
  });
});

describe('moveTrack', () => {
  it('is clamped at the first index (moving up is a no-op)', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { moveTrack } = await loadPlaylists();

    moveTrack('p1', 't1', -1);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('is clamped at the last index (moving down is a no-op)', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { moveTrack } = await loadPlaylists();

    moveTrack('p1', 't2', 1);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('two rapid moveTrack calls both take effect, the second reflecting the first', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2', 't3'] },
    ]);
    setPlaylistTracksMock
      .mockResolvedValueOnce([
        { id: 'p1', name: 'A', trackIds: ['t2', 't1', 't3'] },
      ])
      .mockResolvedValueOnce([
        { id: 'p1', name: 'A', trackIds: ['t2', 't3', 't1'] },
      ]);
    const { moveTrack, state } = await loadPlaylists();

    // Fire both without awaiting in between — the regression this guards
    // against is the second click reading the pre-first-click array.
    moveTrack('p1', 't1', 1); // t1 down: [t2, t1, t3]
    moveTrack('p1', 't1', 1); // t1 down again: [t2, t3, t1]
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledTimes(2);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(1, 'p1', [
      't2',
      't1',
      't3',
    ]);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(2, 'p1', [
      't2',
      't3',
      't1',
    ]);
    expect(state.playlists[0].trackIds).toEqual(['t2', 't3', 't1']);
  });
});

describe('setTracks', () => {
  it('is a no-op when the order is unchanged', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { setTracks } = await loadPlaylists();

    setTracks('p1', ['t1', 't2']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('persists a complete reordered track id array', async () => {
    listPlaylistsMock.mockResolvedValue([
      {
        id: 'p1',
        name: 'A',
        trackIds: ['t1', 't2', 't3'],
        addedAt: {
          t1: '2026-08-10T01:02:03.000Z',
          t2: '2026-08-10T01:03:03.000Z',
          t3: '2026-08-10T01:04:03.000Z',
        },
      },
    ]);
    setPlaylistTracksMock.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'A',
        trackIds: ['t3', 't1', 't2'],
        addedAt: {
          t1: '2026-08-10T01:02:03.000Z',
          t2: '2026-08-10T01:03:03.000Z',
          t3: '2026-08-10T01:04:03.000Z',
        },
      },
    ]);
    const { setTracks, state } = await loadPlaylists();

    setTracks('p1', ['t3', 't1', 't2']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith('p1', [
      't3',
      't1',
      't2',
    ]);
    expect(state.playlists[0].trackIds).toEqual(['t3', 't1', 't2']);
    expect(state.playlists[0].addedAt).toEqual({
      t1: '2026-08-10T01:02:03.000Z',
      t2: '2026-08-10T01:03:03.000Z',
      t3: '2026-08-10T01:04:03.000Z',
    });
  });
});

describe('reorderPlaylist', () => {
  it('is a no-op when dragged and target ids match', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    const { reorderPlaylist } = await loadPlaylists();

    reorderPlaylist('p1', 'p1', 'before');
    await flushMicrotasks();

    expect(reorderPlaylistMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the dragged or target id is not a known playlist', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    const { reorderPlaylist, state } = await loadPlaylists();

    reorderPlaylist('ghost', 'p1', 'before');
    reorderPlaylist('p1', 'ghost', 'before');
    await flushMicrotasks();

    expect(reorderPlaylistMock).not.toHaveBeenCalled();
    expect(state.playlists.map((playlist) => playlist.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('is a no-op when the requested position leaves the order unchanged', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    const { reorderPlaylist } = await loadPlaylists();

    // 'p1' is already immediately before 'p2' — moving it "before p2" again
    // produces the same order.
    reorderPlaylist('p1', 'p2', 'before');
    await flushMicrotasks();

    expect(reorderPlaylistMock).not.toHaveBeenCalled();
  });

  it('shows a restart hint instead of throwing when the preload API is stale', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    delete window.Utawakui.reorderPlaylist;
    const { reorderPlaylist, state } = await loadPlaylists();

    reorderPlaylist('p2', 'p1', 'before');
    await flushMicrotasks();

    expect(state.playlists.map((playlist) => playlist.id)).toEqual([
      'p1',
      'p2',
    ]);
    expect(state.error).toBe(
      '播放清單排序需要重新啟動應用程式才能載入新版橋接 API。',
    );
  });

  it('optimistically reorders playlists and persists the new order', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
      { id: 'p3', name: 'Third', trackIds: [] },
    ]);
    reorderPlaylistMock.mockResolvedValueOnce([
      { id: 'p3', name: 'Third', trackIds: [] },
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    const { reorderPlaylist, state } = await loadPlaylists();

    reorderPlaylist('p3', 'p1', 'before');

    expect(state.playlists.map((playlist) => playlist.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
    await flushMicrotasks();

    expect(reorderPlaylistMock).toHaveBeenCalledWith('p3', 'p1', 'before');
    expect(state.playlists.map((playlist) => playlist.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
  });

  it('records a readable error when playlist reorder persistence fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
    ]);
    reorderPlaylistMock.mockRejectedValueOnce(new Error('disk full'));
    const { reorderPlaylist, state } = await loadPlaylists();

    reorderPlaylist('p2', 'p1', 'before');
    await flushMicrotasks();

    expect(state.error).toBe('歌單排序儲存失敗: disk full');
  });

  it('two rapid reorders both compute from the latest optimistic order', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'First', trackIds: [] },
      { id: 'p2', name: 'Second', trackIds: [] },
      { id: 'p3', name: 'Third', trackIds: [] },
    ]);
    reorderPlaylistMock
      .mockResolvedValueOnce([
        { id: 'p2', name: 'Second', trackIds: [] },
        { id: 'p1', name: 'First', trackIds: [] },
        { id: 'p3', name: 'Third', trackIds: [] },
      ])
      .mockResolvedValueOnce([
        { id: 'p2', name: 'Second', trackIds: [] },
        { id: 'p3', name: 'Third', trackIds: [] },
        { id: 'p1', name: 'First', trackIds: [] },
      ]);
    const { reorderPlaylist, state } = await loadPlaylists();

    reorderPlaylist('p2', 'p1', 'before');
    reorderPlaylist('p1', 'p3', 'after');
    await flushMicrotasks();

    expect(reorderPlaylistMock).toHaveBeenCalledTimes(2);
    expect(reorderPlaylistMock).toHaveBeenNthCalledWith(
      1,
      'p2',
      'p1',
      'before',
    );
    expect(reorderPlaylistMock).toHaveBeenNthCalledWith(2, 'p1', 'p3', 'after');
    expect(state.playlists.map((playlist) => playlist.id)).toEqual([
      'p2',
      'p3',
      'p1',
    ]);
  });
});

describe('mutation chain resilience', () => {
  it('a rejected mutation does not permanently break later mutations', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    setPlaylistTracksMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', trackIds: ['t2', 't1'] }]);
    const { moveTrack } = await loadPlaylists();

    moveTrack('p1', 't1', 1);
    await flushMicrotasks();
    moveTrack('p1', 't1', -1);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledTimes(2);
  });

  it('records a user-visible error when a track mutation fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    setPlaylistTracksMock.mockRejectedValueOnce(new Error('disk full'));
    const { moveTrack, state } = await loadPlaylists();

    moveTrack('p1', 't1', 1);
    await flushMicrotasks();

    expect(state.error).toBe('歌單儲存失敗: disk full');
  });

  it('clears a previous error after a later successful mutation', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    setPlaylistTracksMock
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', trackIds: ['t2', 't1'] }]);
    const { moveTrack, state } = await loadPlaylists();

    moveTrack('p1', 't1', 1);
    await flushMicrotasks();
    expect(state.error).toBe('歌單儲存失敗: disk full');

    moveTrack('p1', 't1', -1);
    await flushMicrotasks();

    expect(state.error).toBe(null);
  });
});

describe('rename', () => {
  it('calls the preload API and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'Old Name', trackIds: [] },
    ]);
    renamePlaylistMock.mockResolvedValueOnce([
      { id: 'p1', name: 'New Name', trackIds: [] },
    ]);
    const { rename, state } = await loadPlaylists();

    await rename('p1', 'New Name');

    expect(renamePlaylistMock).toHaveBeenCalledWith('p1', 'New Name');
    expect(state.playlists[0].name).toBe('New Name');
  });

  it('records a user-visible error instead of throwing when it fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'Old Name', trackIds: [] },
    ]);
    renamePlaylistMock.mockRejectedValueOnce(new Error('disk full'));
    const { rename, state } = await loadPlaylists();

    await rename('p1', 'New Name');

    expect(state.error).toBe('重新命名歌單失敗: disk full');
  });
});

describe('remove', () => {
  it('calls the preload API and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    deletePlaylistMock.mockResolvedValueOnce([]);
    const { remove, state } = await loadPlaylists();

    await remove('p1');

    expect(deletePlaylistMock).toHaveBeenCalledWith('p1');
    expect(state.playlists).toEqual([]);
  });

  it('records a user-visible error instead of throwing when it fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    deletePlaylistMock.mockRejectedValueOnce(new Error('disk full'));
    const { remove, state } = await loadPlaylists();

    await remove('p1');

    expect(state.error).toBe('刪除歌單失敗: disk full');
  });
});

describe('removeTrack', () => {
  it('is a no-op (no IPC call) when the track is not a member', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    const { removeTrack } = await loadPlaylists();

    removeTrack('p1', 'ghost');
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('removes an existing track and persists it', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    setPlaylistTracksMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: ['t2'] },
    ]);
    const { removeTrack, state } = await loadPlaylists();

    removeTrack('p1', 't1');
    await flushMicrotasks();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith('p1', ['t2']);
    expect(state.playlists[0].trackIds).toEqual(['t2']);
  });
});

describe('actions are inert without the preload bridge', () => {
  it('resolves without throwing and leaves state untouched when window.Utawakui is unavailable', async () => {
    vi.stubGlobal('window', {});
    const { rename, state } = await loadPlaylists();

    await expect(rename('p1', 'New Name')).resolves.toBeUndefined();

    expect(state.playlists).toEqual([]);
    expect(state.error).toBe(null);
  });
});

describe('create', () => {
  it('records a user-visible error instead of throwing when creation fails', async () => {
    createPlaylistMock.mockRejectedValueOnce(new Error('disk full'));
    const { create, state } = await loadPlaylists();

    await expect(create('Encore')).resolves.toBeNull();

    expect(state.error).toBe('建立歌單失敗: disk full');
  });

  it('stringifies a non-Error rejection instead of crashing', async () => {
    createPlaylistMock.mockRejectedValueOnce('a plain string rejection');
    const { create, state } = await loadPlaylists();

    await expect(create('Encore')).resolves.toBeNull();

    expect(state.error).toBe('建立歌單失敗: a plain string rejection');
  });

  it('selects the newly created playlist', async () => {
    createPlaylistMock.mockResolvedValueOnce([
      { id: 'p1', name: '播放清單 #1', trackIds: [] },
    ]);
    const { create, state } = await loadPlaylists();

    const created = await create();

    expect(state.selectedId).toBe('p1');
    expect(created).toEqual({
      id: 'p1',
      name: '播放清單 #1',
      trackIds: [],
    });
  });

  it('selects the appended playlist when playlists already exist', async () => {
    listPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'Existing', trackIds: [] },
    ]);
    createPlaylistMock.mockResolvedValueOnce([
      { id: 'p1', name: 'Existing', trackIds: [] },
      { id: 'p2', name: '播放清單 #2', trackIds: [] },
    ]);
    const { create, state } = await loadPlaylists();

    const created = await create();

    expect(state.selectedId).toBe('p2');
    expect(created).toEqual({
      id: 'p2',
      name: '播放清單 #2',
      trackIds: [],
    });
  });
});

describe('setKind', () => {
  it('calls the preload API and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', kind: 'playlist', trackIds: [] },
    ]);
    setPlaylistKindMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', kind: 'album', trackIds: [] },
    ]);
    const { setKind, state } = await loadPlaylists();

    await setKind('p1', 'album');

    expect(setPlaylistKindMock).toHaveBeenCalledWith('p1', 'album');
    expect(state.playlists[0].kind).toBe('album');
  });

  it('records a user-visible error instead of throwing when it fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', kind: 'playlist', trackIds: [] },
    ]);
    setPlaylistKindMock.mockRejectedValueOnce(new Error('disk full'));
    const { setKind, state } = await loadPlaylists();

    await setKind('p1', 'album');

    expect(state.error).toBe('轉換歌單類型失敗: disk full');
  });
});

describe('setDescription', () => {
  it('calls the preload API and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', description: '', trackIds: [] },
    ]);
    setPlaylistDescriptionMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', description: '說明', trackIds: [] },
    ]);
    const { setDescription, state } = await loadPlaylists();

    await setDescription('p1', '說明');

    expect(setPlaylistDescriptionMock).toHaveBeenCalledWith('p1', '說明');
    expect(state.playlists[0].description).toBe('說明');
  });

  it('records a user-visible error instead of throwing when it fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', description: '', trackIds: [] },
    ]);
    setPlaylistDescriptionMock.mockRejectedValueOnce(new Error('disk full'));
    const { setDescription, state } = await loadPlaylists();

    await setDescription('p1', '說明');

    expect(state.error).toBe('更新歌單說明失敗: disk full');
  });
});

describe('setCover / clearCover', () => {
  it('setCover calls choosePlaylistCover and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    choosePlaylistCoverMock.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'A',
        coverImage: 'cover.jpg',
        coverUrl: 'utawakui-media://playlist-cover/p1/cover.jpg',
        trackIds: [],
      },
    ]);
    const { setCover, state } = await loadPlaylists();

    await setCover('p1');

    expect(choosePlaylistCoverMock).toHaveBeenCalledWith('p1');
    expect(state.playlists[0].coverUrl).toBe(
      'utawakui-media://playlist-cover/p1/cover.jpg',
    );
  });

  it('clearCover calls clearPlaylistCover and applies the returned array', async () => {
    listPlaylistsMock.mockResolvedValue([
      {
        id: 'p1',
        name: 'A',
        coverImage: 'cover.jpg',
        coverUrl: 'utawakui-media://playlist-cover/p1/cover.jpg',
        trackIds: [],
      },
    ]);
    clearPlaylistCoverMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    const { clearCover, state } = await loadPlaylists();

    await clearCover('p1');

    expect(clearPlaylistCoverMock).toHaveBeenCalledWith('p1');
    expect(state.playlists[0].coverUrl).toBeUndefined();
  });

  it('setCover records a user-visible error instead of throwing when it fails', async () => {
    listPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    choosePlaylistCoverMock.mockRejectedValueOnce(new Error('disk full'));
    const { setCover, state } = await loadPlaylists();

    await setCover('p1');

    expect(state.error).toBe('設定封面失敗: disk full');
  });
});

describe('upsertAlbum', () => {
  it('calls the preload API and returns the matching album from the response', async () => {
    upsertAlbumMock.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'GOLDEN',
        kind: 'album',
        source: { platform: 'youtube', id: 'OLAK5uy_x' },
        trackIds: ['a', 'b'],
      },
    ]);
    const { upsertAlbum } = await loadPlaylists();

    const result = await upsertAlbum({
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });

    expect(upsertAlbumMock).toHaveBeenCalledWith({
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });
    expect(result?.id).toBe('p1');
  });

  it('records a user-visible error instead of throwing when it fails', async () => {
    upsertAlbumMock.mockRejectedValueOnce(new Error('disk full'));
    const { upsertAlbum, state } = await loadPlaylists();

    const result = await upsertAlbum({
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a'],
    });

    expect(result).toBeNull();
    expect(state.error).toBe('建立專輯歌單失敗: disk full');
  });
});
