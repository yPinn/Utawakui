'use strict';

const {
  createTrackStyleTagsService,
} = require('../../lib/library/trackStyleTags');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const { t } = require('../../lib/i18n');

function registerLibraryTrackStyleTagsHandlers({
  ipcMain,
  dialog,
  getMainWindow,
  getLibraryContext,
  recordDiagnostic,
}) {
  const service = createTrackStyleTagsService({
    getLibraryContext,
    onCandidateReadError: (error) =>
      recordDiagnostic?.({
        process: 'main',
        level: 'error',
        source: 'track-style-tags',
        operation: 'read-candidates',
        code: 'TRACK_STYLE_TAGS_FAILED',
        error,
      }),
  });
  const run = (operation, action) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'track-style-tags',
          operation,
          code: 'TRACK_STYLE_TAGS_FAILED',
        },
        publicError: {
          code: 'TRACK_STYLE_TAGS_FAILED',
          message: t('errors.TRACK_STYLE_TAGS_FAILED.message'),
        },
      },
      async () => {
        try {
          return { ok: true, ...(await action()) };
        } catch (error) {
          if (error.styleStatus)
            return { ok: false, status: error.styleStatus };
          throw error;
        }
      },
    );
  ipcMain.handle('library:track-style-tags-get', (_event, trackId) =>
    run('get', () => service.get(trackId)),
  );
  ipcMain.handle('library:track-style-tags-preview-adoption', () =>
    run('preview-adoption', service.previewAdoption),
  );
  ipcMain.handle(
    'library:track-style-tags-apply-adoption',
    (_event, previewId, trackIds) =>
      run('apply-adoption', () => service.applyAdoption(previewId, trackIds)),
  );
  ipcMain.handle(
    'library:track-style-tags-save',
    (_event, trackId, token, tags, dismissed) =>
      run('save', () => service.save({ trackId, token, tags, dismissed })),
  );
  ipcMain.handle('library:track-style-tags-import', () =>
    run('import', async () => {
      const scope = getLibraryContext();
      const window = getMainWindow();
      if (!window || window.isDestroyed()) return { canceled: true };
      const selection = await dialog.showOpenDialog(window, {
        title: t('trackStyle.importCandidates'),
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selection.canceled || !selection.filePaths[0])
        return { canceled: true };
      return service.importCandidates(selection.filePaths[0], scope);
    }),
  );
}

module.exports = { registerLibraryTrackStyleTagsHandlers };
