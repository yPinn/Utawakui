'use strict';

const {
  downloadAudio,
  fetchMetadata,
  fetchPlaylist,
} = require('../lib/downloader');
const { searchPlaybackCandidates } = require('../lib/playbackSearch');
const { downloadErrorText } = require('../lib/youtubeAttempts');
const { toClassifiedDownloadError } = require('../lib/downloadFailure');
const {
  extractVideoId,
  extractPlaylistId,
  classifyPlaylistKind,
} = require('../lib/youtube');
const { resolveYoutubeImportSource } = require('../lib/importResolver');
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
    console.error('[yt] request failed:', downloadErrorText(err));
    throw toClassifiedDownloadError(err);
  }
}

async function saveOptionalLyricsAfterImport(
  track,
  trackDir,
  lyricsAcquisitionService,
) {
  try {
    return Boolean(
      await lyricsAcquisitionService.saveIfAbsent(track, trackDir),
    );
  } catch {
    // The audio download succeeded. A failed or gated optional lyrics
    // fallback must never turn that into a failed import.
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
}) {
  ipcMain.handle('yt:fetch-playlist', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
      const runner = await getProviderRunner();
      const playlistId = extractPlaylistId(input);
      if (!playlistId) return null; // not a playlist URL — not an error
      const dir = resolveDownloadDir(getConfig());
      const existingIds = new Set(listTracks(dir).map((track) => track.id));
      const { title, thumbnailUrl, entries } = await fetchPlaylist(playlistId, {
        runner,
      });
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
      const metadata = await fetchMetadata(videoId, { runner });
      if (!metadata) throw new Error('unable to fetch video metadata');
      const dir = resolveDownloadDir(getConfig());
      const existingIds = new Set(listTracks(dir).map((track) => track.id));
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
      const existingIds = new Set(listTracks(dir).map((track) => track.id));
      return resolveYoutubeImportSource(input, {
        extractVideoId,
        fetchMetadata: (videoId) => fetchMetadata(videoId, { runner }),
        searchPlaybackCandidates: (canonical, sourceMetadata, options = {}) =>
          searchPlaybackCandidates(canonical, sourceMetadata, {
            ...options,
            runner,
          }),
        existingIds,
      });
    });
  });

  ipcMain.handle('yt:download-audio', async (event, input) => {
    requireFeatureGate(featureIds.PROVIDER_FLOW);
    return classifyingFailures(async () => {
      const runner = await getProviderRunner();
      const videoId = extractVideoId(input);
      if (!videoId) throw new Error('invalid video id or YouTube URL');
      const destDir = resolveDownloadDir(getConfig());
      const result = await downloadAudio(videoId, destDir, { runner });
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
        await saveOptionalLyricsAfterImport(
          result,
          trackDir,
          lyricsAcquisitionService,
        );
      }
      return result;
    });
  });
}

module.exports = {
  buildProviderIndexEntry,
  registerImportHandlers,
  saveOptionalLyricsAfterImport,
};
