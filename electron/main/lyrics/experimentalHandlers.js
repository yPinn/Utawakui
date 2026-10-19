'use strict';
const {
  isBoundedTrackId,
  isLyricsSubtitleFilename,
} = require('../../lib/library/paths');
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
function registerLyricsExperimentalHandlers({
  ipcMain,
  queue,
  loadEstimate,
  recordDiagnostic,
}) {
  for (const operation of ['status', 'enable', 'cancel', 'retry', 'estimate']) {
    ipcMain.handle(
      `lyrics-experimental:${operation}`,
      async (_event, ...args) => {
        const valid =
          operation === 'status'
            ? args.length === 0
            : operation === 'enable'
              ? args.length === 1 && typeof args[0] === 'boolean'
              : operation === 'estimate'
                ? args.length === 2 &&
                  isBoundedTrackId(args[0]) &&
                  typeof args[1] === 'string' &&
                  args[1].length <= 240 &&
                  isLyricsSubtitleFilename(args[1])
                : args.length === 1 && isBoundedTrackId(args[0]);
        if (!valid)
          throw createAppError({
            code: 'LYRICS_EXPERIMENTAL_INVALID_INTENT',
            message: '詞塊分析操作格式不正確。',
            source: 'lyrics-experimental',
          });
        return runDiagnosticIpcOperation(
          {
            recordDiagnostic,
            diagnostic: {
              source: 'lyrics-experimental',
              operation,
              code: 'LYRICS_EXPERIMENTAL_FAILED',
            },
            publicError: {
              code: 'LYRICS_EXPERIMENTAL_FAILED',
              message: '詞塊分析未完成；伴奏與原有歌詞仍可使用。',
              source: 'lyrics-experimental',
            },
          },
          () =>
            operation === 'enable'
              ? queue.setEnabled(args[0])
              : operation === 'retry'
                ? { queued: queue.enqueue(args[0]) }
                : operation === 'estimate'
                  ? loadEstimate(...args)
                  : queue[operation](...args),
        );
      },
    );
  }
}
module.exports = { registerLyricsExperimentalHandlers };
