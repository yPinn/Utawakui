'use strict';

const {
  findTrackRecord,
  getTrackLyricsState,
  importManualLyricsFile,
  importManualLyricsText,
  loadTrackLyricsManifest,
  readTrackLyrics,
  resolveTrackDir,
  setLyricsSourceLabel,
  setLyricsSourcePreference,
} = require('../../lib/library');
const { deleteStoredBetterLyricsSource } = require('../../lib/betterlyrics');
const { deleteStoredLrclibSource } = require('../../lib/lrclib');
const { deleteStoredNeteaseSource } = require('../../lib/netease');
const { deleteStoredKugouSource } = require('../../lib/kugou/storage.js');
const {
  loadTrackVocalRoles,
  saveTrackVocalRoles,
} = require('../../lib/library/lyricsVocalRoles');
const {
  createLyricsSourceSessions,
} = require('../../lib/library/lyricsSourceSessions');
const {
  createLyricsTimingReview,
} = require('../../lib/library/lyricsTimingReview');
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');

function registerLyricsDocumentHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  getLibraryContext,
  recordDiagnostic,
}) {
  let timingReview;
  const sourceSessions = createLyricsSourceSessions({
    beforeMutation: (value) => timingReview.invalidate(value),
    getContext:
      getLibraryContext ??
      (() => ({ dir: resolveDownloadDir(getConfig()), epoch: 0 })),
  });
  timingReview = createLyricsTimingReview({ sources: sourceSessions });
  async function sourceOperation(event, operation, run) {
    const window = getMainWindow();
    if (
      !window ||
      window.isDestroyed() ||
      event?.sender !== window.webContents ||
      event?.senderFrame !== window.webContents.mainFrame
    )
      throw createAppError({
        code: 'LYRICS_SOURCE_INVALID',
        message: '無法執行這個歌詞來源操作。',
      });
    try {
      return await run();
    } catch (error) {
      if (
        [
          'LYRICS_SOURCE_INVALID',
          'LYRICS_SOURCE_CONFLICT',
          'LYRICS_SOURCE_STALE',
          'LYRICS_SOURCE_UNUSABLE',
        ].includes(error.code)
      )
        throw createAppError({
          code: error.code,
          severity: 'warning',
          message:
            error.code === 'LYRICS_SOURCE_UNUSABLE'
              ? '這份歌詞時間資料無法保存，請先檢查來源版本。'
              : '歌詞來源或保存版本已變更，請重新讀取後再試一次。',
        });
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-source',
            operation,
            code: 'LYRICS_SOURCE_FAILED',
          },
          publicError: {
            code: 'LYRICS_SOURCE_FAILED',
            message: '歌詞來源操作未完成，請再試一次。',
            context: { retryable: true },
          },
        },
        () => {
          throw error;
        },
      );
    }
  }
  function vocalSource(trackId, filename) {
    const dir = resolveDownloadDir(getConfig());
    if (
      !findTrackRecord(dir, trackId) ||
      !readTrackLyrics(dir, trackId, filename)
    )
      throw new Error('unknown lyrics source');
    return resolveTrackDir(dir, trackId);
  }
  ipcMain.handle(
    'lyrics:get-vocal-roles',
    (_event, trackId, filename, documentId) =>
      loadTrackVocalRoles(vocalSource(trackId, filename), filename, documentId),
  );
  ipcMain.handle(
    'lyrics:save-vocal-roles',
    (_event, trackId, filename, documentId, revision, assignments) =>
      saveTrackVocalRoles(
        vocalSource(trackId, filename),
        filename,
        documentId,
        revision,
        assignments,
      ),
  );
  ipcMain.handle('lyrics:get-track', async (event, trackId, filename) => {
    return sourceOperation(event, 'load', () =>
      sourceSessions.open(trackId, filename),
    );
  });
  ipcMain.handle('lyrics:cancel-source-session', (event, id) =>
    sourceOperation(event, 'cancel', () => sourceSessions.cancel(id)),
  );
  ipcMain.handle('lyrics:cancel-timing-review', (event, token) =>
    sourceOperation(event, 'cancel-review', () => timingReview.cancel(token)),
  );
  for (const [channel, method] of [
    ['lyrics:get-timing-review', 'get'],
    ['lyrics:confirm-timing-review', 'confirm'],
    ['lyrics:revoke-timing-review', 'revoke'],
  ]) {
    ipcMain.handle(channel, (event, trackId, filename, session, token) =>
      sourceOperation(event, method, () =>
        timingReview[method](trackId, filename, session, token),
      ),
    );
  }

  ipcMain.handle(
    'lyrics:save-timing',
    async (
      event,
      trackId,
      sourceFilename,
      expectedSourceFingerprint,
      document,
      sourceSession,
    ) => {
      return sourceOperation(event, 'save-timing', () => {
        const saved = sourceSessions.saveTiming(
          trackId,
          sourceFilename,
          expectedSourceFingerprint,
          document,
          sourceSession,
        );
        notifyLibraryUpdated();
        return saved;
      });
    },
  );

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

  ipcMain.handle(
    'lyrics:set-source-offset',
    async (event, trackId, filename, offsetMs, sourceSession) => {
      return sourceOperation(event, 'save-offset', () =>
        sourceSessions.saveOffset(trackId, filename, offsetMs, sourceSession),
      );
    },
  );

  ipcMain.handle(
    'lyrics:set-preferred-source',
    async (event, trackId, filename) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const state = setLyricsSourcePreference(trackDir, filename, 'user');
      if (!state) throw new Error('unknown lyrics source');

      notifyLibraryUpdated();
      return state;
    },
  );

  ipcMain.handle('lyrics:delete-source', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    const source = loadTrackLyricsManifest(trackDir).sources.find(
      (candidate) => candidate.filename === filename,
    );
    const deleteSource =
      {
        betterlyrics: deleteStoredBetterLyricsSource,
        netease: deleteStoredNeteaseSource,
        kugou: deleteStoredKugouSource,
      }[source?.provider?.name] || deleteStoredLrclibSource;
    if (!deleteSource(trackDir, filename)) {
      throw new Error(`unable to delete lyrics source: ${filename}`);
    }

    notifyLibraryUpdated();
    return { sources: getTrackLyricsState(trackDir).sources };
  });

  ipcMain.handle('lyrics:import-text', async (event, trackId, payload) => {
    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const result = importManualLyricsText(trackDir, payload);
    if (!result) throw new Error('unable to import manual lyrics');
    setLyricsSourcePreference(trackDir, result.source.filename, 'user');

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
    setLyricsSourcePreference(trackDir, result.source.filename, 'user');

    notifyLibraryUpdated();
    return result;
  });
  return sourceSessions;
}

module.exports = { registerLyricsDocumentHandlers };
