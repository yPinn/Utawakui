import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { registerPlaylistsHandlers } from './playlistsHandlers.js';
import { projectReleaseList } from '../lib/releases/runtime.js';

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
    deleteFolderPageObjectsForPage: vi.fn(),
    ...overrides,
  });
  return ipcMain.handlers;
}

describe('registerPlaylistsHandlers', () => {
  it.each([true, false])(
    'rejects an old cover picker after A→B→A (cancelled=%s)',
    async (canceled) => {
      let scope = { dir: 'library-dir', epoch: 1 };
      let finish;
      const writePlaylistCoverFromFile = vi.fn();
      const handlers = register({
        getReleaseScope: () => scope,
        dialog: {
          showOpenDialog: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
        writePlaylistCoverFromFile,
      });
      const pending = handlers.get('playlists:choose-cover')({}, 'p1');
      scope = { dir: 'other-library', epoch: 2 };
      scope = { dir: 'library-dir', epoch: 3 };
      finish({ canceled, filePaths: ['cover.jpg'] });
      const error = await pending.catch((error) => error);
      expect(parseAppError(error).code).toBe('PLAYLISTS_CHOOSE_COVER_FAILED');
      expect(writePlaylistCoverFromFile).not.toHaveBeenCalled();
    },
  );

  it('does not attach a remote cover after the captured release scope changes', async () => {
    let scope = { dir: 'library-dir', epoch: 1 };
    let finish;
    const setPlaylistCoverFilename = vi.fn();
    const onCollectionsChanged = vi.fn();
    const handlers = register({
      getReleaseScope: () => scope,
      onCollectionsChanged,
      upsertAlbumPlaylist: () => [
        playlist({ kind: 'album', source: { platform: 'youtube', id: 'yt1' } }),
      ],
      writePlaylistCoverFromRemoteUrl: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      setPlaylistCoverFilename,
    });
    const pending = handlers.get('playlists:upsert-album')(
      {},
      {
        source: { platform: 'youtube', id: 'yt1' },
        thumbnailUrl: 'https://example.test/cover.jpg',
      },
    );
    scope = { dir: 'library-dir', epoch: 3 };
    finish('cover.jpg');
    const error = await pending.catch((error) => error);
    expect(parseAppError(error).code).toBe('PLAYLISTS_UPSERT_ALBUM_FAILED');
    expect(setPlaylistCoverFilename).not.toHaveBeenCalled();
    expect(onCollectionsChanged).not.toHaveBeenCalled();
  });

  it('ignores forged provider release observations and does not notify no-op membership changes', async () => {
    const original = playlist({
      kind: 'album',
      source: { platform: 'youtube', id: 'yt1' },
      trackIds: ['song'],
    });
    const upsertAlbumPlaylist = vi.fn(() => [original]);
    const onCollectionsChanged = vi.fn();
    const handlers = register({
      upsertAlbumPlaylist,
      onCollectionsChanged,
      loadPlaylistsList: () => [original],
    });
    await handlers.get('playlists:upsert-album')(
      {},
      {
        name: 'Original',
        source: original.source,
        trackIds: original.trackIds,
        releaseObservations: { type: 'single' },
        releaseInfo: { overrides: { type: 'single' } },
      },
    );
    expect(upsertAlbumPlaylist).toHaveBeenCalledWith('library-dir', {
      name: 'Original',
      source: original.source,
      trackIds: ['song'],
    });
    expect(onCollectionsChanged).not.toHaveBeenCalled();
  });

  it('adds scalar release projections without exposing bindings or admitting unverified local members', async () => {
    const handlers = register({
      projectReleaseCollections: projectReleaseList,
      getReleaseScope: () => ({ dir: 'library-dir', epoch: 7 }),
      loadPlaylistsList: () => [
        {
          id: 'single',
          name: 'Single',
          kind: 'album',
          trackIds: ['song'],
          addedAt: {},
          releaseInfo: {
            revision: 2,
            observed: {},
            overrides: {
              type: 'single',
              date: { value: '2026', precision: 'year' },
            },
            localMemberBindings: {
              song: { kind: 'audio-content-sha256', value: 'a'.repeat(64) },
            },
          },
        },
      ],
    });
    const result = await handlers.get('playlists:list')();
    expect(result[0]).toMatchObject({
      releaseLibraryEpoch: 7,
      resolvedRelease: { type: 'single', revision: 2 },
      requiresMembershipVerification: true,
      availableTrackIds: [],
    });
    expect(JSON.stringify(result)).not.toContain('localMemberBindings');
    expect(JSON.stringify(result)).not.toContain('a'.repeat(64));
  });

  it('publishes changed collection identities after legacy membership operations', async () => {
    const onCollectionsChanged = vi.fn();
    const handlers = register({
      onCollectionsChanged,
      loadPlaylistsList: () => [
        { id: 'p1', name: 'One', kind: 'playlist', trackIds: ['old'] },
      ],
      setPlaylistTrackIds: () => [
        { id: 'p1', name: 'One', kind: 'playlist', trackIds: ['new'] },
      ],
    });
    await handlers.get('playlists:set-tracks')({}, 'p1', ['new']);
    expect(onCollectionsChanged).toHaveBeenCalledWith({
      collectionIds: ['p1'],
    });
  });

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

  it('keeps private media bindings out of every public playlist projection', async () => {
    const internal = playlist({
      kind: 'album',
      releaseInfo: {
        revision: 1,
        observed: {},
        overrides: { type: 'single' },
        localMemberBindings: {
          song: { kind: 'audio-content-sha256', value: 'a'.repeat(64) },
        },
      },
    });
    const handlers = register({ loadPlaylistsList: vi.fn(() => [internal]) });
    const result = await handlers.get('playlists:list')();
    expect(result[0].releaseInfo.localMemberBindings).toBeUndefined();
    expect(result[0].releaseInfo.overrides.type).toBe('single');
    expect(internal.releaseInfo.localMemberBindings.song.value).toBe(
      'a'.repeat(64),
    );
  });

  it('cascades page photos only after deleting the matching collection', async () => {
    const deleteFolderPageObjectsForPage = vi.fn();
    const handlers = register({
      loadPlaylistsList: vi.fn(() => [
        playlist({ kind: 'album', id: 'album-1' }),
      ]),
      deleteFolderPageObjectsForPage,
    });

    await handlers.get('playlists:delete')(null, 'album-1');

    expect(deleteFolderPageObjectsForPage).toHaveBeenCalledWith('library-dir', {
      kind: 'album',
      id: 'album-1',
    });
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

  it('does not open a picker for a deleted collection', async () => {
    const showOpenDialog = vi.fn();
    const handlers = register({ dialog: { showOpenDialog } });
    await expect(
      handlers.get('playlists:choose-cover')({}, 'deleted'),
    ).resolves.toHaveLength(1);
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it.each([null, 'cover.jpg'])(
    'handles a selected cover with writer result %s',
    async (filename) => {
      const setPlaylistCoverFilename = vi.fn(() => [
        playlist({ coverImage: filename }),
      ]);
      const handlers = register({
        getReleaseScope: () => ({ dir: 'library-dir', epoch: 1 }),
        dialog: {
          showOpenDialog: async () => ({
            canceled: false,
            filePaths: ['selected.jpg'],
          }),
        },
        writePlaylistCoverFromFile: () => filename,
        setPlaylistCoverFilename,
      });
      await expect(
        handlers.get('playlists:choose-cover')({}, 'p1'),
      ).resolves.toHaveLength(1);
      expect(setPlaylistCoverFilename).toHaveBeenCalledTimes(filename ? 1 : 0);
    },
  );

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
