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
          context: { retryable: true },
        },
      },
      () => manager.open(kind),
    );
  });
}

module.exports = { registerOutputWindowHandlers };
