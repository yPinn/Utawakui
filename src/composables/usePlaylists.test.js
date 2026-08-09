import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// usePlaylists.js is a module-scope singleton that fetches once and
// subscribes to window.Utawakui.onLibraryUpdated at import time —
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance instead of leaking playlists/selectedId
// state between tests, same approach as useSeparation.test.js.
let libraryUpdatedCallback;
let getPlaylistsMock;
let createPlaylistMock;
let renamePlaylistMock;
let deletePlaylistMock;
let setPlaylistTracksMock;

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
  getPlaylistsMock = vi.fn().mockResolvedValue([]);
  createPlaylistMock = vi.fn();
  renamePlaylistMock = vi.fn();
  deletePlaylistMock = vi.fn();
  setPlaylistTracksMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      getPlaylists: getPlaylistsMock,
      createPlaylist: createPlaylistMock,
      renamePlaylist: renamePlaylistMock,
      deletePlaylist: deletePlaylistMock,
      setPlaylistTracks: setPlaylistTracksMock,
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
  const { usePlaylists } = await import('./usePlaylists.js');
  await flushMicrotasks();
  return usePlaylists();
}

describe('initial load', () => {
  it('populates state.playlists from getPlaylists on module load', async () => {
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'Encore', trackIds: [] },
    ]);
    const { state } = await loadPlaylists();
    expect(state.playlists).toEqual([
      { id: 'p1', name: 'Encore', trackIds: [] },
    ]);
  });

  it('refetches when the captured onLibraryUpdated callback fires', async () => {
    getPlaylistsMock.mockResolvedValueOnce([]);
    const { state } = await loadPlaylists();
    expect(state.playlists).toEqual([]);

    getPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'New', trackIds: [] },
    ]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.playlists).toEqual([{ id: 'p1', name: 'New', trackIds: [] }]);
  });
});

describe('selectedPlaylist', () => {
  it('is null when selectedId does not match any playlist', async () => {
    getPlaylistsMock.mockResolvedValue([{ id: 'p1', name: 'A', trackIds: [] }]);
    const { selectedPlaylist, select } = await loadPlaylists();
    select('unknown');
    expect(selectedPlaylist.value).toBe(null);
  });

  it('is nulled out when a refresh drops the currently selected id', async () => {
    getPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: [] },
    ]);
    const { state, select } = await loadPlaylists();
    select('p1');
    expect(state.selectedId).toBe('p1');

    getPlaylistsMock.mockResolvedValueOnce([]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.selectedId).toBe(null);
  });
});

describe('addTrack', () => {
  it('is a no-op (no IPC call) when the track is already a member', async () => {
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    const { addTrack } = await loadPlaylists();

    addTrack('p1', 't1');
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('appends a new track and persists it', async () => {
    getPlaylistsMock.mockResolvedValue([{ id: 'p1', name: 'A', trackIds: [] }]);
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
    getPlaylistsMock.mockResolvedValue([{ id: 'p1', name: 'A', trackIds: [] }]);
    setPlaylistTracksMock.mockReturnValueOnce(save.promise);
    const { addTrack, state } = await loadPlaylists();

    addTrack('p1', 't1');
    expect(state.playlists[0].trackIds).toEqual(['t1']);

    getPlaylistsMock.mockResolvedValueOnce([
      { id: 'p1', name: 'A', trackIds: ['t1'] },
    ]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(state.playlists[0].trackIds).toEqual(['t1']);
    expect(getPlaylistsMock).toHaveBeenCalledTimes(1);

    save.resolve([{ id: 'p1', name: 'A', trackIds: ['t1'] }]);
    await flushMicrotasks();

    expect(state.playlists[0].trackIds).toEqual(['t1']);
    expect(getPlaylistsMock).toHaveBeenCalledTimes(2);
  });
});

describe('moveTrack', () => {
  it('is clamped at the first index (moving up is a no-op)', async () => {
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { moveTrack } = await loadPlaylists();

    moveTrack('p1', 't1', -1);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('is clamped at the last index (moving down is a no-op)', async () => {
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { moveTrack } = await loadPlaylists();

    moveTrack('p1', 't2', 1);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('two rapid moveTrack calls both take effect, the second reflecting the first', async () => {
    getPlaylistsMock.mockResolvedValue([
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
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    const { setTracks } = await loadPlaylists();

    setTracks('p1', ['t1', 't2']);
    await flushMicrotasks();

    expect(setPlaylistTracksMock).not.toHaveBeenCalled();
  });

  it('persists a complete reordered track id array', async () => {
    getPlaylistsMock.mockResolvedValue([
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

describe('mutation chain resilience', () => {
  it('a rejected mutation does not permanently break later mutations', async () => {
    getPlaylistsMock.mockResolvedValue([
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
    getPlaylistsMock.mockResolvedValue([
      { id: 'p1', name: 'A', trackIds: ['t1', 't2'] },
    ]);
    setPlaylistTracksMock.mockRejectedValueOnce(new Error('disk full'));
    const { moveTrack, state } = await loadPlaylists();

    moveTrack('p1', 't1', 1);
    await flushMicrotasks();

    expect(state.error).toBe('歌單儲存失敗: disk full');
  });

  it('clears a previous error after a later successful mutation', async () => {
    getPlaylistsMock.mockResolvedValue([
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

describe('create', () => {
  it('records a user-visible error instead of throwing when creation fails', async () => {
    createPlaylistMock.mockRejectedValueOnce(new Error('disk full'));
    const { create, state } = await loadPlaylists();

    await expect(create('Encore')).resolves.toBeNull();

    expect(state.error).toBe('建立歌單失敗: disk full');
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
    getPlaylistsMock.mockResolvedValueOnce([
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
