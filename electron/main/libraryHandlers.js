'use strict';

const {
  backfillTrackInfo,
  readTrackInfoMaintenanceFields,
} = require('../lib/downloader');
const {
  captureTrackArtworkSnapshot,
  deleteTrack,
  deleteTrackArtworkFile,
  convertLocalAudioFiles,
  findTrack,
  findTrackRecord,
  importLocalAudioFiles,
  listTracks,
  organizeTrackMetadataFromSidecars,
  readLocalArtworkDraft: readLocalArtworkDraftFile,
  restoreTrackArtworkSnapshot,
  runBackfillPass,
  updateTrackMetadata,
  writeTrackArtworkFile,
} = require('../lib/library');
const { getPreparedFfmpegPath } = require('../lib/featureDependencies');
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
const { AUDIO_PICKER_EXTENSIONS } = require('../lib/library/constants');
const {
  createLocalImportReviewSessionStore,
} = require('../lib/library/localImportReviewSessions');
const { createArtistIndexCache } = require('../lib/artists/artistIndex');
const {
  createArtistPhotoService,
} = require('../lib/artists/artistPhotoService');
const {
  createArtistPhotoCandidateService,
} = require('../lib/artists/artistPhotoCandidateService');
const {
  createArtistIdentityService,
} = require('../lib/artists/artistIdentityService');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const { createLibraryTrackSnapshot } = require('./libraryTrackSnapshot');
const { createAppError } = require('../lib/appError');
const { isMusicBrainzSourcePage } = require('../lib/musicbrainz/identifiers');
const {
  registerLibraryArtistOrganizationHandlers,
} = require('./library/artistOrganizationHandlers');
const {
  registerLibraryArtistPhotoHandlers,
} = require('./library/artistPhotoHandlers');
const {
  registerLibraryTrackArtworkHandlers,
} = require('./library/trackArtworkHandlers');

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
  trackSnapshot = createLibraryTrackSnapshot({ listLibraryTracks }),
  runLibraryBackfill = runBackfillPass,
  organizeLibraryMetadata = organizeTrackMetadataFromSidecars,
  importAudioFiles = importLocalAudioFiles,
  createLibraryImportAdmission = () => undefined,
  workOrganizationRuntime = null,
  convertAudioFiles = convertLocalAudioFiles,
  getPreparedLocalConversionFfmpegPath = getPreparedFfmpegPath,
  resolveUserDataDir = () => {
    throw new Error('local conversion user data resolver is not configured');
  },
  updateConfig = () => undefined,
  localImportReviewSessions = createLocalImportReviewSessionStore(),
  findLibraryTrackRecord = findTrackRecord,
  findLibraryTrack = findTrack,
  deleteLibraryTrack = deleteTrack,
  removeTrackFromPlaylists = removeTrackFromAllPlaylists,
  unlinkTrackFromPerformanceSessionPlan = (directory, trackId) =>
    createPerformanceSessionPlanStore({ directory }).unlinkTrack(trackId),
  removeTrackFromBgmStandbyPlan = (directory, trackId) =>
    createBgmStandbyPlanStore({ directory }).removeTrackReference(trackId),
  updateLibraryTrackMetadata = updateTrackMetadata,
  captureLibraryTrackArtworkSnapshot = captureTrackArtworkSnapshot,
  restoreLibraryTrackArtworkSnapshot = restoreTrackArtworkSnapshot,
  readLocalArtworkDraft = readLocalArtworkDraftFile,
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
  artistIdentityService = createArtistIdentityService({ artistIndexCache }),
  recordDiagnostic,
}) {
  function recordLocalImportFailure(failure, operation) {
    try {
      recordDiagnostic?.({
        process: 'main',
        level: 'warning',
        source: 'library',
        operation,
        code: 'LIBRARY_IMPORT_AUDIO_FILE_SKIPPED',
        message: 'Local audio import skipped a file',
        error: failure.error,
        context: { reason: failure.reason },
      });
    } catch {
      // Per-file diagnostics are fail-open; the bounded result still tells
      // the renderer how the batch completed.
    }
  }

  async function finalizeLocalImport(importResult) {
    if (importResult.imported.length === 0) return;
    notifyLibraryUpdated();
    await enforceLibraryStoragePolicySafely({
      enforceLibraryStoragePolicy,
      options: {
        protectedTrackIds: importResult.imported.map((track) => track.id),
      },
      recordDiagnostic,
    });
    for (const track of importResult.imported) {
      try {
        enqueueMusicAnalysis(track.id);
      } catch {
        // Analysis is optional background work. Imported audio remains
        // available even if queue admission fails unexpectedly.
      }
    }
  }

  const fetchBackfillTrackInfo = createProviderBackfillTrackInfo(
    getProviderRunner,
    lyricsAcquisitionService,
    () => notifyLibraryUpdated({ allowProviderBackfill: false }),
  );
  const organizedLibraryDirectories = new Set();

  function organizeLibraryMetadataAutomatically(directory) {
    if (organizedLibraryDirectories.has(directory)) return;
    organizedLibraryDirectories.add(directory);
    try {
      organizeLibraryMetadata(directory, readTrackInfoMaintenanceFields);
    } catch (error) {
      // This local maintenance is opportunistic: a damaged sidecar or index
      // must not make playable files disappear from the library. Keep the
      // failure bounded to one diagnostic per directory／session; the next app
      // session retries automatically. Private details stay in main only.
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'error',
          source: 'library',
          operation: 'automatic-metadata-organization',
          code: 'LIBRARY_METADATA_AUTO_ORGANIZATION_FAILED',
          error,
          context: { retryable: true },
        });
      } catch {
        // Diagnostics are fail-open and must not block the library listing.
      }
    }
  }

  ipcMain.handle('library:list', async (event, options = {}) => {
    const dir = resolveDownloadDir(getConfig());
    organizeLibraryMetadataAutomatically(dir);
    const tracks = trackSnapshot.listFresh(dir);
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

  // Reads one track folder, so playback can follow library changes without
  // a second full-library scan beside useLibrary's own refresh.
  ipcMain.handle('library:get-track', async (event, trackId) =>
    findLibraryTrack(resolveDownloadDir(getConfig()), trackId),
  );

  ipcMain.handle('library:import-audio-files', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音訊檔',
          extensions: AUDIO_PICKER_EXTENSIONS,
        },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: [], skipped: [] };
    }

    const conversionCandidates = [];
    const runImport = createLibraryImportAdmission();
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
      () =>
        importAudioFiles(resolveDownloadDir(getConfig()), result.filePaths, {
          ...(runImport ? { runImport } : {}),
          onFailure: (failure) =>
            recordLocalImportFailure(failure, 'import-audio-file'),
          onConversionCandidate: (candidate) =>
            conversionCandidates.push(candidate),
        }),
    );
    await finalizeLocalImport(imported);

    const { conversionRequired, ...publicResult } = imported;
    if (
      conversionCandidates.length > 0 &&
      Array.isArray(conversionRequired) &&
      conversionRequired.length === conversionCandidates.length
    ) {
      const sessionId = localImportReviewSessions.create(conversionCandidates);
      if (sessionId) {
        publicResult.conversionReview = {
          sessionId,
          files: conversionRequired,
        };
      }
    }
    return publicResult;
  });

  ipcMain.handle(
    'library:convert-local-audio-files',
    async (event, sessionId) => {
      requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
      if (!localImportReviewSessions.has(sessionId)) {
        throw createAppError({
          code: 'LOCAL_IMPORT_REVIEW_EXPIRED',
          severity: 'warning',
          title: '需要重新選擇檔案',
          message: '這次轉檔確認已失效，請重新選擇檔案。',
          context: { retryable: true },
        });
      }

      const config = getConfig();
      const runImport = createLibraryImportAdmission();
      const ffmpegPath = getPreparedLocalConversionFfmpegPath(
        resolveUserDataDir(),
        config.systemFfmpegPath,
        {
          onStaleSystemPath: () => updateConfig({ systemFfmpegPath: null }),
        },
      );
      const candidates = localImportReviewSessions.consume(sessionId);
      if (!candidates) {
        throw createAppError({
          code: 'LOCAL_IMPORT_REVIEW_EXPIRED',
          severity: 'warning',
          title: '需要重新選擇檔案',
          message: '這次轉檔確認已失效，請重新選擇檔案。',
          context: { retryable: true },
        });
      }

      const converted = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'library',
            operation: 'convert-local-audio-files',
            code: 'LIBRARY_CONVERT_AUDIO_FAILED',
          },
          publicError: {
            code: 'LIBRARY_CONVERT_AUDIO_FAILED',
            title: '相容轉檔未完成',
            message: '音訊轉檔未完成，請重新選擇檔案後再試一次。',
            context: { retryable: true },
          },
        },
        () =>
          convertAudioFiles(resolveDownloadDir(config), candidates, {
            ...(runImport ? { runImport } : {}),
            ffmpegPath,
            onFailure: (failure) =>
              recordLocalImportFailure(failure, 'convert-local-audio-file'),
          }),
      );
      await finalizeLocalImport(converted);
      return converted;
    },
  );

  ipcMain.handle('library:delete-track', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    if (!workOrganizationRuntime && !findLibraryTrackRecord(dir, trackId))
      return false;
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
        if (workOrganizationRuntime)
          return workOrganizationRuntime.deleteTrack({ trackId });
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

  const libraryDependencies = {
    ipcMain,
    getConfig,
    resolveDownloadDir,
    listLibraryTracks,
    notifyLibraryUpdated,
    featureIds,
    recordDiagnostic,
  };
  registerLibraryArtistOrganizationHandlers({
    ...libraryDependencies,
    listRecentLibraryTracks: trackSnapshot.listRecent,
    artistIndexCache,
    artistIdentityService,
  });
  registerLibraryArtistPhotoHandlers({
    ...libraryDependencies,
    dialog,
    getMainWindow,
    getProviderRunner,
    artistPhotoService,
    artistPhotoCandidateService,
  });
  registerLibraryTrackArtworkHandlers({
    ...libraryDependencies,
    findLibraryTrack,
    dialog,
    getMainWindow,
    requireFeatureGate,
    openExternal,
    readLocalArtworkDraft,
    captureLibraryTrackArtworkSnapshot,
    restoreLibraryTrackArtworkSnapshot,
    writeLibraryTrackArtworkFile,
    deleteLibraryTrackArtworkFile,
    updateLibraryTrackMetadata,
    artworkDiscoveryService,
    createArtworkService,
  });
}

module.exports = {
  registerLibraryHandlers,
  backfillTrackInfoWithLyricsFallback,
  createProviderBackfillTrackInfo,
  isMusicBrainzSourcePage,
};
