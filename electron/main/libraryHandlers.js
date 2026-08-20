'use strict';

const {
  backfillTrackInfo,
  readTrackInfoMetadata,
} = require('../lib/downloader');
const {
  deleteTrack,
  deleteTrackArtworkFile,
  importLocalAudioFiles,
  listTracks,
  refreshTrackMetadataFromSidecars,
  runBackfillPass,
  updateTrackMetadata,
  writeTrackArtworkFile,
} = require('../lib/library');
const { removeTrackFromAllPlaylists } = require('../lib/playlists');
const { isFeatureGateEnabled } = require('../lib/featureGates');
const { saveLrclibLyricsIfAbsent } = require('./lyricsHandlers');

async function backfillTrackInfoWithLyricsFallback(videoId, trackDir) {
  const result = await backfillTrackInfo(videoId, trackDir);
  if (!result) return null;

  let saved = false;
  try {
    saved = await saveLrclibLyricsIfAbsent(result, trackDir);
  } catch {
    // Lyrics fallback is optional; metadata/artwork backfill already worked.
  }
  return saved ? { ...result, assetsUpdated: true } : result;
}

function registerLibraryHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  sendBackfillStatus,
  featureIds,
}) {
  ipcMain.handle('library:list', async () => {
    const dir = resolveDownloadDir(getConfig());
    const tracks = listTracks(dir);
    // Fire-and-forget — don't make the renderer wait on a network-bound
    // metadata pass just to see the tracks it already has.
    if (isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
      runBackfillPass(
        dir,
        tracks,
        backfillTrackInfoWithLyricsFallback,
        sendBackfillStatus,
      )
        .then((updated) => {
          if (updated) notifyLibraryUpdated();
        })
        .catch((err) => {
          sendBackfillStatus({
            stage: 'error',
            isRunning: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
    return tracks;
  });

  // Manual, user-triggered counterpart to the automatic startup backfill
  // above — that pass deliberately skips album/releaseYear to avoid
  // retrying tracks with no such metadata on every launch forever (see
  // tracks.js's refreshTrackMetadataFromSidecars comment). This reads only
  // sidecars already on disk (no network) and can be re-run any time, e.g.
  // after a yt:download-audio build that didn't yet persist those fields.
  ipcMain.handle('library:refresh-metadata', async () => {
    const dir = resolveDownloadDir(getConfig());
    const updated = refreshTrackMetadataFromSidecars(
      dir,
      readTrackInfoMetadata,
    );
    if (updated > 0) notifyLibraryUpdated();
    return { updated };
  });

  ipcMain.handle('library:import-audio-files', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音訊檔',
          extensions: ['webm', 'm4a', 'opus', 'mp3', 'wav', 'flac'],
        },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: [], skipped: [] };
    }

    const imported = importLocalAudioFiles(
      resolveDownloadDir(getConfig()),
      result.filePaths,
    );
    if (imported.imported.length > 0) notifyLibraryUpdated();
    return imported;
  });

  ipcMain.handle('library:delete-track', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const deleted = deleteTrack(dir, trackId);
    if (deleted) {
      // Cascades into any playlist that referenced this track — a
      // playlist can otherwise end up pointing at a trackId that no
      // longer has a file, which is harmless (see setPlaylistTracks's
      // own comment) but pointless to leave behind when we already know
      // exactly which id just disappeared.
      removeTrackFromAllPlaylists(dir, trackId);
      notifyLibraryUpdated();
    }
    return deleted;
  });

  ipcMain.handle(
    'library:update-track-metadata',
    async (event, trackId, fields) => {
      const dir = resolveDownloadDir(getConfig());
      const updated = updateTrackMetadata(dir, trackId, fields);
      if (updated) notifyLibraryUpdated();
      return updated;
    },
  );

  ipcMain.handle('library:choose-track-artwork', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = listTracks(dir).find((candidate) => candidate.id === trackId);
    if (!track || track.sourceType !== 'local-file') return track ?? null;

    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return track;

    const filename = writeTrackArtworkFile(dir, trackId, result.filePaths[0]);
    const updated =
      filename && listTracks(dir).find((candidate) => candidate.id === trackId);
    if (updated) notifyLibraryUpdated();
    return updated || track;
  });

  ipcMain.handle('library:clear-track-artwork', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = listTracks(dir).find((candidate) => candidate.id === trackId);
    if (!track || track.sourceType !== 'local-file') return track ?? null;

    const deleted = deleteTrackArtworkFile(dir, trackId);
    const updated = listTracks(dir).find(
      (candidate) => candidate.id === trackId,
    );
    if (deleted) notifyLibraryUpdated();
    return updated || track;
  });
}

module.exports = {
  registerLibraryHandlers,
  backfillTrackInfoWithLyricsFallback,
};
