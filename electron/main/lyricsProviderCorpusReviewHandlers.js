'use strict';

const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function reviewErrorOptions(recordDiagnostic, operation) {
  const base = {
    recordDiagnostic,
    diagnostic: {
      source: 'lyrics-provider-review',
      operation,
      code: `LYRICS_PROVIDER_REVIEW_${operation.toUpperCase()}_FAILED`,
    },
  };
  if (operation === 'load') {
    return {
      ...base,
      publicError: {
        code: 'LYRICS_PROVIDER_REVIEW_LOAD_FAILED',
        title: 'Lyrics provider review unavailable',
        message: 'lyrics provider review could not be loaded',
      },
    };
  }
  if (operation === 'save') {
    return {
      ...base,
      publicError: {
        code: 'LYRICS_PROVIDER_REVIEW_SAVE_FAILED',
        title: 'Lyrics provider review save failed',
        message: 'lyrics provider review decision could not be saved',
      },
    };
  }
  if (operation === 'lookup') {
    return {
      ...base,
      publicError: {
        code: 'LYRICS_PROVIDER_REVIEW_LOOKUP_FAILED',
        title: '查證動作未完成',
        message: '目前無法複製或開啟查證頁面，請重試。',
      },
    };
  }
  return {
    ...base,
    publicError: {
      code: 'LYRICS_PROVIDER_REVIEW_EXPORT_FAILED',
      title: 'Lyrics provider review export unavailable',
      message: 'lyrics provider review corpus is not ready to export',
    },
  };
}

function registerLyricsProviderCorpusReviewHandlers({
  ipcMain,
  enabled,
  service,
  recordDiagnostic,
  writeClipboardText,
  openExternal,
}) {
  if (!enabled) return false;

  ipcMain.handle('lyrics-provider-review:load', () =>
    runDiagnosticIpcOperation(
      reviewErrorOptions(recordDiagnostic, 'load'),
      () => service.load(),
    ),
  );
  ipcMain.handle('lyrics-provider-review:save-decision', (event, intent) =>
    runDiagnosticIpcOperation(
      reviewErrorOptions(recordDiagnostic, 'save'),
      () => service.saveDecision(intent),
    ),
  );
  ipcMain.handle('lyrics-provider-review:export', () =>
    runDiagnosticIpcOperation(
      reviewErrorOptions(recordDiagnostic, 'export'),
      () => service.exportCorpus(),
    ),
  );
  ipcMain.handle('lyrics-provider-review:lookup-action', (event, intent) =>
    runDiagnosticIpcOperation(
      reviewErrorOptions(recordDiagnostic, 'lookup'),
      async () => {
        const resolved = await service.resolveLookupAction(intent);
        if (resolved.effect === 'copy') {
          if (typeof writeClipboardText !== 'function') {
            throw new Error('review clipboard unavailable');
          }
          await writeClipboardText(resolved.value);
        } else if (resolved.effect === 'open-external') {
          if (typeof openExternal !== 'function') {
            throw new Error('review external navigation unavailable');
          }
          await openExternal(resolved.value);
        } else {
          throw new Error('review lookup effect is invalid');
        }
        return { completed: true, action: intent?.action };
      },
    ),
  );
  return true;
}

module.exports = { registerLyricsProviderCorpusReviewHandlers };
