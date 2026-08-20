'use strict';

const {
  allocateLyricsFilename,
  backfillLyricsSourceLabels,
  deleteLyricsSource,
  findTrackRecord,
  getTrackLyricsState,
  importManualLyricsFile,
  importManualLyricsText,
  listTracks,
  readTrackLyrics,
  resolveTrackDir,
  saveTrackLyricsText,
  setLyricsSourceLabel,
} = require('../lib/library');
const { probeMusixmatchLyrics } = require('../lib/musixmatch');
const {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
} = require('../lib/lrclib');

// Used both by the passive startup backfill (electron/main/libraryHandlers.js's
// backfillTrackInfoWithLyricsFallback) and by electron/main/importHandlers.js's
// yt:download-audio — fundamentally lyrics-acquisition logic, so it lives
// here rather than being duplicated or routed through a generic context.
async function saveLrclibLyricsIfAbsent(track, trackDir) {
  const lyricsState = getTrackLyricsState(trackDir);
  if (lyricsState.sources.some((source) => source.kind === 'lrclib')) {
    return false;
  }

  const lrclibResult = await findLrclibSyncedLyrics(track);
  if (lrclibResult.status !== 'available') return false;

  return saveTrackLyricsText(trackDir, lrclibResult.source, lrclibResult.text);
}

function registerLyricsHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
}) {
  ipcMain.handle('lyrics:get-track', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const result = readTrackLyrics(dir, trackId, filename);
    if (!result) return null;
    return result;
  });

  ipcMain.handle('lyrics:probe-musixmatch', async (event, trackId) => {
    requireFeatureGate(featureIds.LYRICS_FLOW);

    const dir = resolveDownloadDir(getConfig());
    const track = listTracks(dir).find((candidate) => candidate.id === trackId);
    if (!track) {
      return {
        provider: 'musixmatch',
        status: 'unavailable',
        reason: 'unknown-track',
      };
    }
    return probeMusixmatchLyrics(track);
  });

  // Manual counterpart to the passive lrclib backfill above
  // (saveLrclibLyricsIfAbsent) — returns the full ranked candidate list
  // instead of collapsing to one match. Doesn't persist anything.
  ipcMain.handle('lyrics:search-candidates', async (event, trackId) => {
    requireFeatureGate(featureIds.LYRICS_FLOW);
    const dir = resolveDownloadDir(getConfig());
    const track = listTracks(dir).find((candidate) => candidate.id === trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const result = await searchLrclibCandidates(track);
    const existingFilenames = new Set(
      getTrackLyricsState(trackDir).sources.map((source) => source.filename),
    );
    return {
      ...result,
      // Computed here, not in the renderer — main owns the
      // lrclib-<id>.lrc naming convention lyrics:save-candidate uses.
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        alreadySaved: existingFilenames.has(`lrclib-${candidate.id}.lrc`),
      })),
    };
  });

  // Always allocates a NEW, non-colliding filename — never overwrites an
  // existing source.
  ipcMain.handle(
    'lyrics:save-candidate',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.LYRICS_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      const fetched = await fetchLrclibRecord(candidateId);
      if (fetched.status !== 'ok') {
        throw new Error(`lrclib record unavailable: ${fetched.reason}`);
      }
      const text = fetched.record?.syncedLyrics;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('lrclib record has no synced lyrics');
      }

      const filename = allocateLyricsFilename(
        trackDir,
        `lrclib-${candidateId}`,
        '.lrc',
      );
      if (!filename) {
        throw new Error('unable to allocate a lyrics filename');
      }

      // language: 'und' matches the passive backfill's own lrclib
      // sources. label disambiguates multiple saved candidates in the
      // source picker (album is usually the real difference between two
      // lrclib records for the same song; artist is the fallback).
      const label = fetched.record?.albumName || fetched.record?.artistName;
      const source = {
        filename,
        language: 'und',
        kind: 'lrclib',
        ...(label ? { label } : {}),
      };
      if (!saveTrackLyricsText(trackDir, source, text)) {
        throw new Error('failed to write lyrics file');
      }

      notifyLibraryUpdated();
      return { source, sources: getTrackLyricsState(trackDir).sources };
    },
  );

  // One-time repair for lrclib sources saved before the label field
  // existed.
  ipcMain.handle('lyrics:backfill-source-labels', async (event, trackId) => {
    requireFeatureGate(featureIds.LYRICS_FLOW);
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    const sources = await backfillLyricsSourceLabels(
      trackDir,
      async (candidateId) => {
        const fetched = await fetchLrclibRecord(candidateId);
        if (fetched.status !== 'ok') return null;
        return fetched.record?.albumName || fetched.record?.artistName || null;
      },
    );

    notifyLibraryUpdated();
    return { sources };
  });

  // Deliberately ungated — a pure local edit, not an acquisition step.
  ipcMain.handle(
    'lyrics:set-source-label',
    async (event, trackId, filename, label) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      const sources = setLyricsSourceLabel(trackDir, filename, label);
      if (!sources) throw new Error(`unknown lyrics source: ${filename}`);

      notifyLibraryUpdated();
      return { sources };
    },
  );

  // Also ungated, same reasoning.
  ipcMain.handle('lyrics:delete-source', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    if (!deleteLyricsSource(trackDir, filename)) {
      throw new Error(`unable to delete lyrics source: ${filename}`);
    }

    notifyLibraryUpdated();
    return { sources: getTrackLyricsState(trackDir).sources };
  });

  // Ungated: the user is importing lyrics text/file they already have
  // locally. Only provider lookup/acquisition belongs behind lyrics-flow.
  ipcMain.handle('lyrics:import-text', async (event, trackId, payload) => {
    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const result = importManualLyricsText(trackDir, payload);
    if (!result) throw new Error('unable to import manual lyrics');

    notifyLibraryUpdated();
    return result;
  });

  ipcMain.handle('lyrics:import-file', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const picked = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title: '匯入歌詞檔',
      properties: ['openFile'],
      filters: [
        { name: 'Lyrics', extensions: ['lrc', 'vtt', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;

    const result = importManualLyricsFile(trackDir, picked.filePaths[0]);
    if (!result) throw new Error('unable to import manual lyrics file');

    notifyLibraryUpdated();
    return result;
  });
}

module.exports = { registerLyricsHandlers, saveLrclibLyricsIfAbsent };
