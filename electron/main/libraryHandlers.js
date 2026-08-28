'use strict';

const {
  backfillTrackInfo,
  readTrackInfoMaintenanceFields,
} = require('../lib/downloader');
const {
  deleteTrack,
  deleteTrackArtworkFile,
  importLocalAudioFiles,
  listTracks,
  organizeTrackMetadataFromSidecars,
  runBackfillPass,
  updateTrackMetadata,
  writeTrackArtworkFile,
} = require('../lib/library');
const { removeTrackFromAllPlaylists } = require('../lib/playlists');
const { isFeatureGateEnabled } = require('../lib/featureGates');

async function backfillTrackInfoWithLyricsFallback(
  videoId,
  trackDir,
  options = {},
) {
  const fetchTrackInfo = options.backfillTrackInfo || backfillTrackInfo;
  const result = await fetchTrackInfo(videoId, trackDir, {
    runner: options.runner,
  });
  if (!result) return null;

  let saved = false;
  try {
    saved = await options.lyricsAcquisitionService.saveIfAbsent(
      result,
      trackDir,
    );
  } catch {
    // Lyrics fallback is optional; metadata/artwork backfill already worked.
  }
  return saved ? { ...result, assetsUpdated: true } : result;
}

function createProviderBackfillTrackInfo(
  getProviderRunner,
  lyricsAcquisitionService,
) {
  return async (videoId, trackDir) =>
    backfillTrackInfoWithLyricsFallback(videoId, trackDir, {
      runner: await getProviderRunner(),
      lyricsAcquisitionService,
    });
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
  getProviderRunner,
  lyricsAcquisitionService,
  listLibraryTracks = listTracks,
  runLibraryBackfill = runBackfillPass,
  organizeLibraryMetadata = organizeTrackMetadataFromSidecars,
  importAudioFiles = importLocalAudioFiles,
  enqueueMusicAnalysis = () => false,
}) {
  const fetchBackfillTrackInfo = createProviderBackfillTrackInfo(
    getProviderRunner,
    lyricsAcquisitionService,
  );

  ipcMain.handle('library:list', async (event, options = {}) => {
    const dir = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(dir);
    // Fire-and-forget — don't make the renderer wait on a network-bound
    // metadata pass just to see the tracks it already has.
    if (
      options?.allowProviderBackfill !== false &&
      isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)
    ) {
      runLibraryBackfill(
        dir,
        tracks,
        fetchBackfillTrackInfo,
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

  // Manual, user-triggered offline maintenance. It re-projects saved provider
  // sidecars through the current normalization rules, preserves title/artist
  // values that no longer match the previous provider projection, fills only a
  // missing/invalid duration, and refreshes album/year. It never fetches or
  // rewrites info.json; network-bound artwork/sidecar repair stays above.
  ipcMain.handle('library:refresh-metadata', async () => {
    const dir = resolveDownloadDir(getConfig());
    const result = organizeLibraryMetadata(dir, readTrackInfoMaintenanceFields);
    if (result.updated > 0) {
      notifyLibraryUpdated({ allowProviderBackfill: false });
    }
    return result;
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

    const imported = importAudioFiles(
      resolveDownloadDir(getConfig()),
      result.filePaths,
    );
    if (imported.imported.length > 0) {
      notifyLibraryUpdated();
      for (const track of imported.imported) {
        try {
          enqueueMusicAnalysis(track.id);
        } catch {
          // Analysis is optional background work. Imported audio remains
          // available even if queue admission fails unexpectedly.
        }
      }
    }
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
  createProviderBackfillTrackInfo,
};
