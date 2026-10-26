'use strict';

const {
  downloadAudio,
  fetchMetadata,
  fetchPlaylist,
} = require('../lib/downloader');
const { searchPlaybackCandidates } = require('../lib/playbackSearch');
const {
  classifyImportInput,
  parseImportSourceUrl,
} = require('../lib/importInput');
const { downloadErrorText } = require('../lib/youtubeAttempts');
const {
  classifyDownloadFailure,
  toClassifiedDownloadError,
} = require('../lib/downloadFailure');
const { APP_ERROR_PREFIX, createAppError } = require('../lib/appError');
const {
  createProviderDownloadScheduler,
} = require('../lib/providerDownloadScheduler');
const {
  registerReleaseDownloadBatchHandlers,
} = require('./releaseDownloadBatches');
const {
  extractVideoId,
  extractPlaylistId,
  classifyPlaylistKind,
} = require('../lib/youtube');
const {
  resolveYoutubeImportSource,
  resolveYoutubeSearchQuery,
} = require('../lib/importResolver');
const { listTracks, resolveTrackDir } = require('../lib/library');
const {
  saveProviderIndexEntry: saveAcquiredIndexEntry,
} = require('../lib/library/metadataIndex');
const {
  enforceLibraryStoragePolicySafely,
} = require('./libraryStorageHandlers');

// error.stderr does not survive ipcMain.handle serialization, so classification
// happens here. Only the sentinel code crosses the boundary; the raw text may
// contain local paths, so it is logged here and never forwarded (same as
// vocalSeparation.js).
//
// Intentionally bypasses runDiagnosticIpcOperation/createAppError: the
// DOWNLOAD_FAILURE_PREFIX sentinel is a cross-runtime contract
// (shared/downloadFailureValues.json) the renderer parses for its
// age/region/members-only UI, and a generic AppError would break it. Diagnostics
// are still recorded via recordSearchDiagnostic. See
// docs/operations/diagnostics-rollout.md (Batch 6).
async function classifyingFailures(run, { recordDiagnostic } = {}) {
  try {
    return await run();
  } catch (err) {
    if (err?.code === 'IMPORT_DOWNLOAD_CANCELLED')
      throw createAppError({
        code: 'IMPORT_DOWNLOAD_CANCELLED',
        severity: 'info',
        title: '匯入已停止',
        message: '這首曲目已停止下載。',
      });
    if (
      typeof err?.publicMessage === 'string' &&
      String(err?.message || '').startsWith(APP_ERROR_PREFIX)
    ) {
      throw err;
    }
    console.error('[yt] request failed:', downloadErrorText(err));
    const reason = classifyDownloadFailure(err);
    recordSearchDiagnostic(recordDiagnostic, {
      process: 'main',
      level: 'error',
      source: 'import',
      operation: 'download',
      code: 'DOWNLOAD_FAILED',
      message: 'yt-dlp request failed',
      context: { reason },
    });
    throw toClassifiedDownloadError(err);
  }
}

function boundedSearchDiagnostics(value = {}) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const boundedCount = (count) =>
    Number.isSafeInteger(count) && count >= 0 && count <= 100 ? count : 0;
  return {
    stage:
      source.stage === 'cross'
        ? 'cross'
        : source.stage === 'complete'
          ? 'complete'
          : 'initial',
    status: ['failed', 'partial', 'empty'].includes(source.status)
      ? source.status
      : 'failed',
    inputCount: boundedCount(source.inputCount),
    successCount: boundedCount(source.successCount),
    failureCount: boundedCount(source.failureCount),
    candidateCount: boundedCount(source.candidateCount),
  };
}

function recordSearchDiagnostic(recordDiagnostic, event) {
  if (typeof recordDiagnostic !== 'function') return false;
  try {
    return recordDiagnostic(event)?.ok === true;
  } catch {
    return false;
  }
}

async function classifyingProviderSearchFailures(run, { recordDiagnostic }) {
  try {
    return await run();
  } catch (error) {
    const reason = classifyDownloadFailure(error);
    const retryable = reason !== 'invalid-input';
    const searchDiagnostics = boundedSearchDiagnostics(
      error?.searchDiagnostics,
    );
    console.error('[provider] search failed:', downloadErrorText(error));
    const diagnosticRecorded = recordSearchDiagnostic(recordDiagnostic, {
      process: 'main',
      level: 'error',
      source: 'import',
      operation: 'provider-search',
      code: 'PROVIDER_SEARCH_FAILED',
      message: 'YT Music／YouTube provider search failed',
      context: {
        ...searchDiagnostics,
        reason,
        retryable,
      },
    });
    throw createAppError({
      code: 'PROVIDER_SEARCH_FAILED',
      severity: 'error',
      title: 'YT Music／YouTube 搜尋未完成',
      message: '目前無法完成 YT Music／YouTube 搜尋，請稍後再試。',
      context: {
        reason,
        retryable,
        ...(diagnosticRecorded ? { diagnosticRecorded: true } : {}),
      },
    });
  }
}

function scheduleOptionalLyricsAfterImport(
  track,
  trackDir,
  lyricsAcquisitionService,
  onSaved,
) {
  try {
    const operation = lyricsAcquisitionService.scheduleAutomaticAcquisition(
      track,
      trackDir,
      { onSaved },
    );
    Promise.resolve(operation).catch(() => {});
    return true;
  } catch {
    // The audio download succeeded. Optional background work cannot turn
    // scheduling failure into a failed import.
    return false;
  }
}

function buildProviderIndexEntry(
  result,
  importedAt = new Date().toISOString(),
) {
  return {
    title: result.title,
    titleOrigin: 'provider',
    artist: result.artist,
    artistOrigin: 'provider',
    duration: result.duration,
    album: result.album,
    releaseYear: result.releaseYear,
    importedAt,
  };
}

function createSerialTaskLane() {
  let tail = Promise.resolve();
  return function runSerialTask(task) {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}

function registerImportHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  requireFeatureGate,
  featureIds,
  getProviderRunner,
  lyricsAcquisitionService,
  notifyLibraryUpdated = () => {},
  enqueueMusicAnalysis = () => false,
  enforceLibraryStoragePolicy = async () => undefined,
  downloadTrackAudio = downloadAudio,
  createLibraryImportAdmission = () => undefined,
  getReleaseScope = () => null,
  prepareReleaseDownload = null,
  validateReleaseDownload = null,
  attachReleaseDownload = null,
  getReleaseDownloadPlan = null,
  hasReleaseDownloadAudio = null,
  enqueueReleaseCatalog = () => {},
  fetchPlaylistMetadata = fetchPlaylist,
  fetchYoutubeMetadata = fetchMetadata,
  searchYoutubeCandidates = searchPlaybackCandidates,
  readClipboardText = () => '',
  getMainWindow = () => null,
  listLibraryTracks = listTracks,
  providerDownloadScheduler = createProviderDownloadScheduler(),
  saveProviderIndexEntry = saveAcquiredIndexEntry,
  recordDiagnostic,
}) {
  const providerDownloadTasks = new Map();
  const runLibraryFinalize = createSerialTaskLane();

  // Local suggestion only: no provider/runtime/network operation. Never return
  // arbitrary clipboard text or tracking parameters to the renderer.
  ipcMain.handle('import:clipboard-suggestion', async (event) => {
    const window = getMainWindow();
    if (
      !window?.isFocused() ||
      event?.sender !== window.webContents ||
      event?.senderFrame !== window.webContents.mainFrame
    )
      return '';
    try {
      const value = await readClipboardText();
      return parseImportSourceUrl(value)?.input || '';
    } catch {
      return '';
    }
  });

  function onSearchDiagnostics(summary) {
    const context = boundedSearchDiagnostics(summary);
    if (context.status === 'failed') return;
    const empty = context.status === 'empty';
    recordSearchDiagnostic(recordDiagnostic, {
      process: 'main',
      level: empty ? 'info' : 'warning',
      source: 'import',
      operation: 'provider-search',
      code: empty ? 'PROVIDER_SEARCH_EMPTY' : 'PROVIDER_SEARCH_PARTIAL',
      message: empty
        ? 'YouTube provider search returned no usable candidates'
        : 'YouTube provider search partially failed',
      context,
    });
  }

  function existingProviderIds() {
    const dir = resolveDownloadDir(getConfig());
    return {
      dir,
      existingIds: new Set(listLibraryTracks(dir).map((track) => track.id)),
    };
  }

  async function resolveSingleSource(input, runner, existingIds) {
    return resolveYoutubeImportSource(input, {
      extractVideoId,
      fetchMetadata: (videoId) => fetchYoutubeMetadata(videoId, { runner }),
      searchPlaybackCandidates: (canonical, sourceMetadata, options = {}) =>
        searchYoutubeCandidates(canonical, sourceMetadata, {
          ...options,
          runner,
          onSearchDiagnostics,
        }),
      existingIds,
    });
  }

  function runProviderDownload(videoId, { beforeStart = () => {} } = {}) {
    const destDir = resolveDownloadDir(getConfig());
    const releaseScope = getReleaseScope();
    const assertLibraryCurrent = () => {
      if (
        resolveDownloadDir(getConfig()) !== destDir ||
        getReleaseScope()?.epoch !== releaseScope?.epoch
      )
        throw createAppError({
          code: 'IMPORT_LIBRARY_CHANGED',
          title: '曲庫位置已變更',
          message: '請重新開始下載。',
        });
    };
    const existing = providerDownloadTasks.get(videoId);
    if (existing) {
      if (existing.dir !== destDir || existing.epoch !== releaseScope?.epoch)
        throw createAppError({
          code: 'IMPORT_LIBRARY_CHANGED',
          title: '曲庫位置已變更',
          message: '請等候原下載完成後再試。',
        });
      return existing.promise;
    }

    const task = (async () => {
      const runImport = createLibraryImportAdmission();
      let metadataCommitted = false;
      const commitMetadata = (result) => {
        const trackDir = resolveTrackDir(destDir, videoId);
        if (result.title) {
          try {
            saveProviderIndexEntry(
              destDir,
              videoId,
              buildProviderIndexEntry(result),
            );
          } catch {
            // A playable download can repair its index through backfill.
          }
        }
        if (trackDir) {
          scheduleOptionalLyricsAfterImport(
            { ...result, id: videoId },
            trackDir,
            lyricsAcquisitionService,
            () => notifyLibraryUpdated({ allowProviderBackfill: false }),
          );
        }
        try {
          enqueueMusicAnalysis(videoId);
        } catch {
          // Optional analysis must not fail an installed playable file.
        }
        metadataCommitted = true;
      };
      const result = await providerDownloadScheduler.schedule(
        videoId,
        async ({ signal }) => {
          await beforeStart();
          requireFeatureGate(featureIds.PROVIDER_FLOW);
          const runner = await getProviderRunner();
          await beforeStart();
          requireFeatureGate(featureIds.PROVIDER_FLOW);
          assertLibraryCurrent();
          return downloadTrackAudio(videoId, destDir, {
            runner,
            signal,
            allowBrowserCookies: getConfig().youtubeBrowserCookies === true,
            ...(runImport
              ? { runImport, onTrackCommitted: commitMetadata }
              : {}),
          });
        },
      );

      await runLibraryFinalize(async () => {
        assertLibraryCurrent();
        if (!metadataCommitted && !runImport) commitMetadata(result);
        await enforceLibraryStoragePolicySafely({
          enforceLibraryStoragePolicy,
          options: { protectedTrackIds: [videoId] },
          recordDiagnostic,
        });
        assertLibraryCurrent();
        // Publish the committed audio and metadata even when every optional
        // background service is disabled, delayed or unavailable.
        notifyLibraryUpdated({ allowProviderBackfill: false });
      });

      try {
        Promise.resolve(enqueueReleaseCatalog(videoId, releaseScope)).catch(
          () => {},
        );
      } catch {
        /* optional metadata cannot undo installed audio */
      }

      return result;
    })().finally(() => {
      providerDownloadTasks.delete(videoId);
    });

    providerDownloadTasks.set(videoId, {
      promise: task,
      dir: destDir,
      epoch: releaseScope?.epoch,
    });
    return task;
  }

  const batches = registerReleaseDownloadBatchHandlers({
    ipcMain,
    getMainWindow,
    getScope: getReleaseScope,
    getPlan: (input) => getReleaseDownloadPlan(input),
    prepare: (input) => prepareReleaseDownload(input, { batch: true }),
    validate: (target) => validateReleaseDownload(target),
    hasAudio: (target) => hasReleaseDownloadAudio(target),
    download: (target, beforeStart) =>
      classifyingFailures(
        () => runProviderDownload(target.videoId, { beforeStart }),
        { recordDiagnostic },
      ),
    attach: (target) => attachReleaseDownload(target),
    requireProvider: () => requireFeatureGate(featureIds.PROVIDER_FLOW),
    isPending: (videoId) => providerDownloadTasks.has(videoId),
    onChanged: () => notifyLibraryUpdated({ allowProviderBackfill: false }),
    recordFailure: (error, operation) =>
      recordSearchDiagnostic(recordDiagnostic, {
        process: 'main',
        level: 'warning',
        source: 'library',
        operation: `release-download-batch-${operation}`,
        code: 'RELEASE_DOWNLOAD_BATCH_FAILED',
        error,
      }),
  });

  ipcMain.handle('import:resolve-source', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(
      async () => {
        const classified = classifyImportInput(input);
        if (classified.kind === 'deferred-provider-url') {
          return { kind: 'deferred', platform: classified.platform };
        }
        if (classified.kind === 'unsupported-url') {
          return { kind: 'unsupported', reason: 'unsupported-url' };
        }
        if (classified.kind === 'invalid') {
          return { kind: 'unsupported', reason: classified.reason };
        }

        const runner = await getProviderRunner();
        const { existingIds } = existingProviderIds();
        if (
          classified.kind === 'youtube-playlist' ||
          classified.kind === 'youtube-music-album'
        ) {
          const { title, thumbnailUrl, entries, releaseType, releaseDate } =
            await fetchPlaylistMetadata(classified.playlistId, { runner });
          return {
            kind: 'playlist',
            title,
            thumbnailUrl,
            releaseType: releaseType || 'unknown',
            releaseDate: releaseDate || null,
            collectionKind: classifyPlaylistKind(classified.playlistId),
            source: {
              platform:
                classified.kind === 'youtube-music-album'
                  ? 'yt-music'
                  : 'youtube',
              id: classified.playlistId,
            },
            entries: entries.map((entry) => ({
              ...entry,
              alreadyDownloaded: existingIds.has(entry.id),
            })),
          };
        }

        const resolution =
          classified.kind === 'text-query'
            ? await classifyingProviderSearchFailures(
                () =>
                  resolveYoutubeSearchQuery(classified.query, {
                    searchPlaybackCandidates: (
                      canonical,
                      sourceMetadata,
                      options = {},
                    ) =>
                      searchYoutubeCandidates(canonical, sourceMetadata, {
                        ...options,
                        runner,
                        onSearchDiagnostics,
                      }),
                    existingIds,
                  }),
                { recordDiagnostic },
              )
            : await resolveSingleSource(classified.input, runner, existingIds);
        return {
          kind: 'single',
          inputKind: classified.kind,
          resolution,
        };
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('yt:fetch-playlist', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(
      async () => {
        const runner = await getProviderRunner();
        const playlistId = extractPlaylistId(input);
        if (!playlistId) return null; // not a playlist URL — not an error
        const dir = resolveDownloadDir(getConfig());
        const existingIds = new Set(
          listLibraryTracks(dir).map((track) => track.id),
        );
        const { title, thumbnailUrl, entries, releaseType, releaseDate } =
          await fetchPlaylistMetadata(playlistId, {
            runner,
          });
        return {
          title,
          thumbnailUrl,
          releaseType: releaseType || 'unknown',
          releaseDate: releaseDate || null,
          kind: classifyPlaylistKind(playlistId),
          source: { platform: 'youtube', id: playlistId },
          entries: entries.map((entry) => ({
            ...entry,
            alreadyDownloaded: existingIds.has(entry.id),
          })),
        };
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('yt:fetch-metadata', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(
      async () => {
        const runner = await getProviderRunner();
        const videoId = extractVideoId(input);
        if (!videoId) throw new Error('invalid video id or YouTube URL');
        const metadata = await fetchYoutubeMetadata(videoId, { runner });
        if (!metadata) throw new Error('unable to fetch video metadata');
        const dir = resolveDownloadDir(getConfig());
        const existingIds = new Set(
          listLibraryTracks(dir).map((track) => track.id),
        );
        return {
          id: videoId,
          ...metadata,
          alreadyDownloaded: existingIds.has(videoId),
        };
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('yt:resolve-import-source', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(
      async () => {
        const runner = await getProviderRunner();
        const dir = resolveDownloadDir(getConfig());
        const existingIds = new Set(
          listLibraryTracks(dir).map((track) => track.id),
        );
        return resolveSingleSource(input, runner, existingIds);
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('library:download-release-track', async (event, input) => {
    const window = getMainWindow();
    if (
      !window ||
      window.isDestroyed() ||
      event?.sender !== window.webContents ||
      event?.senderFrame !== window.webContents.mainFrame
    )
      return { status: 'invalid-intent' };
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    if (
      !prepareReleaseDownload ||
      !validateReleaseDownload ||
      !attachReleaseDownload
    )
      return { status: 'unavailable' };
    let target;
    try {
      target = prepareReleaseDownload(input);
    } catch {
      return { status: 'unavailable' };
    }
    return classifyingFailures(
      async () => {
        await runProviderDownload(target.videoId, {
          beforeStart: () => {
            requireFeatureGate(featureIds.PROVIDER_FLOW);
            validateReleaseDownload(target);
          },
        });
        try {
          const result = await attachReleaseDownload(target);
          notifyLibraryUpdated({ allowProviderBackfill: false });
          return result;
        } catch (error) {
          recordSearchDiagnostic(recordDiagnostic, {
            process: 'main',
            level: 'warning',
            source: 'library',
            operation: 'download-release-track',
            code: 'RELEASE_DOWNLOAD_LINK_FAILED',
            error,
          });
          notifyLibraryUpdated({ allowProviderBackfill: false });
          return { status: 'downloaded-unlinked' };
        }
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('yt:download-audio', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(
      async () => {
        const videoId = extractVideoId(input);
        if (!videoId) throw new Error('invalid video id or YouTube URL');
        try {
          return await runProviderDownload(videoId);
        } catch (error) {
          if (error?.code !== 'IMPORT_DOWNLOAD_CANCELLED') throw error;
          throw createAppError({
            code: 'IMPORT_DOWNLOAD_CANCELLED',
            severity: 'info',
            title: '匯入已停止',
            message: '這首曲目已停止下載。',
          });
        }
      },
      { recordDiagnostic },
    );
  });

  ipcMain.handle('yt:cancel-download', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    const videoId = extractVideoId(input);
    if (!videoId) return false;
    return providerDownloadScheduler.cancel(videoId);
  });
  return { dispose: batches.dispose };
}

module.exports = {
  buildProviderIndexEntry,
  registerImportHandlers,
  scheduleOptionalLyricsAfterImport,
};
