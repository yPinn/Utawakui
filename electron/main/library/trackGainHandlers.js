'use strict';

const { createTrackGainService } = require('../../lib/library/trackGain');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const { t } = require('../../lib/i18n');

function registerLibraryTrackGainHandlers({
  ipcMain,
  getLibraryContext,
  recordDiagnostic,
}) {
  const service = createTrackGainService({ getLibraryContext });
  const run = (operation, action) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'track-gain',
          operation,
          code: 'TRACK_GAIN_FAILED',
        },
        publicError: {
          code: 'TRACK_GAIN_FAILED',
          message: t('errors.TRACK_GAIN_FAILED.message'),
        },
      },
      async () => {
        try {
          return { ok: true, ...(await action()) };
        } catch (error) {
          if (error.gainStatus) return { ok: false, status: error.gainStatus };
          throw error;
        }
      },
    );
  ipcMain.handle('library:track-gain-get', (_event, trackId) =>
    run('get', () => service.get(trackId)),
  );
  ipcMain.handle('library:track-gain-save', (_event, trackId, token, gainDb) =>
    run('save', () => service.save({ trackId, token, gainDb })),
  );
}

module.exports = { registerLibraryTrackGainHandlers };
