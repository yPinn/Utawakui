import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let libraryUpdatedCallback;
let listTracksMock;
let getArtistIndexMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  libraryUpdatedCallback = undefined;
  listTracksMock = vi.fn().mockResolvedValue([{ id: 'a', artist: 'Aimer' }]);
  getArtistIndexMock = vi.fn().mockResolvedValue({
    artists: [{ id: 'artist-aimer', name: 'Aimer', trackIds: ['a'] }],
    trackArtistIds: { a: ['artist-aimer'] },
  });
  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
      listPlaylists: vi.fn().mockResolvedValue([]),
      getArtistIndex: getArtistIndexMock,
      recordDiagnostic: vi.fn().mockResolvedValue(undefined),
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

async function load() {
  const { useLibrary } = await import('./useLibrary.js');
  const { useArtistIndex } = await import('./useArtistIndex.js');
  const library = useLibrary();
  await library.initialize();
  return { library, artistIndex: useArtistIndex() };
}

describe('useArtistIndex', () => {
  it('does not request the index until an artist surface asks for it', async () => {
    const { artistIndex } = await load();
    await flushMicrotasks();
    expect(getArtistIndexMock).not.toHaveBeenCalled();
    expect(artistIndex.state.index).toBeNull();
  });

  it('loads once on demand and refetches when the library changes', async () => {
    const { artistIndex } = await load();
    artistIndex.ensureLoaded();
    artistIndex.ensureLoaded();
    await flushMicrotasks();
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);
    expect(artistIndex.state.index.artists[0].name).toBe('Aimer');

    listTracksMock.mockResolvedValue([
      { id: 'a', artist: 'Aimer' },
      { id: 'b', artist: 'Eve' },
    ]);
    await libraryUpdatedCallback();
    await flushMicrotasks();
    expect(getArtistIndexMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale response that resolves after a newer one', async () => {
    const { artistIndex } = await load();
    let resolveStale;
    getArtistIndexMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({ artists: [{ id: 'new' }], trackArtistIds: {} });

    const stale = artistIndex.refresh();
    await artistIndex.refresh();
    resolveStale({ artists: [{ id: 'old' }], trackArtistIds: {} });
    await stale;
    expect(artistIndex.state.index.artists[0].id).toBe('new');
  });

  it('resolves missing photos one at a time, once per session, and refreshes on change', async () => {
    const { artistIndex } = await load();
    let active = 0;
    let maxActive = 0;
    window.Utawakui.resolveArtistPhoto = vi.fn(async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await flushMicrotasks();
      active -= 1;
      return id === 'artist-a'
        ? { status: 'ok', changed: true }
        : { status: 'unavailable', reason: 'no-official-channel' };
    });

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);

    expect(window.Utawakui.resolveArtistPhoto.mock.calls).toEqual([
      ['artist-a'],
      ['artist-b'],
    ]);
    expect(maxActive).toBe(1);
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);
  });

  it('stops a batch on a closed gate and lets those artists retry later', async () => {
    const { artistIndex } = await load();
    window.Utawakui.resolveArtistPhoto = vi
      .fn()
      .mockResolvedValueOnce({ status: 'disabled' })
      .mockResolvedValue({ status: 'ok', changed: false });

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    expect(window.Utawakui.resolveArtistPhoto).toHaveBeenCalledTimes(1);

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    expect(window.Utawakui.resolveArtistPhoto).toHaveBeenCalledTimes(3);
  });

  it('refreshes after a photo change and records a bounded error on failure', async () => {
    const { artistIndex } = await load();
    window.Utawakui.chooseArtistPhoto = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', changed: true })
      .mockRejectedValueOnce(new Error('C:\\private\\image.png'));

    await artistIndex.choosePhoto('artist-a');
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);

    await expect(artistIndex.choosePhoto('artist-a')).resolves.toBe(null);
    expect(artistIndex.state.error).toMatchObject({
      code: 'ARTIST_PHOTO_CHOOSE_FAILED',
      message: '這張圖片無法作為藝人照片，請換一張再試。',
    });
  });

  it('records a bounded error and keeps the previous index', async () => {
    const { artistIndex } = await load();
    await artistIndex.refresh();
    getArtistIndexMock.mockRejectedValueOnce(new Error('/private/path'));
    await artistIndex.refresh();
    expect(artistIndex.state.index.artists[0].name).toBe('Aimer');
    expect(artistIndex.state.error).toMatchObject({
      code: 'ARTIST_INDEX_FAILED',
      message: '目前無法整理藝人，請稍後再試。',
    });
  });
});
