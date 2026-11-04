'use strict';

const { createAppError } = require('../lib/appError');
const { LOGIN_FILE_ERRORS } = require('../lib/youtubeLoginStore');
const { YOUTUBE_LOGIN_SOURCES } = require('../lib/youtubeAttempts');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

// Bump when the first-import notice changes so it shows once more.
const YOUTUBE_LOGIN_NOTICE_VERSION = 'youtube-login-notice-v1';

// Store errors the user can fix; anything else becomes a retry message.
const USER_FILE_ERRORS = new Map([
  [LOGIN_FILE_ERRORS.FORMAT, LOGIN_FILE_ERRORS.FORMAT],
  [LOGIN_FILE_ERRORS.TOO_LARGE, LOGIN_FILE_ERRORS.FORMAT],
  [LOGIN_FILE_ERRORS.NO_YOUTUBE, LOGIN_FILE_ERRORS.NO_YOUTUBE],
  [
    LOGIN_FILE_ERRORS.STORAGE_UNAVAILABLE,
    LOGIN_FILE_ERRORS.STORAGE_UNAVAILABLE,
  ],
]);

function registerYoutubeLoginHandlers({
  ipcMain,
  store,
  dialog,
  getMainWindow,
  getConfig,
  updateConfig,
  recordDiagnostic,
}) {
  const run = (operation, code, work) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: { source: 'youtube-login', operation, code },
        publicError: { code },
      },
      work,
    );

  function status() {
    return {
      ...store.getStatus(),
      noticeAcknowledged:
        getConfig().youtubeLoginNoticeVersion === YOUTUBE_LOGIN_NOTICE_VERSION,
    };
  }

  ipcMain.handle('config:get-youtube-login-source', async () =>
    run(
      'get-source',
      'YOUTUBE_LOGIN_SOURCE_READ_FAILED',
      () => getConfig().youtubeLoginSource,
    ),
  );

  ipcMain.handle('config:set-youtube-login-source', async (_event, source) => {
    if (!YOUTUBE_LOGIN_SOURCES.includes(source)) {
      throw createAppError({
        code: 'YOUTUBE_LOGIN_SOURCE_INVALID',
        severity: 'warning',
      });
    }
    return run('set-source', 'YOUTUBE_LOGIN_SOURCE_UPDATE_FAILED', () => {
      updateConfig({ youtubeLoginSource: source });
      return getConfig().youtubeLoginSource;
    });
  });

  ipcMain.handle('youtube-login:get-status', async () =>
    run('get-status', 'YOUTUBE_LOGIN_STATUS_FAILED', status),
  );

  // The file is chosen in Main; the renderer never sees its path or content.
  ipcMain.handle('youtube-login:import', async (_event, request) => {
    if (request?.acknowledgeNotice === true) {
      updateConfig({ youtubeLoginNoticeVersion: YOUTUBE_LOGIN_NOTICE_VERSION });
    }
    if (!status().noticeAcknowledged) {
      throw createAppError({
        code: 'YOUTUBE_LOGIN_NOTICE_REQUIRED',
        severity: 'warning',
      });
    }
    const picked = await dialog.showOpenDialog(getMainWindow?.() ?? undefined, {
      properties: ['openFile'],
      filters: [{ name: 'cookies.txt', extensions: ['txt'] }],
    });
    const filePath = picked?.canceled ? null : picked?.filePaths?.[0];
    if (!filePath) return { ...status(), canceled: true };

    let userError = null;
    await run('import', 'YOUTUBE_LOGIN_IMPORT_FAILED', () => {
      try {
        store.importFile(filePath);
      } catch (error) {
        userError = USER_FILE_ERRORS.get(error?.code) ?? null;
        if (!userError) throw error;
      }
    });
    if (userError)
      throw createAppError({ code: userError, severity: 'warning' });
    return status();
  });

  ipcMain.handle('youtube-login:remove', async () =>
    run('remove', 'YOUTUBE_LOGIN_REMOVE_FAILED', () => {
      store.remove();
      return status();
    }),
  );
}

module.exports = { YOUTUBE_LOGIN_NOTICE_VERSION, registerYoutubeLoginHandlers };
