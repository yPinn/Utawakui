'use strict';

const path = require('path');
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

function runReadingWorker({ lines, script, onProgress }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, '..', '..', 'lib', 'lyricsReadingWorker.js'),
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
  runReadingWorker: runReadingWorkerImpl = runReadingWorker,
}) {
  ipcMain.handle(
    'lyrics:get-reading',
    async (event, trackId, sourceFilename, identity) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);
      validateReadingIdentity(
        readTrackLyrics(dir, trackId, sourceFilename),
        identity,
      );
      return loadTrackReadingForIdentity(trackDir, sourceFilename, identity);
    },
  );

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

      const key = `${trackId}::${sourceFilename}`;
      if (readingInProgress.has(key)) {
        throw new Error('已經在為這份歌詞產生讀音,請稍候。');
      }
      readingInProgress.add(key);
      try {
        const readingDoc = await runReadingWorkerImpl({
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
        });

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
  registerLyricsReadingHandlers,
  validateReadingIdentity,
};
