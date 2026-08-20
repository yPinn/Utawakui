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
}) {
  // Every mutation resolves to the full playlist array so the renderer
  // can replace its state directly instead of a separate refetch.
  ipcMain.handle('playlists:list', async () => {
    return withCoverUrls(loadPlaylists(resolveDownloadDir(getConfig())));
  });

  ipcMain.handle('playlists:create', async (event, name) => {
    return withCoverUrls(createPlaylist(resolveDownloadDir(getConfig()), name));
  });

  ipcMain.handle('playlists:rename', async (event, id, name) => {
    return withCoverUrls(
      renamePlaylist(resolveDownloadDir(getConfig()), id, name),
    );
  });

  ipcMain.handle('playlists:delete', async (event, id) => {
    const dir = resolveDownloadDir(getConfig());
    deletePlaylistCoverDir(dir, id);
    return withCoverUrls(deletePlaylist(dir, id));
  });

  ipcMain.handle(
    'playlists:reorder',
    async (event, draggedId, targetId, position) => {
      return withCoverUrls(
        reorderPlaylists(
          resolveDownloadDir(getConfig()),
          draggedId,
          targetId,
          position,
        ),
      );
    },
  );

  // Album collections are read-only (see docs/spec.md and playlists.js's
  // PLAYLIST_KINDS comment) — this is the trust boundary that enforces it.
  // playlists.js itself stays a mechanical store with no opinion on renderer
  // intent, same trust-boundary role importHandlers.js's extractVideoId()
  // plays for untrusted video ids.
  ipcMain.handle('playlists:set-tracks', async (event, id, trackIds) => {
    const dir = resolveDownloadDir(getConfig());
    const playlists = loadPlaylists(dir);
    const target = playlists.find((p) => p.id === id);
    if (target?.kind === 'album') return withCoverUrls(playlists);
    return withCoverUrls(setPlaylistTracks(dir, id, trackIds));
  });

  ipcMain.handle('playlists:upsert-album', async (event, payload) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    const dir = resolveDownloadDir(getConfig());
    const playlists = upsertAlbum(dir, {
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
      const filename = await writePlaylistCoverFromUrl(
        dir,
        album.id,
        payload.thumbnailUrl,
      );
      if (filename) {
        return withCoverUrls(setPlaylistCover(dir, album.id, filename));
      }
    }

    return withCoverUrls(playlists);
  });

  ipcMain.handle('playlists:set-kind', async (event, id, kind) => {
    return withCoverUrls(
      setPlaylistKind(resolveDownloadDir(getConfig()), id, kind),
    );
  });

  ipcMain.handle(
    'playlists:set-description',
    async (event, id, description) => {
      return withCoverUrls(
        setPlaylistDescription(
          resolveDownloadDir(getConfig()),
          id,
          description,
        ),
      );
    },
  );

  // Native file picker — same pattern as config:choose-download-dir. The
  // dialog itself is the image picker; no in-app cropper/uploader UI.
  ipcMain.handle('playlists:choose-cover', async (event, id) => {
    const dir = resolveDownloadDir(getConfig());
    const playlists = loadPlaylists(dir);
    if (!playlists.some((p) => p.id === id)) return withCoverUrls(playlists);

    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return withCoverUrls(playlists);
    }

    const filename = writePlaylistCoverFile(dir, id, result.filePaths[0]);
    if (!filename) return withCoverUrls(playlists);
    return withCoverUrls(setPlaylistCover(dir, id, filename));
  });

  ipcMain.handle('playlists:clear-cover', async (event, id) => {
    const dir = resolveDownloadDir(getConfig());
    deletePlaylistCoverDir(dir, id);
    return withCoverUrls(setPlaylistCover(dir, id, null));
  });
}

module.exports = { registerPlaylistsHandlers };
