'use strict';

const {
  deletePlaylistCoverDir,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
} = require('../lib/library');
const {
  buildPlaylistCoverUrl,
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  reorderPlaylists,
  renamePlaylist,
  setPlaylistCover,
  setPlaylistDescription,
  setPlaylistKind,
  setPlaylistTracks,
  upsertAlbum,
} = require('../lib/playlists');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

// Every playlists:* IPC handler pipes its result through this before
// returning — coverImage is a bare filename in playlists.json (see
// playlists.js's sanitizePlaylist comment), and the full utawakui-media://
// URL is derived here at the IPC boundary rather than persisted, same rule
// listTracks() already follows for track thumbnails.
function withCoverUrls(playlists) {
  return playlists.map((playlist) =>
    playlist.coverImage
      ? {
          ...playlist,
          coverUrl: buildPlaylistCoverUrl(playlist.id, playlist.coverImage),
        }
      : playlist,
  );
}

function registerPlaylistsHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  requireFeatureGate,
  featureIds,
  recordDiagnostic,
  // Injectable overrides — this codebase's established seam for these
  // handler tests (see libraryHandlers.js's `findLibraryTrackRecord`)
  // rather than mocking electron/lib/library or electron/lib/playlists,
  // which do not reliably intercept through vi.mock when required
  // transitively (see tasks/lessons.md).
  loadPlaylistsList = loadPlaylists,
  createPlaylistRecord = createPlaylist,
  renamePlaylistRecord = renamePlaylist,
  deletePlaylistRecord = deletePlaylist,
  deletePlaylistCoverDirectory = deletePlaylistCoverDir,
  reorderPlaylistsList = reorderPlaylists,
  setPlaylistTrackIds = setPlaylistTracks,
  upsertAlbumPlaylist = upsertAlbum,
  writePlaylistCoverFromRemoteUrl = writePlaylistCoverFromUrl,
  setPlaylistCoverFilename = setPlaylistCover,
  setPlaylistKindValue = setPlaylistKind,
  setPlaylistDescriptionText = setPlaylistDescription,
  writePlaylistCoverFromFile = writePlaylistCoverFile,
}) {
  // Shared shape for every playlists:* diagnostic wrap below — keeps the
  // 11 handlers from repeating the same recordDiagnostic/publicError
  // boilerplate.
  function withBoundary(operation, code, title, message, work) {
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: { source: 'playlists', operation, code },
        publicError: {
          code,
          title,
          message,
          context: { retryable: true },
        },
      },
      work,
    );
  }

  // Every mutation resolves to the full playlist array so the renderer
  // can replace its state directly instead of a separate refetch.
  ipcMain.handle('playlists:list', async () =>
    withBoundary(
      'list',
      'PLAYLISTS_LIST_FAILED',
      '無法讀取歌單',
      '目前無法讀取歌單，請稍後再試。',
      () => withCoverUrls(loadPlaylistsList(resolveDownloadDir(getConfig()))),
    ),
  );

  ipcMain.handle('playlists:create', async (event, name) =>
    withBoundary(
      'create',
      'PLAYLISTS_CREATE_FAILED',
      '無法建立歌單',
      '目前無法建立歌單，請再試一次。',
      () =>
        withCoverUrls(
          createPlaylistRecord(resolveDownloadDir(getConfig()), name),
        ),
    ),
  );

  ipcMain.handle('playlists:rename', async (event, id, name) =>
    withBoundary(
      'rename',
      'PLAYLISTS_RENAME_FAILED',
      '歌單無法重新命名',
      '這個歌單無法重新命名，請再試一次。',
      () =>
        withCoverUrls(
          renamePlaylistRecord(resolveDownloadDir(getConfig()), id, name),
        ),
    ),
  );

  ipcMain.handle('playlists:delete', async (event, id) =>
    withBoundary(
      'delete',
      'PLAYLISTS_DELETE_FAILED',
      '歌單無法刪除',
      '這個歌單無法刪除，請再試一次。',
      () => {
        const dir = resolveDownloadDir(getConfig());
        deletePlaylistCoverDirectory(dir, id);
        return withCoverUrls(deletePlaylistRecord(dir, id));
      },
    ),
  );

  ipcMain.handle(
    'playlists:reorder',
    async (event, draggedId, targetId, position) =>
      withBoundary(
        'reorder',
        'PLAYLISTS_REORDER_FAILED',
        '歌單順序無法更新',
        '歌單順序無法更新，請再試一次。',
        () =>
          withCoverUrls(
            reorderPlaylistsList(
              resolveDownloadDir(getConfig()),
              draggedId,
              targetId,
              position,
            ),
          ),
      ),
  );

  // Album collections are read-only (see docs/spec.md and playlists.js's
  // PLAYLIST_KINDS comment) — this is the trust boundary that enforces it.
  // playlists.js itself stays a mechanical store with no opinion on renderer
  // intent, same trust-boundary role importHandlers.js's extractVideoId()
  // plays for untrusted video ids.
  ipcMain.handle('playlists:set-tracks', async (event, id, trackIds) =>
    withBoundary(
      'set-tracks',
      'PLAYLISTS_SET_TRACKS_FAILED',
      '歌單曲目無法更新',
      '這個歌單的曲目無法更新，請再試一次。',
      () => {
        const dir = resolveDownloadDir(getConfig());
        const playlists = loadPlaylistsList(dir);
        const target = playlists.find((p) => p.id === id);
        if (target?.kind === 'album') return withCoverUrls(playlists);
        return withCoverUrls(setPlaylistTrackIds(dir, id, trackIds));
      },
    ),
  );

  ipcMain.handle('playlists:upsert-album', async (event, payload) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return withBoundary(
      'upsert-album',
      'PLAYLISTS_UPSERT_ALBUM_FAILED',
      '專輯無法同步',
      '這張專輯目前無法同步，請再試一次。',
      async () => {
        const dir = resolveDownloadDir(getConfig());
        const playlists = upsertAlbumPlaylist(dir, {
          name: payload?.name,
          source: payload?.source,
          trackIds: payload?.trackIds,
        });

        const album = playlists.find(
          (p) =>
            p.kind === 'album' &&
            p.source?.platform === payload?.source?.platform &&
            p.source?.id === payload?.source?.id,
        );
        // Read-only, automatic album cover from the source's own artwork (see
        // fetchPlaylist's thumbnailUrl) — skipped once a cover is already
        // recorded so re-syncing an already-imported album doesn't re-fetch
        // its artwork on every retry.
        if (album && !album.coverImage && payload?.thumbnailUrl) {
          const filename = await writePlaylistCoverFromRemoteUrl(
            dir,
            album.id,
            payload.thumbnailUrl,
          );
          if (filename) {
            return withCoverUrls(
              setPlaylistCoverFilename(dir, album.id, filename),
            );
          }
        }

        return withCoverUrls(playlists);
      },
    );
  });

  ipcMain.handle('playlists:set-kind', async (event, id, kind) =>
    withBoundary(
      'set-kind',
      'PLAYLISTS_SET_KIND_FAILED',
      '歌單類型無法更新',
      '這個歌單的類型無法更新，請再試一次。',
      () =>
        withCoverUrls(
          setPlaylistKindValue(resolveDownloadDir(getConfig()), id, kind),
        ),
    ),
  );

  ipcMain.handle('playlists:set-description', async (event, id, description) =>
    withBoundary(
      'set-description',
      'PLAYLISTS_SET_DESCRIPTION_FAILED',
      '歌單說明無法更新',
      '這個歌單的說明無法更新，請再試一次。',
      () =>
        withCoverUrls(
          setPlaylistDescriptionText(
            resolveDownloadDir(getConfig()),
            id,
            description,
          ),
        ),
    ),
  );

  // Native file picker — same pattern as config:choose-download-dir. The
  // dialog itself is the image picker; no in-app cropper/uploader UI.
  ipcMain.handle('playlists:choose-cover', async (event, id) => {
    const dir = resolveDownloadDir(getConfig());
    const playlists = loadPlaylistsList(dir);
    if (!playlists.some((p) => p.id === id)) return withCoverUrls(playlists);

    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return withCoverUrls(playlists);
    }

    return withBoundary(
      'choose-cover',
      'PLAYLISTS_CHOOSE_COVER_FAILED',
      '封面無法更新',
      '這個歌單的封面無法更新，請再試一次。',
      () => {
        const filename = writePlaylistCoverFromFile(
          dir,
          id,
          result.filePaths[0],
        );
        if (!filename) return withCoverUrls(playlists);
        return withCoverUrls(setPlaylistCoverFilename(dir, id, filename));
      },
    );
  });

  ipcMain.handle('playlists:clear-cover', async (event, id) =>
    withBoundary(
      'clear-cover',
      'PLAYLISTS_CLEAR_COVER_FAILED',
      '封面無法移除',
      '這個歌單的封面無法移除，請再試一次。',
      () => {
        const dir = resolveDownloadDir(getConfig());
        deletePlaylistCoverDirectory(dir, id);
        return withCoverUrls(setPlaylistCoverFilename(dir, id, null));
      },
    ),
  );
}

module.exports = { registerPlaylistsHandlers };
