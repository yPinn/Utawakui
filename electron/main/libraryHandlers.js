'use strict';

const {
  backfillTrackInfo,
  readTrackInfoMaintenanceFields,
} = require('../lib/downloader');
const {
  deleteTrack,
  deleteTrackArtworkFile,
  findTrackRecord,
  importLocalAudioFiles,
  listTracks,
  organizeTrackMetadataFromSidecars,
  runBackfillPass,
  updateTrackMetadata,
  writeTrackArtworkFile,
} = require('../lib/library');
const {
  enforceLibraryStoragePolicySafely,
} = require('./libraryStorageHandlers');
const { removeTrackFromAllPlaylists } = require('../lib/playlists');
const {
  createPerformanceSessionPlanStore,
} = require('../lib/performanceSessionPlan');
const { createBgmStandbyPlanStore } = require('../lib/bgmStandbyPlan');
const { isFeatureGateEnabled } = require('../lib/featureGates');
const {
  createArtworkDiscoveryService,
} = require('../lib/artwork/discoveryService');
const { createArtistIndexCache } = require('../lib/artists/artistIndex');
const {
  createArtistPhotoService,
} = require('../lib/artists/artistPhotoService');
const {
  createArtistPhotoCandidateService,
} = require('../lib/artists/artistPhotoCandidateService');
const { isArtistId } = require('../lib/artists/artistPhotos');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const { isMusicBrainzSourcePage } = require('../lib/musicbrainz/identifiers');

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

  try {
    const operation =
      options.lyricsAcquisitionService.scheduleAutomaticAcquisition(
        { ...result, id: videoId },
        trackDir,
        { onSaved: options.onLyricsSaved },
      );
    Promise.resolve(operation).catch(() => {});
  } catch {
    // Lyrics acquisition is optional; metadata/artwork backfill already worked.
  }
  return result;
}

function createProviderBackfillTrackInfo(
  getProviderRunner,
  lyricsAcquisitionService,
  onLyricsSaved,
) {
  return async (videoId, trackDir) =>
    backfillTrackInfoWithLyricsFallback(videoId, trackDir, {
      runner: await getProviderRunner(),
      lyricsAcquisitionService,
      onLyricsSaved,
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
  requireFeatureGate = () => {},
  openExternal = async () => {},
  getProviderRunner,
  runArtistPhotoWorker,
  lyricsAcquisitionService,
  listLibraryTracks = listTracks,
  runLibraryBackfill = runBackfillPass,
  organizeLibraryMetadata = organizeTrackMetadataFromSidecars,
  importAudioFiles = importLocalAudioFiles,
  findLibraryTrackRecord = findTrackRecord,
  deleteLibraryTrack = deleteTrack,
  removeTrackFromPlaylists = removeTrackFromAllPlaylists,
  unlinkTrackFromPerformanceSessionPlan = (directory, trackId) =>
    createPerformanceSessionPlanStore({ directory }).unlinkTrack(trackId),
  removeTrackFromBgmStandbyPlan = (directory, trackId) =>
    createBgmStandbyPlanStore({ directory }).removeTrackReference(trackId),
  updateLibraryTrackMetadata = updateTrackMetadata,
  writeLibraryTrackArtworkFile = writeTrackArtworkFile,
  deleteLibraryTrackArtworkFile = deleteTrackArtworkFile,
  artworkDiscoveryService,
  createArtworkService = createArtworkDiscoveryService,
  enqueueMusicAnalysis = () => false,
  enforceLibraryStoragePolicy = async () => undefined,
  artistIndexCache = createArtistIndexCache(),
  artistPhotoService = createArtistPhotoService({ artistIndexCache }),
  artistPhotoCandidateService = runArtistPhotoWorker
    ? createArtistPhotoCandidateService({
        artistIndexCache,
        runWorker: runArtistPhotoWorker,
      })
    : null,
  recordDiagnostic,
}) {
  const resolvedArtworkDiscoveryService =
    artworkDiscoveryService ??
    createArtworkService({
      onProviderFailure(failure) {
        try {
          recordDiagnostic?.({
            process: 'main',
            level: 'warning',
            source: 'artwork',
            operation: 'provider-search',
            code: 'ARTWORK_PROVIDER_UNAVAILABLE',
            message: 'Artwork provider search failed',
            context: {
              stage: failure.stage,
              reason: failure.reason,
              ...(Number.isInteger(failure.httpStatus)
                ? { httpStatus: failure.httpStatus }
                : {}),
              failureCount: failure.failureCount,
              retryable: true,
            },
          });
        } catch {
          // Diagnostics are fail-open and must not block artwork search.
        }
      },
    });
  const fetchBackfillTrackInfo = createProviderBackfillTrackInfo(
    getProviderRunner,
    lyricsAcquisitionService,
    () => notifyLibraryUpdated({ allowProviderBackfill: false }),
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
        .catch((error) => {
          // The renderer only keys off stage === 'error' to show a fixed
          // notice (useLyrics.js); the raw error text never renders, so it
          // must not cross IPC either — record it server-side instead, same
          // as every other operational failure boundary in this codebase.
          try {
            recordDiagnostic?.({
              process: 'main',
              level: 'error',
              source: 'library',
              operation: 'backfill',
              error,
            });
          } catch {
            // Diagnostics are fail-open and must not block the status push.
          }
          sendBackfillStatus({ stage: 'error', isRunning: false });
        });
    }
    return tracks;
  });

  // Derived, read-only artist grouping (ADR 0022); never triggers backfill.
  ipcMain.handle('library:get-artist-index', async () => {
    const dir = resolveDownloadDir(getConfig());
    return artistIndexCache.getIndex(dir, listLibraryTracks(dir));
  });

  // Automatic artist photo from the artist's official YouTube channel. A closed
  // provider gate is an expected state, not a diagnostic failure.
  ipcMain.handle('library:resolve-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
      return { status: 'disabled' };
    }
    const dir = resolveDownloadDir(getConfig());
    try {
      return await artistPhotoService.resolveFromChannel(
        dir,
        listLibraryTracks(dir),
        artistId,
        { getRunner: getProviderRunner },
      );
    } catch (error) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'warning',
          source: 'artist-photo',
          operation: 'resolve',
          code: 'ARTIST_PHOTO_RESOLVE_FAILED',
          error,
        });
      } catch {
        // Diagnostics are fail-open and must not block the artist page.
      }
      return { status: 'unavailable', reason: 'provider-unavailable' };
    }
  });

  const isCandidateId = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/u.test(value);
  const candidateGateOpen = () =>
    isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW);
  const runCandidateIntent = async (operation, callback) => {
    if (!artistPhotoCandidateService) {
      return { status: 'error', reason: 'provider-unavailable' };
    }
    try {
      return await callback();
    } catch (error) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'warning',
          source: 'artist-photo',
          operation,
          code: 'ARTIST_PHOTO_CANDIDATE_FAILED',
          error,
        });
      } catch {
        // Diagnostics are fail-open and never expose provider context to IPC.
      }
      return { status: 'error', reason: 'provider-unavailable' };
    }
  };

  ipcMain.handle(
    'library:search-artist-photo-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-search', () =>
        artistPhotoCandidateService.search(
          dir,
          () => listLibraryTracks(dir),
          artistId,
        ),
      );
    },
  );

  ipcMain.handle(
    'library:cancel-artist-photo-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-cancel', () =>
        artistPhotoCandidateService.cancel(artistId, dir),
      );
    },
  );

  ipcMain.handle(
    'library:load-artist-photo-candidate-preview',
    async (event, artistId, candidateId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isCandidateId(candidateId)) {
        return { status: 'error', reason: 'candidate-unavailable' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-preview', () =>
        artistPhotoCandidateService.loadPreview(dir, artistId, candidateId),
      );
    },
  );

  ipcMain.handle(
    'library:apply-artist-photo-candidate',
    async (event, artistId, candidateId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isCandidateId(candidateId)) {
        return { status: 'error', reason: 'candidate-unavailable' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      const result = await runCandidateIntent('candidate-apply', () =>
        artistPhotoCandidateService.apply(
          dir,
          () => listLibraryTracks(dir),
          artistId,
          candidateId,
        ),
      );
      if (result.status === 'ok' && result.changed) {
        notifyLibraryUpdated({ allowProviderBackfill: false });
      }
      return result;
    },
  );

  ipcMain.handle('library:choose-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const dir = resolveDownloadDir(getConfig());
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { status: 'cancelled' };
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-photo',
          operation: 'choose',
          code: 'ARTIST_PHOTO_CHOOSE_FAILED',
        },
        publicError: {
          code: 'ARTIST_PHOTO_CHOOSE_FAILED',
          title: '藝人照片無法更新',
          message: '這張圖片無法作為藝人照片，請換一張再試。',
          context: { retryable: true },
        },
      },
      () => artistPhotoService.chooseLocal(dir, artistId, result.filePaths[0]),
    );
  });

  ipcMain.handle('library:clear-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const dir = resolveDownloadDir(getConfig());
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-photo',
          operation: 'clear',
          code: 'ARTIST_PHOTO_CLEAR_FAILED',
        },
        publicError: {
          code: 'ARTIST_PHOTO_CLEAR_FAILED',
          title: '藝人照片無法移除',
          message: '目前無法移除這張藝人照片，請再試一次。',
          context: { retryable: true },
        },
      },
      () => artistPhotoService.clear(dir, artistId),
    );
  });

  // Manual, user-triggered offline maintenance. It re-projects saved provider
  // sidecars through the current normalization rules, preserves title/artist
  // values that no longer match the previous provider projection, fills only a
  // missing/invalid duration, and refreshes album/year. It never fetches or
  // rewrites info.json; network-bound artwork/sidecar repair stays above.
  ipcMain.handle('library:refresh-metadata', async () =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'refresh-metadata',
          code: 'LIBRARY_REFRESH_METADATA_FAILED',
        },
        publicError: {
          code: 'LIBRARY_REFRESH_METADATA_FAILED',
          title: '曲庫重新整理未完成',
          message: '曲庫重新整理未完成，請再試一次。',
          context: { retryable: true },
        },
      },
      () => {
        const dir = resolveDownloadDir(getConfig());
        const result = organizeLibraryMetadata(
          dir,
          readTrackInfoMaintenanceFields,
        );
        if (result.updated > 0) {
          notifyLibraryUpdated({ allowProviderBackfill: false });
        }
        return result;
      },
    ),
  );

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

    const imported = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'import-audio-files',
          code: 'LIBRARY_IMPORT_AUDIO_FAILED',
        },
        publicError: {
          code: 'LIBRARY_IMPORT_AUDIO_FAILED',
          title: '本機匯入未完成',
          message: '本機匯入未完成，請再試一次。',
          context: { retryable: true },
        },
      },
      () => importAudioFiles(resolveDownloadDir(getConfig()), result.filePaths),
    );
    if (imported.imported.length > 0) {
      notifyLibraryUpdated();
      await enforceLibraryStoragePolicySafely({
        enforceLibraryStoragePolicy,
        options: {
          protectedTrackIds: imported.imported.map((track) => track.id),
        },
        recordDiagnostic,
      });
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
    if (!findLibraryTrackRecord(dir, trackId)) return false;
    lyricsAcquisitionService.invalidateAutomaticAcquisition?.(trackId);
    const deleted = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'delete-track',
          code: 'LIBRARY_DELETE_TRACK_FAILED',
        },
        publicError: {
          code: 'LIBRARY_DELETE_TRACK_FAILED',
          title: '歌曲無法刪除',
          message: '這首歌曲無法刪除，請再試一次。',
          context: { retryable: true },
        },
      },
      () => {
        const result = deleteLibraryTrack(dir, trackId);
        if (result) {
          // Cascades into any playlist that referenced this track — a
          // playlist can otherwise end up pointing at a trackId that no
          // longer has a file, which is harmless (see setPlaylistTracks's
          // own comment) but pointless to leave behind when we already know
          // exactly which id just disappeared.
          removeTrackFromPlaylists(dir, trackId);
          // The current session draft is intentionally not a live playlist.
          // Keep its row and operator label, but remove the now-invalid media
          // link so the preparation workspace can surface it for repair.
          unlinkTrackFromPerformanceSessionPlan(dir, trackId);
          // BGM owns an independent track-id list rather than authored
          // labels, so a deleted local asset removes that reference outright.
          removeTrackFromBgmStandbyPlan(dir, trackId);
        }
        return result;
      },
    );
    if (deleted) notifyLibraryUpdated();
    return deleted;
  });

  ipcMain.handle(
    'library:update-track-metadata',
    async (event, trackId, fields) => {
      const dir = resolveDownloadDir(getConfig());
      const updated = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'library',
            operation: 'update-track-metadata',
            code: 'LIBRARY_UPDATE_METADATA_FAILED',
          },
          publicError: {
            code: 'LIBRARY_UPDATE_METADATA_FAILED',
            title: '歌曲資訊無法更新',
            message: '歌曲資訊無法更新，請再試一次。',
            context: { retryable: true },
          },
        },
        () => updateLibraryTrackMetadata(dir, trackId, fields),
      );
      if (updated) notifyLibraryUpdated();
      return updated;
    },
  );

  ipcMain.handle('library:choose-track-artwork', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = listLibraryTracks(dir).find(
      (candidate) => candidate.id === trackId,
    );
    if (!track) return null;

    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return track;

    const updated = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'choose-track-artwork',
          code: 'LIBRARY_CHOOSE_ARTWORK_FAILED',
        },
        publicError: {
          code: 'LIBRARY_CHOOSE_ARTWORK_FAILED',
          title: '封面無法更新',
          message: '這首歌曲的封面無法更新，請再試一次。',
          context: { retryable: true },
        },
      },
      () => {
        const filename = writeLibraryTrackArtworkFile(
          dir,
          trackId,
          result.filePaths[0],
        );
        return (
          filename &&
          listLibraryTracks(dir).find((candidate) => candidate.id === trackId)
        );
      },
    );
    if (updated) notifyLibraryUpdated();
    return updated || track;
  });

  ipcMain.handle('library:clear-track-artwork', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = listLibraryTracks(dir).find(
      (candidate) => candidate.id === trackId,
    );
    if (!track) return null;

    const deleted = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'clear-track-artwork',
          code: 'LIBRARY_CLEAR_ARTWORK_FAILED',
        },
        publicError: {
          code: 'LIBRARY_CLEAR_ARTWORK_FAILED',
          title: '封面無法移除',
          message: '這首歌曲的封面無法移除，請再試一次。',
          context: { retryable: true },
        },
      },
      () => deleteLibraryTrackArtworkFile(dir, trackId),
    );
    const updated = listLibraryTracks(dir).find(
      (candidate) => candidate.id === trackId,
    );
    if (deleted) notifyLibraryUpdated();
    return updated || track;
  });

  // One in-flight search per track; the renderer can abort it so a slow
  // provider never traps the editor.
  const artworkSearches = new Map();

  ipcMain.handle(
    'library:search-track-artwork',
    async (event, trackId, edits = {}) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };
      artworkSearches.get(trackId)?.abort();
      const controller = new AbortController();
      artworkSearches.set(trackId, controller);
      const result = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'search',
            code: 'ARTWORK_SEARCH_FAILED',
          },
          publicError: {
            code: 'ARTWORK_SEARCH_FAILED',
            title: '無法搜尋線上封面',
            message: '目前無法搜尋線上封面，請稍後再試。',
            context: { retryable: true },
          },
        },
        () =>
          resolvedArtworkDiscoveryService.search(track, edits, {
            signal: controller.signal,
          }),
      ).finally(() => {
        if (artworkSearches.get(trackId) === controller) {
          artworkSearches.delete(trackId);
        }
      });
      return controller.signal.aborted
        ? { status: 'error', reason: 'cancelled' }
        : result;
    },
  );

  ipcMain.handle('library:cancel-track-artwork-search', (event, trackId) => {
    const controller = artworkSearches.get(trackId);
    controller?.abort();
    return Boolean(controller);
  });

  ipcMain.handle(
    'library:load-track-artwork-preview',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'load-preview',
            code: 'ARTWORK_PREVIEW_FAILED',
          },
          publicError: {
            code: 'ARTWORK_PREVIEW_FAILED',
            title: '封面預覽無法載入',
            message: '封面預覽無法載入，請再試一次。',
            context: { retryable: true },
          },
        },
        () => resolvedArtworkDiscoveryService.loadPreview(trackId, candidateId),
      );
    },
  );

  ipcMain.handle(
    'library:apply-track-artwork',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };
      const result = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'apply',
            code: 'ARTWORK_APPLY_FAILED',
          },
          publicError: {
            code: 'ARTWORK_APPLY_FAILED',
            title: '封面無法更新',
            message: '線上封面未套用，請再試一次。',
            context: { retryable: true },
          },
        },
        () => resolvedArtworkDiscoveryService.apply(dir, trackId, candidateId),
      );
      if (result.status !== 'ok') return result;
      const updated = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      notifyLibraryUpdated();
      return { status: 'ok', track: updated || track };
    },
  );

  ipcMain.handle(
    'library:open-track-artwork-source',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return false;
      const sourcePage = resolvedArtworkDiscoveryService.sourcePage(
        trackId,
        candidateId,
      );
      if (!isMusicBrainzSourcePage(sourcePage)) return false;
      await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'open-source',
            code: 'ARTWORK_SOURCE_OPEN_FAILED',
          },
          publicError: {
            code: 'ARTWORK_SOURCE_OPEN_FAILED',
            title: '無法開啟 MusicBrainz',
            message: '目前無法開啟來源頁面，請稍後再試。',
          },
        },
        () => openExternal(sourcePage),
      );
      return true;
    },
  );
}

module.exports = {
  registerLibraryHandlers,
  backfillTrackInfoWithLyricsFallback,
  createProviderBackfillTrackInfo,
  isMusicBrainzSourcePage,
};
