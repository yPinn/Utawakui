'use strict';
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
          message: '研究試用操作格式不正確。',
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
            title: '本機歌詞研究試用',
            message:
              '研究操作未完成；請確認 FFmpeg 已準備，或重新下載修復研究環境。原有歌詞仍可使用。',
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
