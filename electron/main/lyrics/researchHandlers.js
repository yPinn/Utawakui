'use strict';
const { t } = require('../../lib/i18n');
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const { validateIntent } = require('../../lib/lyricsResearch/service');
function registerLyricsResearchHandlers({
  ipcMain,
  service,
  recordDiagnostic,
}) {
  for (const operation of [
    'status',
    'prepare',
    'verify',
    'remove',
    'cancel',
    'inspect',
    'preview',
  ]) {
    ipcMain.handle(`lyrics-research:${operation}`, async (_event, ...args) => {
      try {
        if (['inspect', 'preview'].includes(operation)) {
          if (args.length !== 1) throw Error('invalid arity');
          validateIntent(args[0]);
        } else if (args.length) throw Error('unexpected intent');
      } catch {
        throw createAppError({
          code: 'LYRICS_RESEARCH_INVALID_INTENT',
          message: t('errors.LYRICS_RESEARCH_INVALID_INTENT.message'),
          source: 'lyrics-research',
        });
      }
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-research',
            operation,
            code: 'LYRICS_RESEARCH_FAILED',
          },
          publicError: {
            code: 'LYRICS_RESEARCH_FAILED',
            source: 'lyrics-research',
            context: { retryable: true },
          },
        },
        () => service[operation](...args),
      );
    });
  }
}
module.exports = { registerLyricsResearchHandlers };
