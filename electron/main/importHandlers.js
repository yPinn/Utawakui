'use strict';

const {
  downloadAudio,
  fetchMetadata,
  fetchPlaylist,
} = require('../lib/downloader');
const { searchPlaybackCandidates } = require('../lib/playbackSearch');
const { classifyImportInput } = require('../lib/importInput');
const { downloadErrorText } = require('../lib/youtubeAttempts');
const {
  classifyDownloadFailure,
  toClassifiedDownloadError,
} = require('../lib/downloadFailure');
const { APP_ERROR_PREFIX, createAppError } = require('../lib/appError');
const {
  extractVideoId,
  extractPlaylistId,
  classifyPlaylistKind,
} = require('../lib/youtube');
const {
  resolveYoutubeImportSource,
  resolveYoutubeSearchQuery,
} = require('../lib/importResolver');
const {
  listTracks,
  resolveTrackDir,
  saveIndexEntry,
} = require('../lib/library');

// error.stderr never survives ipcMain.handle's serialization, so
// classification has to happen here. Only the sentinel code crosses the
// boundary — the raw text may contain local file paths, so it's logged
// here and never forwarded (same discipline as vocalSeparation.js).
async function classifyingFailures(run) {
  try {
    return await run();
  } catch (err) {
    if (
      err?.code === 'PROVIDER_SEARCH_FAILED' &&
      typeof err?.publicMessage === 'string' &&
      String(err?.message || '').startsWith(APP_ERROR_PREFIX)
    ) {
      throw err;
    }
    console.error('[yt] request failed:', downloadErrorText(err));
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

function buildProviderIndexEntry(result) {
  return {
    title: result.title,
    titleOrigin: 'provider',
    artist: result.artist,
    artistOrigin: 'provider',
    duration: result.duration,
    album: result.album,
    releaseYear: result.releaseYear,
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
  downloadTrackAudio = downloadAudio,
  fetchPlaylistMetadata = fetchPlaylist,
  fetchYoutubeMetadata = fetchMetadata,
  searchYoutubeCandidates = searchPlaybackCandidates,
  listLibraryTracks = listTracks,
  recordDiagnostic,
}) {
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

  ipcMain.handle('import:resolve-source', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
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
        const { title, thumbnailUrl, entries } = await fetchPlaylistMetadata(
          classified.playlistId,
          { runner },
        );
        return {
          kind: 'playlist',
          title,
          thumbnailUrl,
          collectionKind:
            classified.kind === 'youtube-music-album' ? 'album' : 'playlist',
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
    });
  });

  ipcMain.handle('yt:fetch-playlist', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
      const runner = await getProviderRunner();
      const playlistId = extractPlaylistId(input);
      if (!playlistId) return null; // not a playlist URL — not an error
      const dir = resolveDownloadDir(getConfig());
      const existingIds = new Set(
        listLibraryTracks(dir).map((track) => track.id),
      );
      const { title, thumbnailUrl, entries } = await fetchPlaylistMetadata(
        playlistId,
        {
          runner,
        },
      );
      return {
        title,
        thumbnailUrl,
        kind: classifyPlaylistKind(playlistId),
        source: { platform: 'youtube', id: playlistId },
        entries: entries.map((entry) => ({
          ...entry,
          alreadyDownloaded: existingIds.has(entry.id),
        })),
      };
    });
  });

  ipcMain.handle('yt:fetch-metadata', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
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
    });
  });

  ipcMain.handle('yt:resolve-import-source', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
      const runner = await getProviderRunner();
      const dir = resolveDownloadDir(getConfig());
      const existingIds = new Set(
        listLibraryTracks(dir).map((track) => track.id),
      );
      return resolveSingleSource(input, runner, existingIds);
    });
  });

  ipcMain.handle('yt:download-audio', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
      const runner = await getProviderRunner();
      const videoId = extractVideoId(input);
      if (!videoId) throw new Error('invalid video id or YouTube URL');
      const destDir = resolveDownloadDir(getConfig());
      const result = await downloadTrackAudio(videoId, destDir, { runner });
      const trackDir = resolveTrackDir(destDir, videoId);
      if (result.title) {
        try {
          saveIndexEntry(destDir, videoId, buildProviderIndexEntry(result));
        } catch {
          // The download itself succeeded and the file is playable — a
          // failed index write (e.g. disk full) shouldn't be reported to
          // the renderer as a failed download. The next background
          // backfill pass will retry writing the title.
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
        // Analysis is optional background work. A playable download remains
        // successful even if queue admission fails unexpectedly.
      }
      return result;
    });
  });
}

module.exports = {
  buildProviderIndexEntry,
  registerImportHandlers,
  scheduleOptionalLyricsAfterImport,
};
