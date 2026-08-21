'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const {
  allocateLyricsFilename,
  backfillLyricsSourceLabels,
  deleteLyricsSource,
  deleteTrackReading,
  findTrackRecord,
  getTrackLyricsState,
  getTrackReading,
  importManualLyricsFile,
  importManualLyricsText,
  listTracks,
  readTrackLyrics,
  resolveTrackDir,
  saveTrackLyricsText,
  saveTrackReading,
  setLyricsSourceLabel,
  setReadingLine,
} = require('../lib/library');
const { probeMusixmatchLyrics } = require('../lib/musixmatch');
const {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
} = require('../lib/lrclib');

// Main-owned per-target guard (trackId::sourceFilename), same reasoning as
// separationHandlers.js's separationInProgress — renderer disabled state
// isn't authoritative. Keyed per target (not a single global flag) because
// generating readings for one track has no reason to block another.
const readingInProgress = new Set();

// Stage 5c: ja/ko are the only scripts the reading-aid toolbar ever offers
// (detectLyricsScript() in src/utils/lyrics.js), and the renderer always
// sends its own detected script rather than main re-deriving it — fail
// loudly on anything else instead of silently falling back, same
// trust-boundary posture as extractVideoId()'s re-validation.
const READING_SCRIPTS = new Set(['ja', 'ko']);

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

  // Reading-aid handlers. Ungated like import/label/delete above — this is
  // local text analysis over lyrics already on disk, not an acquisition
  // step (Stage 5b's kuromoji/wanakana and Stage 5c's koroman are all
  // bundled at build time, not downloaded at runtime; see docs/adr/0003
  // and docs/adr/0004).
  ipcMain.handle(
    'lyrics:get-reading',
    async (event, trackId, sourceFilename) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);
      return getTrackReading(trackDir, sourceFilename);
    },
  );

  // `lines` is the already-parsed lyric line text array (renderer owns
  // parseLyricsText's youtube-cc dedup/cleanup logic; main only receives
  // its output here, never raw cue text) — not a filesystem path, so
  // accepting it from the renderer doesn't reopen the kind of trust
  // boundary FFmpeg's opt-in path guards against.
  ipcMain.handle(
    'lyrics:generate-reading',
    async (event, trackId, sourceFilename, lines, script) => {
      if (!READING_SCRIPTS.has(script)) {
        throw new Error(`unsupported reading script: ${script}`);
      }

      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      const { sources } = getTrackLyricsState(trackDir);
      if (!sources.some((source) => source.filename === sourceFilename)) {
        throw new Error(`unknown lyrics source: ${sourceFilename}`);
      }

      // Keyed per target, not a single global flag like separation's —
      // generating readings for one track has no reason to block another.
      const key = `${trackId}::${sourceFilename}`;
      if (readingInProgress.has(key)) {
        throw new Error('已經在為這份歌詞產生讀音,請稍候。');
      }
      readingInProgress.add(key);
      try {
        const readingDoc = await new Promise((resolve, reject) => {
          const worker = new Worker(
            path.join(__dirname, '..', 'lib', 'readingWorker.js'),
            {
              workerData: {
                lines: Array.isArray(lines) ? lines : [],
                script,
              },
            },
          );
          worker.on('message', (msg) => {
            if (msg.type === 'progress') {
              const progressWin = getMainWindow();
              if (progressWin) {
                progressWin.webContents.send('lyrics:reading-progress', {
                  trackId,
                  sourceFilename,
                  stage: msg.stage,
                  index: msg.index,
                  total: msg.total,
                });
              }
            } else if (msg.type === 'done') {
              resolve(msg.result);
            } else {
              reject(new Error(msg.error));
            }
          });
          worker.on('error', reject);
          // Without this, a worker that dies before posting any message
          // leaves the promise unsettled forever and this target stuck
          // "in progress" until the app is relaunched.
          worker.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`reading worker exited with code ${code}`));
            }
          });
        });

        const saved = saveTrackReading(
          trackDir,
          sourceFilename,
          script,
          readingDoc,
        );
        if (!saved) throw new Error('unable to save reading doc');

        notifyLibraryUpdated();
        return saved;
      } finally {
        readingInProgress.delete(key);
      }
    },
  );

  // Manual per-line correction — a synchronous local edit, not a worker
  // job. No `script` argument here: setReadingLine reads the existing
  // doc's own stored `script` and branches there (ja re-derives ruby
  // segments from `readingKana`; ko treats it as the final romaji string
  // directly — see lyricsReadings.js).
  ipcMain.handle(
    'lyrics:set-reading-line',
    async (event, trackId, sourceFilename, lineIndex, readingKana) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      const updated = setReadingLine(
        trackDir,
        sourceFilename,
        lineIndex,
        readingKana,
      );
      if (!updated) throw new Error('unable to update reading line');

      notifyLibraryUpdated();
      return updated;
    },
  );

  ipcMain.handle(
    'lyrics:delete-reading',
    async (event, trackId, sourceFilename) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      deleteTrackReading(trackDir, sourceFilename);
      notifyLibraryUpdated();
      return { ok: true };
    },
  );
}

module.exports = { registerLyricsHandlers, saveLrclibLyricsIfAbsent };
