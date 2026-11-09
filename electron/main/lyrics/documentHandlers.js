'use strict';

const { t } = require('../../lib/i18n');
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
const { isBoundedTrackId } = require('../../lib/library/paths');
const {
  createLyricsSourceSessions,
} = require('../../lib/library/lyricsSourceSessions');
const {
  createLyricsTimingReview,
} = require('../../lib/library/lyricsTimingReview');
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const { registerLyricsExportHandlers } = require('./exportHandlers');

function registerLyricsDocumentHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  getLibraryContext,
  getLinkedLyricsReference,
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
        message: t('errors.LYRICS_SOURCE_INVALID.message'),
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
              ? t('errors.LYRICS_SOURCE_UNUSABLE.message')
              : t('errors.LYRICS_SOURCE_STALE.message'),
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
            message: t('errors.LYRICS_SOURCE_FAILED.message'),
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
  registerLyricsExportHandlers({
    ipcMain,
    sources: sourceSessions,
    sourceOperation,
    dialog,
    getMainWindow,
  });
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
  ipcMain.handle('lyrics:get-track', async (event, trackId, filename, mode) => {
    return sourceOperation(event, 'load', () =>
      mode === 'reference' || mode === 'reference-timed'
        ? sourceSessions.readReference(trackId, filename, {
            timed: mode === 'reference-timed',
          })
        : sourceSessions.open(trackId, filename),
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

  ipcMain.handle('lyrics:fork-authored', (event, trackId, filename, session) =>
    sourceOperation(event, 'fork-authored', () => {
      const saved = sourceSessions.forkAuthored(trackId, filename, session);
      notifyLibraryUpdated();
      return saved;
    }),
  );
  ipcMain.handle(
    'lyrics:copy-linked-reference',
    (event, trackId, referenceId, filename) =>
      sourceOperation(event, 'copy-linked-reference', async () => {
        if (!isBoundedTrackId(trackId) || !isBoundedTrackId(referenceId))
          throw createAppError({
            code: 'LYRICS_SOURCE_INVALID',
            message: t('errors.LYRICS_SOURCE_INVALID.message'),
          });
        const scope = getLibraryContext?.();
        const confirmed = scope
          ? await getLinkedLyricsReference?.(scope.dir, trackId)
          : null;
        const current = getLibraryContext?.();
        if (
          confirmed !== referenceId ||
          current?.dir !== scope?.dir ||
          current?.epoch !== scope?.epoch
        )
          throw createAppError({
            code: 'LYRICS_SOURCE_STALE',
            message: t('errors.LYRICS_SOURCE_STALE.message'),
          });
        const saved = sourceSessions.copyLinkedReference(
          trackId,
          confirmed,
          filename,
        );
        notifyLibraryUpdated();
        return saved;
      }),
  );
  ipcMain.handle(
    'lyrics:edit-authored',
    (event, trackId, filename, session, edit) =>
      sourceOperation(event, 'edit-authored', () => {
        const saved = sourceSessions.editAuthored(
          trackId,
          filename,
          session,
          edit,
        );
        notifyLibraryUpdated();
        return saved;
      }),
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
      title: t('lyricsAcquisition.importFileTitle'),
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
