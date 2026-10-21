'use strict';

const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerOutputWindowHandlers({
  ipcMain,
  manager,
  requireFeatureGate,
  featureId,
  recordDiagnostic,
}) {
  ipcMain.handle('output-window:open', async (_event, kind) => {
    // Expected gate-disabled state is not an operational diagnostic.
    requireFeatureGate(featureId);
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'output-window',
          operation: 'open',
          code: 'OUTPUT_WINDOW_OPEN_FAILED',
        },
        publicError: {
          code: 'OUTPUT_WINDOW_OPEN_FAILED',
          title: '輸出視窗未開啟',
          message: '請確認輸出服務已啟動，再重試開啟視窗。',
          context: { retryable: true },
        },
      },
      () => manager.open(kind),
    );
  });
}

module.exports = { registerOutputWindowHandlers };
