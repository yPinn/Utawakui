'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const {
  backfillLyricsSourceLabels,
  deleteTrackReading,
  findTrackRecord,
  getTrackLyricsState,
  loadTrackLyricsManifest,
  getTrackReading,
  importManualLyricsFile,
  importManualLyricsText,
  listTracks,
  readTrackLyrics,
  resolveTrackDir,
  saveTrackLyricsTiming,
  saveTrackReading,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  setReadingLine,
} = require('../lib/library');
const { probeMusixmatchLyrics } = require('../lib/musixmatch');
const { deleteStoredLrclibSource } = require('../lib/lrclib');

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
const READING_SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_READING_LINES = 10_000;
const MAX_LRCLIB_QUERY_CHARS = 256;

function containsControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function normalizeLrclibSearchOptions(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('lrclib search options are invalid');
  }
  if (Object.keys(value).some((key) => !['query', 'mode'].includes(key))) {
    throw new Error('lrclib search options contain an unsupported field');
  }
  if (value.mode !== undefined && value.mode !== 'broaden') {
    throw new Error('lrclib search mode is invalid');
  }

  let query;
  if (value.query !== undefined) {
    if (
      !value.query ||
      typeof value.query !== 'object' ||
      Array.isArray(value.query) ||
      Object.keys(value.query).some((key) => !['title', 'artist'].includes(key))
    ) {
      throw new Error('lrclib search query is invalid');
    }
    query = {};
    for (const field of ['title', 'artist']) {
      const fieldValue = value.query[field];
      if (fieldValue === undefined) continue;
      if (
        typeof fieldValue !== 'string' ||
        fieldValue.length > MAX_LRCLIB_QUERY_CHARS ||
        containsControlCharacter(fieldValue)
      ) {
        throw new Error(`lrclib search query ${field} is invalid`);
      }
      query[field] = fieldValue;
    }
  }

  return {
    ...(query ? { query } : {}),
    ...(value.mode ? { mode: value.mode } : {}),
  };
}

function validateReadingIdentity(currentLyrics, identity) {
  if (
    !identity ||
    typeof identity.documentId !== 'string' ||
    identity.documentId.length === 0 ||
    identity.documentId.length > 200 ||
    !READING_SHA256_RE.test(identity.sourceFingerprint) ||
    identity.sourceFingerprint !== currentLyrics?.timing?.sourceFingerprint ||
    !Array.isArray(identity.lines) ||
    identity.lines.length > MAX_READING_LINES
  ) {
    throw new Error('lyrics reading identity is stale or invalid');
  }
  const lineIds = new Set();
  for (const line of identity.lines) {
    if (
      typeof line?.lineId !== 'string' ||
      line.lineId.length === 0 ||
      line.lineId.length > 200 ||
      lineIds.has(line.lineId) ||
      typeof line.text !== 'string' ||
      line.text.length > 10_000
    ) {
      throw new Error('lyrics reading lines are invalid');
    }
    lineIds.add(line.lineId);
  }
  if (
    identity.targetLineId !== undefined &&
    !lineIds.has(identity.targetLineId)
  ) {
    throw new Error('lyrics reading target line is invalid');
  }
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
  lyricsAcquisitionService,
}) {
  ipcMain.handle('lyrics:get-track', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const result = readTrackLyrics(dir, trackId, filename);
    if (!result) return null;
    return result;
  });

  // Ungated local edit. Main resolves every path, verifies that the source
  // still has the renderer-observed fingerprint, and validates all document
  // bounds before writing the derivative sidecar.
  ipcMain.handle(
    'lyrics:save-timing',
    async (
      event,
      trackId,
      sourceFilename,
      expectedSourceFingerprint,
      document,
    ) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const saved = saveTrackLyricsTiming(
        trackDir,
        sourceFilename,
        expectedSourceFingerprint,
        document,
      );
      notifyLibraryUpdated();
      return saved;
    },
  );

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
  ipcMain.handle(
    'lyrics:search-candidates',
    async (event, trackId, options) => {
      const dir = resolveDownloadDir(getConfig());
      const track = listTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const result = await lyricsAcquisitionService.searchCandidates(
        track,
        normalizeLrclibSearchOptions(options),
      );
      const manifestSources = loadTrackLyricsManifest(trackDir).sources;
      const existingProviderIds = new Set(
        manifestSources
          .filter((source) => source.provider?.name === 'lrclib')
          .map((source) => source.provider.recordId),
      );
      const existingFilenames = new Set(
        getTrackLyricsState(trackDir).sources.map((source) => source.filename),
      );
      const mapCandidate = (candidate) => ({
        ...candidate,
        alreadySaved:
          existingProviderIds.has(candidate.id) ||
          existingFilenames.has(`lrclib-${candidate.id}.lrc`),
      });
      const candidates = result.candidates.map(mapCandidate);
      return {
        ...result,
        candidates,
        groups: result.groups
          ? {
              best: candidates.filter(
                (candidate) => candidate.matchBand !== 'related',
              ),
              related: candidates.filter(
                (candidate) => candidate.matchBand === 'related',
              ),
            }
          : null,
      };
    },
  );

  ipcMain.handle(
    'lyrics:save-candidate',
    async (event, trackId, candidateId, expectedFingerprint) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const result = await lyricsAcquisitionService.saveCandidate({
        track,
        trackDir,
        candidateId,
        expectedFingerprint,
      });
      if (result.status !== 'saved') return result;

      notifyLibraryUpdated();
      return { ...result, sources: getTrackLyricsState(trackDir).sources };
    },
  );

  // One-time repair for lrclib sources saved before the label field
  // existed.
  ipcMain.handle('lyrics:backfill-source-labels', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    const sources = await backfillLyricsSourceLabels(
      trackDir,
      async (candidateId) => {
        const fetched = await lyricsAcquisitionService.fetchRecord(candidateId);
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

  // Deliberately ungated machine-local presentation metadata. Keeping the
  // value in lyrics.json avoids rewriting the authored LRC/VTT bytes and
  // invalidating timing/reading fingerprints.
  ipcMain.handle(
    'lyrics:set-source-offset',
    async (event, trackId, filename, offsetMs) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const sources = setLyricsSourceOffset(trackDir, filename, offsetMs);
      const source = sources?.find(
        (candidate) => candidate.filename === filename,
      );
      if (!source) throw new Error(`invalid lyrics source offset: ${filename}`);

      return { source };
    },
  );

  // Also ungated, same reasoning.
  ipcMain.handle('lyrics:delete-source', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    if (!deleteStoredLrclibSource(trackDir, filename)) {
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

  // The renderer projects its canonical document into stable ids plus cleaned
  // line text. Main verifies the current source fingerprint and bounds before
  // the worker sees any text; it never accepts a path or raw source markup.
  ipcMain.handle(
    'lyrics:generate-reading',
    async (event, trackId, sourceFilename, identity, script) => {
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
      validateReadingIdentity(
        readTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );

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
                lines: Array.isArray(identity?.lines)
                  ? identity.lines.map((line) => line?.text)
                  : [],
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

        // A manual source replacement can happen while the worker is active.
        // Re-check immediately before publication so a stale job never wins.
        validateReadingIdentity(
          readTrackLyrics(dir, trackId, sourceFilename),
          identity,
        );
        const saved = saveTrackReading(
          trackDir,
          sourceFilename,
          script,
          readingDoc,
          identity,
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
    async (event, trackId, sourceFilename, identity, readingKana) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);
      validateReadingIdentity(
        readTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );

      const updated = setReadingLine(
        trackDir,
        sourceFilename,
        identity,
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

module.exports = {
  normalizeLrclibSearchOptions,
  registerLyricsHandlers,
};
