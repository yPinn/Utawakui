import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryFolderObjects } from './useLibraryFolderObjects.js';

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const playlistPage = { kind: 'playlist', id: 'playlist-1' };

function photo(id = 'asset-1', overrides = {}) {
  return {
    key: `photo:${id}`,
    type: 'photo',
    source: 'user',
    page: playlistPage,
    placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
    pinned: false,
    rotation: 1.75,
    order: 1,
    createdAt: '2026-10-10T01:00:00.000Z',
    imageUrl: `utawakui-media://folder-asset/${id}/image.png`,
    ...overrides,
  };
}

function entry(key, overrides = {}) {
  return {
    key,
    placement: { region: 'paper', anchor: { x: 0.5, y: 0.5 } },
    pinned: false,
    order: 1,
    ...overrides,
  };
}

function bridge(overrides = {}) {
  return {
    listFolderPageObjects: vi.fn().mockResolvedValue([]),
    chooseFolderPagePhoto: vi
      .fn()
      .mockResolvedValue({ status: 'added', object: photo() }),
    saveFolderPageLayout: vi.fn().mockResolvedValue([]),
    removeFolderPageObject: vi.fn().mockResolvedValue([]),
    createFolderPageNote: vi.fn().mockResolvedValue({
      key: 'note:note-1',
      type: 'note',
      source: 'user',
      text: '',
    }),
    updateFolderPageNote: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createLibraryFolderObjects', () => {
  it('ignores a stale page response after the document changes', async () => {
    const first = deferred();
    const second = deferred();
    const api = bridge({
      listFolderPageObjects: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    const artistPage = { kind: 'artist', id: 'artist-0123456789abcdef' };

    const firstLoad = owner.load(playlistPage);
    const secondLoad = owner.load(artistPage);
    second.resolve([photo('artist-photo', { page: artistPage })]);
    await secondLoad;
    first.resolve([photo('stale-photo')]);
    await firstLoad;

    expect(owner.page.value).toEqual(artistPage);
    expect(owner.freshKeys.value).toEqual([]);
    expect(owner.objects.value.map((object) => object.key)).toEqual([
      'photo:artist-photo',
    ]);
  });

  it('adds a photo, reports cancellation, and caps user objects only', async () => {
    const api = bridge();
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);

    await expect(owner.addPhoto()).resolves.toBe('photo:asset-1');
    expect(owner.objects.value).toEqual([photo()]);
    api.chooseFolderPagePhoto.mockResolvedValueOnce({ status: 'cancelled' });
    await expect(owner.addPhoto()).resolves.toBe(null);

    api.listFolderPageObjects.mockResolvedValueOnce([
      { ...photo(), key: 'derived:artist-summary', source: 'derived' },
      ...Array.from({ length: 11 }, (_, index) => photo(`asset-${index}`)),
    ]);
    await owner.load(playlistPage);
    expect(owner.limitReached.value).toBe(false);

    api.listFolderPageObjects.mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, index) => photo(`asset-${index}`)),
    );
    await owner.load(playlistPage);
    expect(owner.limitReached.value).toBe(true);
    await expect(owner.addPhoto()).resolves.toBe(null);
    expect(api.chooseFolderPagePhoto).toHaveBeenCalledTimes(2);
  });

  it('debounces drag layout and saves only the latest entry per key in one batch', async () => {
    vi.useFakeTimers();
    const api = bridge({
      listFolderPageObjects: vi
        .fn()
        .mockResolvedValue([photo('asset-1'), photo('asset-2')]),
    });
    const owner = createLibraryFolderObjects({ bridge: api, delayMs: 100 });
    await owner.load(playlistPage);

    owner.saveLayout([entry('photo:asset-1', { order: 1 })]);
    owner.saveLayout([
      entry('photo:asset-1', {
        placement: { region: 'side', anchor: { x: 0.8, y: 0.6 } },
        order: 2,
      }),
    ]);
    owner.saveLayout([entry('photo:asset-2', { order: 1 })]);
    expect(owner.objects.value[0]).toMatchObject({
      placement: { region: 'side', anchor: { x: 0.8, y: 0.6 } },
      order: 2,
    });
    expect(api.saveFolderPageLayout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(1);
    expect(api.saveFolderPageLayout).toHaveBeenCalledWith({
      page: playlistPage,
      entries: [
        entry('photo:asset-1', {
          placement: { region: 'side', anchor: { x: 0.8, y: 0.6 } },
          order: 2,
        }),
        entry('photo:asset-2', { order: 1 }),
      ],
    });
  });

  it('keeps persistence single-flight and flushes the latest edit', async () => {
    vi.useFakeTimers();
    const firstSave = deferred();
    const api = bridge({
      listFolderPageObjects: vi.fn().mockResolvedValue([photo()]),
      saveFolderPageLayout: vi
        .fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockResolvedValue([]),
    });
    const owner = createLibraryFolderObjects({ bridge: api, delayMs: 20 });
    await owner.load(playlistPage);

    owner.saveLayout([entry('photo:asset-1', { order: 1 })]);
    await vi.advanceTimersByTimeAsync(20);
    owner.saveLayout([
      entry('photo:asset-1', {
        placement: { region: 'paper', anchor: { x: 0.9, y: 0.9 } },
      }),
    ]);
    const flush = owner.flush();
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(1);
    firstSave.resolve([]);
    await flush;
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(2);
    expect(
      api.saveFolderPageLayout.mock.calls[1][0].entries[0].placement,
    ).toEqual({ region: 'paper', anchor: { x: 0.9, y: 0.9 } });
  });

  it('creates a local derived record on its first layout and sends its type and rotation', async () => {
    const page = { kind: 'album', id: 'album-1' };
    const api = bridge();
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(page);

    const summary = entry('derived:artist-summary', {
      type: 'note',
      rotation: -1.5,
      placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
    });
    await expect(
      owner.saveLayout([summary], { immediate: true }),
    ).resolves.toBe(true);

    expect(owner.objects.value).toEqual([
      {
        key: 'derived:artist-summary',
        type: 'note',
        source: 'derived',
        placement: summary.placement,
        pinned: false,
        rotation: -1.5,
        order: 1,
      },
    ]);
    expect(api.saveFolderPageLayout).toHaveBeenCalledWith({
      page,
      entries: [summary],
    });
  });

  it('restores independent page objects after navigating A to B to A', async () => {
    const albumA = { kind: 'album', id: 'album-a' };
    const albumB = { kind: 'album', id: 'album-b' };
    const api = bridge({
      listFolderPageObjects: vi.fn(async (page) => [photo(page.id, { page })]),
    });
    const owner = createLibraryFolderObjects({ bridge: api });

    await owner.load(albumA);
    await owner.load(albumB);
    expect(owner.objects.value.map((object) => object.key)).toEqual([
      'photo:album-b',
    ]);
    await owner.load(albumA);
    expect(owner.objects.value.map((object) => object.key)).toEqual([
      'photo:album-a',
    ]);
  });

  it('creates a note from saved content and updates title and text together', async () => {
    const api = bridge();
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);

    await expect(
      owner.addNote({ title: '安可', text: '最後一首' }),
    ).resolves.toBe('note:note-1');
    expect(owner.freshKeys.value).toEqual(['note:note-1']);
    expect(api.createFolderPageNote).toHaveBeenCalledWith({
      page: playlistPage,
      title: '安可',
      text: '最後一首',
    });
    await expect(
      owner.updateNote('note:note-1', { title: '', text: '安可曲' }),
    ).resolves.toBe(true);
    expect(owner.objects.value[0]).toMatchObject({ title: '', text: '安可曲' });
    expect(api.updateFolderPageNote).toHaveBeenCalledWith({
      page: playlistPage,
      key: 'note:note-1',
      title: '',
      text: '安可曲',
    });

    api.createFolderPageNote.mockRejectedValueOnce(new Error('disk'));
    await expect(owner.addNote({ text: 'x' })).resolves.toBe(null);
    expect(owner.error.value).toBe('目前無法新增頁面便條。');
  });

  it('removes via the bounded bridge after flushing and recovers errors', async () => {
    const api = bridge({
      listFolderPageObjects: vi.fn().mockResolvedValue([photo()]),
    });
    const owner = createLibraryFolderObjects({ bridge: api, delayMs: 1_000 });
    await owner.load(playlistPage);

    owner.saveLayout([entry('photo:asset-1')]);
    await expect(owner.remove('photo:asset-1')).resolves.toBe(true);
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(1);
    expect(api.removeFolderPageObject).toHaveBeenCalledWith({
      page: playlistPage,
      key: 'photo:asset-1',
    });
    expect(owner.objects.value).toEqual([]);

    api.chooseFolderPagePhoto.mockRejectedValueOnce(new Error('private path'));
    await expect(owner.addPhoto()).resolves.toBe(null);
    expect(owner.error.value).toBe('目前無法新增頁面照片。');

    api.saveFolderPageLayout.mockRejectedValueOnce(new Error('disk'));
    await expect(
      owner.saveLayout([entry('derived:artist-summary')], { immediate: true }),
    ).resolves.toBe(false);
    expect(owner.error.value).toBe('目前無法儲存頁面物件配置。');
  });
});
