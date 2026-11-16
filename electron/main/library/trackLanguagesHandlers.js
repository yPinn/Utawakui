'use strict';

const {
  createTrackLanguagesService,
} = require('../../lib/library/trackLanguages');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const { t } = require('../../lib/i18n');

function registerLibraryTrackLanguagesHandlers({
  ipcMain,
  getLibraryContext,
  recordDiagnostic,
}) {
  const service = createTrackLanguagesService({ getLibraryContext });
  const run = (operation, action) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'track-languages',
          operation,
          code: 'TRACK_LANGUAGES_FAILED',
        },
        publicError: {
          code: 'TRACK_LANGUAGES_FAILED',
          message: t('errors.TRACK_LANGUAGES_FAILED.message'),
        },
      },
      async () => {
        try {
          return { ok: true, ...(await action()) };
        } catch (error) {
          if (error.languageStatus)
            return { ok: false, status: error.languageStatus };
          throw error;
        }
      },
    );
  ipcMain.handle('library:track-languages-get', (_event, trackId) =>
    run('get', () => service.get(trackId)),
  );
  ipcMain.handle(
    'library:track-languages-save',
    (_event, trackId, token, languages, primary) =>
      run('save', () => service.save({ trackId, token, languages, primary })),
  );
}

module.exports = { registerLibraryTrackLanguagesHandlers };
