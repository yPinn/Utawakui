import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { registerPlaylistsHandlers } from './playlistsHandlers.js';

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

function playlist(overrides = {}) {
  return { id: 'p1', name: 'Playlist', kind: 'user', ...overrides };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  registerPlaylistsHandlers({
    ipcMain,
    dialog: {},
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    getMainWindow: () => null,
    requireFeatureGate: vi.fn(),
    featureIds: { PROVIDER_FLOW: 'provider-flow' },
    recordDiagnostic: vi.fn().mockReturnValue({ ok: true }),
    loadPlaylistsList: vi.fn(() => [playlist()]),
    createPlaylistRecord: vi.fn(() => [playlist()]),
    renamePlaylistRecord: vi.fn(() => [playlist()]),
    deletePlaylistRecord: vi.fn(() => []),
    deletePlaylistCoverDirectory: vi.fn(),
    reorderPlaylistsList: vi.fn(() => [playlist()]),
    setPlaylistTrackIds: vi.fn(() => [playlist()]),
    upsertAlbumPlaylist: vi.fn(() => [playlist({ kind: 'album' })]),
    writePlaylistCoverFromRemoteUrl: vi.fn(),
    setPlaylistCoverFilename: vi.fn(() => [playlist()]),
    setPlaylistKindValue: vi.fn(() => [playlist()]),
    setPlaylistDescriptionText: vi.fn(() => [playlist()]),
    writePlaylistCoverFromFile: vi.fn(() => 'cover.jpg'),
    ...overrides,
  });
  return ipcMain.handlers;
}

describe('registerPlaylistsHandlers', () => {
  it('registers exactly the eleven playlist intents', () => {
    const handlers = register();
    expect([...handlers.keys()]).toEqual([
      'playlists:list',
      'playlists:create',
      'playlists:rename',
      'playlists:delete',
      'playlists:reorder',
      'playlists:set-tracks',
      'playlists:upsert-album',
      'playlists:set-kind',
      'playlists:set-description',
      'playlists:choose-cover',
      'playlists:clear-cover',
    ]);
  });

  it('returns the playlist list on success', async () => {
    const handlers = register({
      loadPlaylistsList: vi.fn(() => [playlist({ coverImage: 'c.jpg' })]),
    });
    await expect(handlers.get('playlists:list')()).resolves.toEqual([
      expect.objectContaining({ coverUrl: expect.any(String) }),
    ]);
  });

  it.each([
    [
      'playlists:list',
      'loadPlaylistsList',
      'PLAYLISTS_LIST_FAILED',
      'list',
      [],
    ],
    [
      'playlists:create',
      'createPlaylistRecord',
      'PLAYLISTS_CREATE_FAILED',
      'create',
      ['name'],
    ],
    [
      'playlists:rename',
      'renamePlaylistRecord',
      'PLAYLISTS_RENAME_FAILED',
      'rename',
      ['p1', 'name'],
    ],
    [
      'playlists:delete',
      'deletePlaylistRecord',
      'PLAYLISTS_DELETE_FAILED',
      'delete',
      ['p1'],
    ],
    [
      'playlists:reorder',
      'reorderPlaylistsList',
      'PLAYLISTS_REORDER_FAILED',
      'reorder',
      ['p1', 'p2', 'after'],
    ],
    [
      'playlists:set-kind',
      'setPlaylistKindValue',
      'PLAYLISTS_SET_KIND_FAILED',
      'set-kind',
      ['p1', 'user'],
    ],
    [
      'playlists:set-description',
      'setPlaylistDescriptionText',
      'PLAYLISTS_SET_DESCRIPTION_FAILED',
      'set-description',
      ['p1', 'new description'],
    ],
    [
      'playlists:clear-cover',
      'setPlaylistCoverFilename',
      'PLAYLISTS_CLEAR_COVER_FAILED',
      'clear-cover',
      ['p1'],
    ],
  ])(
    '%s records an operational failure and rethrows a safe AppError',
    async (channel, overrideKey, code, operation, args) => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        [overrideKey]: vi.fn(() => {
          throw new Error('ENOENT: /Users/someone/playlists.json');
        }),
      });

      const error = await handlers
        .get(channel)(null, ...args)
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe(code);
      expect(payload.context.diagnosticRecorded).toBe(true);
      expect(String(payload.message)).not.toMatch(/Users/);
      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'playlists', operation }),
      );
    },
  );

  it('does not mutate tracks for a read-only album', async () => {
    const setPlaylistTrackIds = vi.fn();
    const handlers = register({
      loadPlaylistsList: vi.fn(() => [playlist({ kind: 'album' })]),
      setPlaylistTrackIds,
    });

    await expect(
      handlers.get('playlists:set-tracks')(null, 'p1', ['t1']),
    ).resolves.toEqual([expect.objectContaining({ kind: 'album' })]);
    expect(setPlaylistTrackIds).not.toHaveBeenCalled();
  });

  it('records a set-tracks failure for a mutable playlist', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = register({
      recordDiagnostic,
      loadPlaylistsList: vi.fn(() => [playlist({ kind: 'user' })]),
      setPlaylistTrackIds: vi.fn(() => {
        throw new Error('disk full');
      }),
    });

    const error = await handlers
      .get('playlists:set-tracks')(null, 'p1', ['t1'])
      .catch((err) => err);

    expect(parseAppError(error).code).toBe('PLAYLISTS_SET_TRACKS_FAILED');
  });

  it('enforces the provider-flow gate before upserting an album', async () => {
    const requireFeatureGate = vi.fn(() => {
      throw new Error('gate required');
    });
    const handlers = register({ requireFeatureGate });

    await expect(
      handlers.get('playlists:upsert-album')(null, {}),
    ).rejects.toThrow('gate required');
    expect(requireFeatureGate).toHaveBeenCalledWith('provider-flow');
  });

  it('records an upsert-album failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = register({
      recordDiagnostic,
      upsertAlbumPlaylist: vi.fn(() => {
        throw new Error('disk full');
      }),
    });

    const error = await handlers
      .get('playlists:upsert-album')(null, { name: 'Album' })
      .catch((err) => err);

    expect(parseAppError(error).code).toBe('PLAYLISTS_UPSERT_ALBUM_FAILED');
  });

  it('fetches and sets a remote cover for a newly upserted album', async () => {
    const writePlaylistCoverFromRemoteUrl = vi
      .fn()
      .mockResolvedValue('album-cover.jpg');
    const setPlaylistCoverFilename = vi.fn(() => [
      playlist({ kind: 'album', coverImage: 'album-cover.jpg' }),
    ]);
    const handlers = register({
      upsertAlbumPlaylist: vi.fn(() => [
        playlist({
          kind: 'album',
          source: { platform: 'youtube', id: 'yt1' },
        }),
      ]),
      writePlaylistCoverFromRemoteUrl,
      setPlaylistCoverFilename,
    });

    await handlers.get('playlists:upsert-album')(null, {
      source: { platform: 'youtube', id: 'yt1' },
      thumbnailUrl: 'https://example.test/thumb.jpg',
    });

    expect(writePlaylistCoverFromRemoteUrl).toHaveBeenCalledWith(
      'library-dir',
      'p1',
      'https://example.test/thumb.jpg',
    );
    expect(setPlaylistCoverFilename).toHaveBeenCalledWith(
      'library-dir',
      'p1',
      'album-cover.jpg',
    );
  });

  it('returns the playlist unchanged when choose-cover is cancelled', async () => {
    const writePlaylistCoverFromFile = vi.fn();
    const handlers = register({
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true }) },
      writePlaylistCoverFromFile,
    });

    await expect(
      handlers.get('playlists:choose-cover')(null, 'p1'),
    ).resolves.toEqual([expect.objectContaining({ id: 'p1' })]);
    expect(writePlaylistCoverFromFile).not.toHaveBeenCalled();
  });

  it('records a choose-cover write failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = register({
      recordDiagnostic,
      dialog: {
        showOpenDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePaths: ['cover.jpg'] }),
      },
      writePlaylistCoverFromFile: vi.fn(() => {
        throw new Error('disk full');
      }),
    });

    const error = await handlers
      .get('playlists:choose-cover')(null, 'p1')
      .catch((err) => err);

    expect(parseAppError(error).code).toBe('PLAYLISTS_CHOOSE_COVER_FAILED');
  });
});
