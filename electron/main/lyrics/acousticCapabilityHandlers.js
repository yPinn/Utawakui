'use strict';
const { createAppError } = require('../../lib/appError');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const unavailable = () => ({
  status: 'unavailable',
  installed: false,
  busy: false,
  canPrepare: false,
  canVerify: false,
  canRepair: false,
  canRemove: false,
  canCancel: false,
  blockReason: null,
  downloadBytes: null,
  installedBytesEstimate: 0,
});
function registerLyricsAcousticCapabilityHandlers({
  ipcMain,
  capability,
  requireFeatureGate,
  featureId,
  recordDiagnostic,
}) {
  for (const operation of [
    'status',
    'prepare',
    'verify',
    'repair',
    'remove',
    'cancel',
  ]) {
    ipcMain.handle(`lyrics-acoustic:${operation}`, async (_event, ...args) => {
      if (args.length)
        throw createAppError({
          code: 'LYRICS_ENV_INVALID_INTENT',
          message: '歌詞音訊輔助環境操作未完成。',
          source: 'lyrics-acoustic-environment',
        });
      if (operation === 'status')
        return capability?.getStatus() ?? unavailable();
      if (operation !== 'cancel') requireFeatureGate(featureId);
      if (!capability)
        return operation === 'cancel' ? { cancelled: false } : unavailable();
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'lyrics-acoustic-environment',
            operation,
            code: 'LYRICS_ENV_OPERATION_FAILED',
          },
          publicError: {
            code: 'LYRICS_ENV_OPERATION_FAILED',
            title: '歌詞音訊輔助',
            message: '歌詞音訊輔助環境操作未完成。',
            source: 'lyrics-acoustic-environment',
            context: { retryable: true },
          },
        },
        async () => {
          try {
            return await capability[operation]();
          } catch (error) {
            if (error.name === 'AbortError')
              return { ...capability.getStatus(), cancelled: true };
            if (error.code === 'LYRICS_ENV_BLOCKED')
              return capability.getStatus();
            throw error;
          }
        },
      );
    });
  }
}
module.exports = { registerLyricsAcousticCapabilityHandlers };
