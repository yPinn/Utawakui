import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useLibrary.js is a module-scope singleton that fetches once and
// subscribes to window.Utawakui.onLibraryUpdated at import time —
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance, same approach as usePlaylists.test.js.
let libraryUpdatedCallback;
let listTracksMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  listTracksMock = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
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
  const { useLibrary } = await import('./useLibrary.js');
  await flushMicrotasks();
  return useLibrary();
}

describe('initial load', () => {
  it('populates state.tracks from listTracks on module load', async () => {
    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    const { state } = await loadLibrary();
    expect(state.tracks).toEqual([{ id: 't1', title: 'Track 1' }]);
    expect(state.isLoading).toBe(false);
  });

  it('refetches when the captured onLibraryUpdated callback fires', async () => {
    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    const { state } = await loadLibrary();
    expect(listTracksMock).toHaveBeenCalledTimes(1);

    listTracksMock.mockResolvedValue([{ id: 't2', title: 'Track 2' }]);
    libraryUpdatedCallback();
    await flushMicrotasks();

    expect(listTracksMock).toHaveBeenCalledTimes(2);
    expect(state.tracks).toEqual([{ id: 't2', title: 'Track 2' }]);
  });

  it('records a fetch error and clears it on the next successful fetch', async () => {
    listTracksMock.mockRejectedValueOnce(new Error('disk read failed'));
    const { state, refresh } = await loadLibrary();
    expect(state.error).toBe('disk read failed');

    listTracksMock.mockResolvedValue([{ id: 't1', title: 'Track 1' }]);
    await refresh();

    expect(state.error).toBe(null);
    expect(state.tracks).toEqual([{ id: 't1', title: 'Track 1' }]);
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
