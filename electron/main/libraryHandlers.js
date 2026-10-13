'use strict';

const {
  backfillTrackInfo,
  readTrackInfoMaintenanceFields,
} = require('../lib/downloader');
const {
  deleteTrack,
  deleteTrackArtworkFile,
  convertLocalAudioFiles,
  findTrackRecord,
  importLocalAudioFiles,
  listTracks,
  organizeTrackMetadataFromSidecars,
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
const { isArtistId } = require('../lib/artists/artistPhotos');
const { isCreditId } = require('../lib/artists/artistOrganization');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const { createAppError } = require('../lib/appError');
const { isMusicBrainzSourcePage } = require('../lib/musicbrainz/identifiers');
const { hasControlCharacters } = require('../lib/textGuards');

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
  convertAudioFiles = convertLocalAudioFiles,
  getPreparedLocalConversionFfmpegPath = getPreparedFfmpegPath,
  resolveUserDataDir = () => {
    throw new Error('local conversion user data resolver is not configured');
  },
  updateConfig = () => undefined,
  localImportReviewSessions = createLocalImportReviewSessionStore(),
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

  const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
  const invalidArtistIntent = () => ({
    status: 'error',
    reason: 'invalid-intent',
  });
  const runArtistOrganizationIntent = (operation, callback) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-organization',
          operation,
          code: `ARTIST_ORGANIZATION_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
        },
        publicError: {
          code: 'ARTIST_ORGANIZATION_FAILED',
          title: '藝人整理未完成',
          message: '目前無法儲存藝人整理，請再試一次。',
          context: { retryable: true },
        },
      },
      async () => {
        const result = await callback();
        if (result?.changed) {
          notifyLibraryUpdated({ allowProviderBackfill: false });
        }
        return result;
      },
    );

  ipcMain.handle('library:merge-artists', async (event, intent) => {
    if (
      !intent ||
      !Array.isArray(intent.artistIds) ||
      intent.artistIds.length !== 2 ||
      new Set(intent.artistIds).size !== 2 ||
      !intent.artistIds.every(isArtistId) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('merge', () =>
      artistIndexCache.mergeArtists(directory, tracks, intent.artistIds, {
        expectedRevision: intent.expectedRevision,
      }),
    );
  });

  ipcMain.handle('library:split-artist-credit', async (event, intent) => {
    if (
      !intent ||
      !isArtistId(intent.artistId) ||
      !isCreditId(intent.creditId) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('split', () =>
      artistIndexCache.splitArtistCredit(
        directory,
        tracks,
        intent.artistId,
        intent.creditId,
        { expectedRevision: intent.expectedRevision },
      ),
    );
  });

  ipcMain.handle('library:set-artist-display-name', async (event, intent) => {
    if (
      !intent ||
      !isArtistId(intent.artistId) ||
      typeof intent.displayName !== 'string' ||
      intent.displayName.length > 200 ||
      hasControlCharacters(intent.displayName) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('display-name', () =>
      artistIndexCache.setDisplayName(
        directory,
        tracks,
        intent.artistId,
        intent.displayName,
        { expectedRevision: intent.expectedRevision },
      ),
    );
  });

  ipcMain.handle('library:undo-artist-organization', async (event, intent) => {
    if (!intent || !validRevision(intent.expectedRevision)) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    return runArtistOrganizationIntent('undo', () =>
      artistIndexCache.undoOrganization(directory, {
        expectedRevision: intent.expectedRevision,
      }),
    );
  });

  const isArtistIdentityCandidateId = (value) =>
    typeof value === 'string' &&
    /^candidate_[A-Za-z0-9_-]{20,64}$/u.test(value);
  const runArtistIdentityLookup = (operation, callback) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-identity',
          operation,
          code: 'ARTIST_IDENTITY_LOOKUP_FAILED',
        },
        publicError: {
          code: 'ARTIST_IDENTITY_LOOKUP_FAILED',
          title: '無法查詢藝人資料',
          message: 'MusicBrainz 目前無法使用，仍可手動整理藝人。',
          context: { retryable: true },
        },
      },
      callback,
    );

  ipcMain.handle('library:auto-resolve-artist-identities', async () => {
    if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
      return { status: 'disabled' };
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    void runArtistIdentityLookup('automatic-reconciliation', () =>
      artistIdentityService.reconcile(directory, tracks, {
        onApplied: () => notifyLibraryUpdated({ allowProviderBackfill: false }),
      }),
    ).catch(() => {});
    return { status: 'started' };
  });

  ipcMain.handle(
    'library:search-artist-identity-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
        return { status: 'disabled' };
      }
      const directory = resolveDownloadDir(getConfig());
      const tracks = listLibraryTracks(directory);
      return runArtistIdentityLookup('search', () =>
        artistIdentityService.search(directory, tracks, artistId),
      );
    },
  );

  ipcMain.handle(
    'library:cancel-artist-identity-candidates',
    (event, artistId) =>
      isArtistId(artistId) ? artistIdentityService.cancel(artistId) : false,
  );

  ipcMain.handle(
    'library:apply-artist-identity-candidate',
    async (event, intent) => {
      if (
        !intent ||
        !isArtistId(intent.artistId) ||
        !isArtistIdentityCandidateId(intent.candidateId) ||
        !validRevision(intent.expectedRevision)
      ) {
        return invalidArtistIntent();
      }
      if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
        return { status: 'disabled' };
      }
      const directory = resolveDownloadDir(getConfig());
      const tracks = listLibraryTracks(directory);
      return runArtistOrganizationIntent('catalog', () =>
        artistIdentityService.apply(
          directory,
          tracks,
          intent.artistId,
          intent.candidateId,
          intent.expectedRevision,
        ),
      );
    },
  );

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
