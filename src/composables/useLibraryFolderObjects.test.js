import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryFolderObjects } from './useLibraryFolderObjects.js';
import { useAppNotifications } from './useAppNotifications.js';

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
  const notifications = useAppNotifications();
  for (const item of notifications.items.value) notifications.clear(item.key);
});

describe('createLibraryFolderObjects', () => {
  it('notifies an old document failure after its editor has left without polluting the new page', async () => {
    let rejectSave;
    const pending = new Promise((_, reject) => {
      rejectSave = reject;
    });
    const api = bridge({
      updateFolderPageNote: vi.fn().mockReturnValue(pending),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    const onError = vi.fn();
    const saving = owner.updateNote('note:n', { text: 'Draft' }, { onError });
    await owner.load({ kind: 'album', id: 'b' });
    rejectSave(new Error('private'));
    await expect(saving).resolves.toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(owner.error.value).toBe('');
    expect(owner.readError.value).toBe('');
    expect(useAppNotifications().items.value[0]).toMatchObject({
      tone: 'danger',
      message: '目前無法儲存頁面便條。',
    });
    owner.dispose();
  });
  it('keeps photo text failures in the editor and commits only a successful projection', async () => {
    const api = bridge({
      listFolderPageObjects: vi.fn().mockResolvedValue([photo()]),
      updateFolderPagePhotoText: vi
        .fn()
        .mockRejectedValueOnce(new Error('disk'))
        .mockResolvedValue({ key: 'photo:asset-1', caption: 'Saved' }),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    const onError = vi.fn();
    await expect(
      owner.updatePhotoText('photo:asset-1', { caption: 'Draft' }, { onError }),
    ).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith('目前無法儲存照片文字。');
    expect(useAppNotifications().items.value).toHaveLength(0);
    await expect(
      owner.updatePhotoText('photo:asset-1', { caption: 'Saved' }, { onError }),
    ).resolves.toBe(true);
    expect(owner.objects.value[0].caption).toBe('Saved');
    expect(owner.error.value).toBe('');
    owner.dispose();
  });

  it('rejects invalid editor fields and ignores a photo save response after navigation', async () => {
    const pending = deferred();
    const api = bridge({
      updateFolderPagePhotoText: vi.fn().mockReturnValue(pending.promise),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await expect(owner.updateNote('note:n', { text: 'x' })).resolves.toBe(
      false,
    );
    await owner.load(playlistPage);
    await expect(owner.updateNote('note:n', { text: {} })).resolves.toBe(false);
    await expect(
      owner.updatePhotoText('photo:a', { caption: {} }),
    ).resolves.toBe(false);
    const saving = owner.updatePhotoText('photo:a', { caption: 'Draft' });
    await owner.load({ kind: 'album', id: 'new' });
    pending.resolve({ key: 'photo:a', caption: 'Old' });
    await expect(saving).resolves.toBe(false);
    expect(owner.objects.value).toEqual([]);
    expect(useAppNotifications().items.value).toHaveLength(0);
    owner.dispose();
  });
  it('keeps list failures inline and does not publish a notification', async () => {
    const api = bridge({
      listFolderPageObjects: vi.fn().mockRejectedValue(new Error('private')),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    expect(owner.readError.value).toBe('目前無法讀取頁面物件。');
    expect(useAppNotifications().items.value).toHaveLength(0);
    owner.dispose();
  });

  it('does not replay a deleted object from a failed layout batch', async () => {
    const api = bridge({
      listFolderPageObjects: vi.fn().mockResolvedValue([photo()]),
      saveFolderPageLayout: vi.fn().mockRejectedValue(new Error('disk')),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    await owner.saveLayout([entry('photo:asset-1')], { immediate: true });
    await owner.remove('photo:asset-1');
    const writes = api.saveFolderPageLayout.mock.calls.length;
    await expect(owner.flush()).resolves.toBe(true);
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(writes);
    expect(useAppNotifications().items.value).toHaveLength(0);
    owner.dispose();
  });
  it('retains failed layout and retries the write instead of reloading the document', async () => {
    const api = bridge({
      saveFolderPageLayout: vi
        .fn()
        .mockRejectedValueOnce(new Error('disk'))
        .mockResolvedValue([]),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    const layout = entry('derived:artist-summary', { type: 'note' });
    await expect(owner.saveLayout([layout], { immediate: true })).resolves.toBe(
      false,
    );
    const notifications = useAppNotifications();
    expect(notifications.items.value).toHaveLength(1);
    const notice = notifications.items.value[0];
    expect(notice.actionLabel).toBe('重試儲存');
    await notifications.runAction(notice.id);
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(2);
    expect(api.saveFolderPageLayout.mock.calls[1][0]).toEqual({
      page: playlistPage,
      entries: [layout],
    });
    expect(api.listFolderPageObjects).toHaveBeenCalledTimes(1);
    expect(owner.error.value).toBe('');
    expect(notifications.items.value).toHaveLength(0);
    owner.dispose();
  });

  it('keeps failed writes on their original page and does not retry in a busy loop', async () => {
    vi.useFakeTimers();
    const otherPage = { kind: 'album', id: 'b' };
    const api = bridge({
      saveFolderPageLayout: vi
        .fn()
        .mockRejectedValueOnce(new Error('disk'))
        .mockResolvedValue([]),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    await owner.saveLayout([entry('derived:a')], { immediate: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveFolderPageLayout).toHaveBeenCalledTimes(1);
    const notice = useAppNotifications().items.value[0];
    await owner.load(otherPage);
    await owner.saveLayout([entry('derived:b')], { immediate: true });
    await useAppNotifications().runAction(notice.id);
    expect(
      api.saveFolderPageLayout.mock.calls.map(([intent]) => intent.page),
    ).toEqual([playlistPage, otherPage, playlistPage]);
    expect(owner.page.value).toEqual(otherPage);
    expect(owner.objects.value.map((value) => value.key)).toEqual([
      'derived:b',
    ]);
    owner.dispose();
  });

  it('keeps a newer layout when an older in-flight write fails', async () => {
    let fail;
    const pending = new Promise((_, reject) => {
      fail = reject;
    });
    const api = bridge({
      saveFolderPageLayout: vi
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue([]),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    const saving = owner.saveLayout([entry('derived:a', { order: 1 })], {
      immediate: true,
    });
    const newer = owner.saveLayout([entry('derived:a', { order: 9 })], {
      immediate: true,
    });
    fail(new Error('disk'));
    await Promise.all([saving, newer]);
    const notice = useAppNotifications().items.value[0];
    await useAppNotifications().runAction(notice.id);
    expect(api.saveFolderPageLayout.mock.calls.at(-1)[0].entries[0].order).toBe(
      9,
    );
    owner.dispose();
  });

  it('keeps editor failures inline and does not mutate a failed note draft into saved content', async () => {
    const note = {
      key: 'note:n',
      type: 'note',
      source: 'user',
      title: 'Saved',
      text: 'Before',
    };
    const api = bridge({
      listFolderPageObjects: vi.fn().mockResolvedValue([note]),
      updateFolderPageNote: vi.fn().mockRejectedValue(new Error('disk')),
    });
    const owner = createLibraryFolderObjects({ bridge: api });
    await owner.load(playlistPage);
    const onError = vi.fn();
    await expect(
      owner.updateNote(
        note.key,
        { title: 'Draft', text: 'After' },
        { onError },
      ),
    ).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith('目前無法儲存頁面便條。');
    expect(owner.objects.value[0].title).toBe('Saved');
    expect(owner.readError.value).toBe('');
    expect(useAppNotifications().items.value).toHaveLength(0);
    owner.dispose();
  });
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
      owner.addNote({ title: '安可', text: '最後一首', paper: 'rose' }),
    ).resolves.toBe('note:note-1');
    expect(owner.freshKeys.value).toEqual(['note:note-1']);
    expect(api.createFolderPageNote).toHaveBeenCalledWith({
      page: playlistPage,
      title: '安可',
      text: '最後一首',
      paper: 'rose',
    });
    await expect(
      owner.updateNote('note:note-1', {
        title: '',
        text: '安可曲',
        paper: 'kraft',
      }),
    ).resolves.toBe(true);
    expect(owner.objects.value[0]).toMatchObject({
      title: '',
      text: '安可曲',
      paper: 'kraft',
    });
    expect(api.updateFolderPageNote).toHaveBeenCalledWith({
      page: playlistPage,
      key: 'note:note-1',
      title: '',
      text: '安可曲',
      paper: 'kraft',
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
