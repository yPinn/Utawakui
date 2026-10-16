import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import {
  artistFolderPageContext,
  registerFolderPageObjectHandlers,
} from './folderPageObjectHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

function photo(overrides = {}) {
  return {
    key: 'photo:asset-1',
    type: 'photo',
    source: 'user',
    page: { kind: 'playlist', id: 'playlist-1' },
    placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
    pinned: false,
    rotation: 1.75,
    order: 1,
    createdAt: '2026-10-10T01:00:00.000Z',
    imageUrl: 'utawakui-media://folder-asset/asset-1/image.png',
    ...overrides,
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  const dependencies = {
    ipcMain,
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\private\\selected.png'],
      }),
    },
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    getMainWindow: () => null,
    recordDiagnostic: vi.fn().mockReturnValue({ ok: true }),
    validatePageExists: vi.fn(() => true),
    resolveArtistPages: vi.fn(async (_directory, page) => ({
      canonicalPage: page,
      storagePages: [page],
      writePage: page,
    })),
    listObjects: vi.fn((_directory, page) => [photo({ page })]),
    addPhoto: vi.fn(() => photo()),
    addNote: vi.fn(() => ({ key: 'note:note-1', type: 'note', text: '' })),
    updateNote: vi.fn(() => ({ key: 'note:note-1', text: '備忘' })),
    updatePhotoText: vi.fn(() => photo({ caption: '說明' })),
    saveLayout: vi.fn(() => [photo({ pinned: true })]),
    removeObject: vi.fn(() => true),
    ...overrides,
  };
  registerFolderPageObjectHandlers(dependencies);
  return { dependencies, handlers: ipcMain.handlers };
}

describe('registerFolderPageObjectHandlers', () => {
  it('registers fixed folder page object intents', () => {
    const { handlers } = register();
    expect([...handlers.keys()]).toEqual([
      'folder-page-objects:list',
      'folder-page-objects:choose-photo',
      'folder-page-objects:create-note',
      'folder-page-objects:update-note',
      'folder-page-objects:update-photo-text',
      'folder-page-objects:save-layout',
      'folder-page-objects:remove',
    ]);
  });

  it('lists only after validating the current entity page', async () => {
    const page = { kind: 'playlist', id: 'playlist-1' };
    const { dependencies, handlers } = register();

    await expect(
      handlers.get('folder-page-objects:list')(null, page),
    ).resolves.toEqual([photo()]);
    expect(dependencies.validatePageExists).toHaveBeenCalledWith(
      'library-dir',
      page,
    );
    expect(dependencies.listObjects).toHaveBeenCalledWith('library-dir', page);
  });

  it('projects merged artist page objects from every source credit page', async () => {
    const stable = {
      kind: 'artist',
      id: 'artist-11111111-1111-4111-8111-111111111111',
    };
    const english = { kind: 'artist', id: 'artist-68d52f69a4a24a1a' };
    const chinese = { kind: 'artist', id: 'artist-882cd3bcbb49699f' };
    const englishPhoto = photo({ key: 'photo:english', page: english });
    const chineseNote = {
      key: 'note:chinese',
      type: 'note',
      source: 'user',
      page: chinese,
    };
    const listObjects = vi.fn((_directory, page) => {
      if (page.id === english.id) return [englishPhoto];
      if (page.id === chinese.id) return [chineseNote];
      return [];
    });
    const { dependencies, handlers } = register({
      resolveArtistPages: vi.fn(async () => ({
        canonicalPage: stable,
        storagePages: [stable, english, chinese],
        writePage: english,
      })),
      listObjects,
    });

    await expect(
      handlers.get('folder-page-objects:list')(null, stable),
    ).resolves.toEqual([englishPhoto, chineseNote]);
    expect(listObjects.mock.calls.map((call) => call[1])).toEqual([
      stable,
      english,
      chinese,
    ]);

    await handlers.get('folder-page-objects:create-note')(null, {
      page: stable,
      title: '合併後新增',
      text: '保存在主要來源頁，undo 後仍可讀取。',
    });
    expect(dependencies.addNote).toHaveBeenCalledWith(
      'library-dir',
      english,
      expect.objectContaining({ title: '合併後新增' }),
    );

    await handlers.get('folder-page-objects:update-note')(null, {
      page: stable,
      key: chineseNote.key,
      title: '',
      text: '更新',
    });
    expect(dependencies.updateNote).toHaveBeenCalledWith(
      'library-dir',
      chinese,
      chineseNote.key,
      { title: '', text: '更新' },
    );

    await handlers.get('folder-page-objects:update-photo-text')(null, {
      page: stable,
      key: englishPhoto.key,
      label: '夏',
      caption: '說明',
    });
    expect(dependencies.updatePhotoText).toHaveBeenCalledWith(
      'library-dir',
      english,
      englishPhoto.key,
      { label: '夏', caption: '說明' },
    );
  });

  it('opens a single local image picker and keeps its path main-owned', async () => {
    const page = { kind: 'playlist', id: 'playlist-1' };
    const { dependencies, handlers } = register();

    await expect(
      handlers.get('folder-page-objects:choose-photo')(null, page),
    ).resolves.toEqual({ status: 'added', object: photo() });
    expect(dependencies.dialog.showOpenDialog).toHaveBeenCalledWith(null, {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    expect(dependencies.addPhoto).toHaveBeenCalledWith(
      'library-dir',
      page,
      'C:\\private\\selected.png',
    );
  });

  it('returns a bounded cancelled result without touching storage', async () => {
    const { dependencies, handlers } = register({
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: true }),
      },
    });

    await expect(
      handlers.get('folder-page-objects:choose-photo')(null, {
        kind: 'album',
        id: 'album-1',
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(dependencies.addPhoto).not.toHaveBeenCalled();
  });

  it('creates and updates notes with only title and text content', async () => {
    const page = { kind: 'album', id: 'album-1' };
    const { dependencies, handlers } = register();

    await handlers.get('folder-page-objects:create-note')(null, {
      page,
      title: '安可',
      text: '最後一首',
      sourcePath: 'C:\\private.txt',
    });
    await handlers.get('folder-page-objects:update-note')(null, {
      page,
      key: 'note:note-1',
      title: '',
      text: '備忘',
      sourcePath: 'C:\\private.txt',
    });

    expect(dependencies.addNote).toHaveBeenCalledWith('library-dir', page, {
      title: '安可',
      text: '最後一首',
    });
    expect(dependencies.updateNote).toHaveBeenCalledWith(
      'library-dir',
      page,
      'note:note-1',
      { title: '', text: '備忘' },
    );
  });

  it('passes only allowlisted layout entry fields to the store', async () => {
    const page = { kind: 'artist', id: 'artist-0123456789abcdef' };
    const { dependencies, handlers } = register();

    await handlers.get('folder-page-objects:save-layout')(null, {
      page,
      entries: [
        {
          key: 'photo:asset-1',
          placement: {
            region: 'side',
            anchor: { x: 0.7, y: 0.2, sourcePath: 'C:\\private.png' },
          },
          pinned: true,
          order: 4,
          imageUrl: 'https://example.test/private.png',
        },
        {
          key: 'derived:artist-summary',
          type: 'note',
          placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
          pinned: false,
          rotation: -1.5,
          order: 1,
          executable: 'evil.exe',
        },
      ],
      executable: 'evil.exe',
    });

    expect(dependencies.saveLayout).toHaveBeenCalledWith('library-dir', page, [
      {
        key: 'photo:asset-1',
        placement: { region: 'side', anchor: { x: 0.7, y: 0.2 } },
        pinned: true,
        order: 4,
      },
      {
        key: 'derived:artist-summary',
        type: 'note',
        placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
        pinned: false,
        rotation: -1.5,
        order: 1,
      },
    ]);
  });

  it('removes by bounded page and object key, then returns the page snapshot', async () => {
    const page = { kind: 'playlist', id: 'playlist-1' };
    const { dependencies, handlers } = register({
      listObjects: vi.fn(() => []),
    });

    await expect(
      handlers.get('folder-page-objects:remove')(null, {
        page,
        key: 'photo:asset-1',
        assetPath: 'C:\\private.png',
      }),
    ).resolves.toEqual([]);
    expect(dependencies.removeObject).toHaveBeenCalledWith(
      'library-dir',
      page,
      'photo:asset-1',
    );
  });

  it('rejects pages that main cannot derive from current library data', async () => {
    const { dependencies, handlers } = register({
      validatePageExists: vi.fn(() => false),
    });

    const error = await handlers
      .get('folder-page-objects:list')(null, {
        kind: 'playlist',
        id: 'made-up',
      })
      .catch((value) => value);

    expect(parseAppError(error).code).toBe('FOLDER_PAGE_OBJECT_PAGE_INVALID');
    expect(dependencies.listObjects).not.toHaveBeenCalled();
  });

  it('bounds operational failures while deriving the current page', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const { handlers } = register({
      recordDiagnostic,
      validatePageExists: vi.fn(() => {
        throw new Error('ENOENT C:\\Users\\Someone\\private-library.json');
      }),
    });

    const error = await handlers
      .get('folder-page-objects:list')(null, {
        kind: 'playlist',
        id: 'playlist-1',
      })
      .catch((value) => value);

    const payload = parseAppError(error);
    expect(payload.code).toBe('FOLDER_PAGE_OBJECT_LIST_FAILED');
    expect(JSON.stringify(payload)).not.toContain('Someone');
    expect(recordDiagnostic).toHaveBeenCalled();
  });

  it.each([
    [
      'listObjects',
      'folder-page-objects:list',
      'FOLDER_PAGE_OBJECT_LIST_FAILED',
    ],
    [
      'addPhoto',
      'folder-page-objects:choose-photo',
      'FOLDER_PAGE_OBJECT_ADD_FAILED',
    ],
    [
      'addNote',
      'folder-page-objects:create-note',
      'FOLDER_PAGE_OBJECT_NOTE_FAILED',
    ],
    [
      'updateNote',
      'folder-page-objects:update-note',
      'FOLDER_PAGE_OBJECT_NOTE_FAILED',
    ],
    [
      'saveLayout',
      'folder-page-objects:save-layout',
      'FOLDER_PAGE_OBJECT_LAYOUT_FAILED',
    ],
    [
      'removeObject',
      'folder-page-objects:remove',
      'FOLDER_PAGE_OBJECT_REMOVE_FAILED',
    ],
  ])('bounds %s operational failures', async (dependency, channel, code) => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const { handlers } = register({
      recordDiagnostic,
      [dependency]: vi.fn(() => {
        throw new Error('ENOENT C:\\Users\\Someone\\secret.png');
      }),
    });
    const page = { kind: 'playlist', id: 'playlist-1' };
    const args =
      channel === 'folder-page-objects:list' ||
      channel === 'folder-page-objects:choose-photo'
        ? [page]
        : [{ page, key: 'photo:asset-1', entries: [] }];

    const error = await handlers
      .get(channel)(null, ...args)
      .catch((value) => value);
    const payload = parseAppError(error);
    expect(payload.code).toBe(code);
    expect(JSON.stringify(payload)).not.toContain('Someone');
    expect(recordDiagnostic).toHaveBeenCalled();
  });
});

describe('artistFolderPageContext', () => {
  it('resolves legacy ids and keeps merged source pages available for split and undo', () => {
    const stableId = 'artist-11111111-1111-4111-8111-111111111111';
    const englishId = 'artist-68d52f69a4a24a1a';
    const chineseId = 'artist-882cd3bcbb49699f';
    const index = {
      artists: [{ id: stableId }],
      artistRedirects: {
        [englishId]: stableId,
        [chineseId]: stableId,
      },
    };

    expect(
      artistFolderPageContext({ kind: 'artist', id: englishId }, index),
    ).toEqual({
      canonicalPage: { kind: 'artist', id: stableId },
      storagePages: [
        { kind: 'artist', id: stableId },
        { kind: 'artist', id: englishId },
        { kind: 'artist', id: chineseId },
      ],
      writePage: { kind: 'artist', id: englishId },
    });
    expect(
      artistFolderPageContext({ kind: 'artist', id: 'artist-missing' }, index),
    ).toBeNull();
  });
});
