'use strict';

const path = require('path');
const { resolveRuntimeEntry } = require('../../lib/runtimeEntries');
const { Worker } = require('worker_threads');
const {
  deleteTrackReading,
  getTrackLyricsState,
  loadTrackReadingForIdentity,
  readTrackLyrics,
  resolveTrackDir,
  saveTrackReading,
  setReadingLine,
} = require('../../lib/library');
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');

const readingInProgress = new Set();
const READING_SCRIPTS = new Set(['ja', 'ko']);
const READING_SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_READING_LINES = 10_000;

function validateReadingIdentity(currentLyrics, identity) {
  if (
    !identity ||
    typeof identity.documentId !== 'string' ||
    identity.documentId.length === 0 ||
    identity.documentId.length > 200 ||
    typeof identity.normalizerProfileId !== 'string' ||
    identity.normalizerProfileId !==
      currentLyrics?.timing?.normalizerProfileId ||
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

// Every throw below means "the renderer's view of this track/lyrics/reading
// identity no longer matches main" — expected control flow (the same
// principle as a stale feature-gate notice or a closed gate), not an
// operational failure. These stay outside runDiagnosticIpcOperation and are
// never persisted; only genuine worker/disk failures below are.
function assertReadingIdentityFresh(currentLyrics, identity) {
  try {
    validateReadingIdentity(currentLyrics, identity);
  } catch {
    throw createAppError({
      code: 'LYRICS_READING_IDENTITY_STALE',
      severity: 'warning',
    });
  }
}

function requireTrackDir(dir, trackId, resolveDir) {
  const trackDir = resolveDir(dir, trackId);
  if (!trackDir) {
    throw createAppError({
      code: 'LYRICS_READING_UNKNOWN_TRACK',
      severity: 'warning',
    });
  }
  return trackDir;
}

function runReadingWorker({ lines, script, onProgress }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      resolveRuntimeEntry(path.resolve(__dirname, '../../..'), 'readingWorker'),
      { workerData: { lines, script } },
    );
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        onProgress(message);
      } else if (message.type === 'done') {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`reading worker exited with code ${code}`));
      }
    });
  });
}

function registerLyricsReadingHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  recordDiagnostic,
  runReadingWorker: runReadingWorkerImpl = runReadingWorker,
  // Injectable overrides — this codebase's established seam for these
  // handler tests (see libraryHandlers.js's `findLibraryTrackRecord`) rather
  // than mocking electron/lib/library, which does not reliably intercept
  // through vi.mock when required transitively (see tasks/lessons.md).
  resolveReadingTrackDir = resolveTrackDir,
  readReadingTrackLyrics = readTrackLyrics,
  getReadingTrackLyricsState = getTrackLyricsState,
  loadReadingForIdentity = loadTrackReadingForIdentity,
  saveReadingForIdentity = saveTrackReading,
  setReadingLineText = setReadingLine,
  deleteReadingForTrack = deleteTrackReading,
}) {
  ipcMain.handle(
    'lyrics:get-reading',
    async (event, trackId, sourceFilename, identity) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = requireTrackDir(dir, trackId, resolveReadingTrackDir);
      assertReadingIdentityFresh(
        readReadingTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-reading',
            operation: 'get',
            code: 'LYRICS_READING_LOAD_FAILED',
          },
          publicError: {
            code: 'LYRICS_READING_LOAD_FAILED',
          },
        },
        () => loadReadingForIdentity(trackDir, sourceFilename, identity),
      );
    },
  );

  ipcMain.handle(
    'lyrics:generate-reading',
    async (event, trackId, sourceFilename, identity, script) => {
      if (!READING_SCRIPTS.has(script)) {
        throw createAppError({
          code: 'LYRICS_READING_UNSUPPORTED_SCRIPT',
          severity: 'warning',
        });
      }

      const dir = resolveDownloadDir(getConfig());
      const trackDir = requireTrackDir(dir, trackId, resolveReadingTrackDir);

      const { sources } = getReadingTrackLyricsState(trackDir);
      if (!sources.some((source) => source.filename === sourceFilename)) {
        throw createAppError({
          code: 'LYRICS_READING_UNKNOWN_SOURCE',
          severity: 'warning',
        });
      }
      assertReadingIdentityFresh(
        readReadingTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );

      const key = `${trackId}::${sourceFilename}`;
      if (readingInProgress.has(key)) {
        throw createAppError({
          code: 'LYRICS_READING_IN_PROGRESS',
          severity: 'warning',
        });
      }
      readingInProgress.add(key);
      try {
        const readingDoc = await runDiagnosticIpcOperation(
          {
            recordDiagnostic,
            diagnostic: {
              source: 'lyrics-reading',
              operation: 'generate',
              code: 'LYRICS_READING_GENERATE_FAILED',
            },
            publicError: {
              code: 'LYRICS_READING_GENERATE_FAILED',
              context: { retryable: true },
            },
          },
          () =>
            runReadingWorkerImpl({
              lines: Array.isArray(identity?.lines)
                ? identity.lines.map((line) => line?.text)
                : [],
              script,
              onProgress: (message) => {
                const progressWindow = getMainWindow();
                if (!progressWindow) return;
                progressWindow.webContents.send('lyrics:reading-progress', {
                  trackId,
                  sourceFilename,
                  stage: message.stage,
                  index: message.index,
                  total: message.total,
                });
              },
            }),
        );

        // Re-checked after the (potentially long-running) worker completes —
        // the renderer's lyrics could have changed mid-generation. Stays
        // outside the diagnostic wrap above: a race here is the same
        // expected-state rejection as the pre-flight check, not a fresh
        // operational failure, and must not be recorded as one nor have its
        // specific message overwritten by the generic generate-failed one.
        assertReadingIdentityFresh(
          readReadingTrackLyrics(dir, trackId, sourceFilename),
          identity,
        );

        const saved = await runDiagnosticIpcOperation(
          {
            recordDiagnostic,
            diagnostic: {
              source: 'lyrics-reading',
              operation: 'save',
              code: 'LYRICS_READING_SAVE_FAILED',
            },
            publicError: {
              code: 'LYRICS_READING_SAVE_FAILED',
              context: { retryable: true },
            },
          },
          () => {
            const result = saveReadingForIdentity(
              trackDir,
              sourceFilename,
              script,
              readingDoc,
              identity,
            );
            if (!result) throw new Error('unable to save reading doc');
            return result;
          },
        );

        notifyLibraryUpdated();
        return saved;
      } finally {
        readingInProgress.delete(key);
      }
    },
  );

  ipcMain.handle(
    'lyrics:set-reading-line',
    async (event, trackId, sourceFilename, identity, readingKana) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = requireTrackDir(dir, trackId, resolveReadingTrackDir);
      assertReadingIdentityFresh(
        readReadingTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );

      const updated = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-reading',
            operation: 'set-line',
            code: 'LYRICS_READING_SET_LINE_FAILED',
          },
          publicError: {
            code: 'LYRICS_READING_SET_LINE_FAILED',
            context: { retryable: true },
          },
        },
        () => {
          const result = setReadingLineText(
            trackDir,
            sourceFilename,
            identity,
            readingKana,
          );
          if (!result) throw new Error('unable to update reading line');
          return result;
        },
      );

      notifyLibraryUpdated();
      return updated;
    },
  );

  ipcMain.handle(
    'lyrics:delete-reading',
    async (event, trackId, sourceFilename) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = requireTrackDir(dir, trackId, resolveReadingTrackDir);

      await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-reading',
            operation: 'delete',
            code: 'LYRICS_READING_DELETE_FAILED',
          },
          publicError: {
            code: 'LYRICS_READING_DELETE_FAILED',
            context: { retryable: true },
          },
        },
        () => deleteReadingForTrack(trackDir, sourceFilename),
      );

      notifyLibraryUpdated();
      return { ok: true };
    },
  );
}

module.exports = {
  registerLyricsReadingHandlers,
  validateReadingIdentity,
};
