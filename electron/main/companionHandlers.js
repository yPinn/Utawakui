'use strict';

const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

// Settings-side control of the paired-phone listener. Every change rechecks
// the gate in Main; reading status stays available so Settings can show "off".
function registerCompanionHandlers({
  ipcMain,
  runtime,
  requireFeatureGate,
  featureId,
  recordDiagnostic,
}) {
  const run = (operation, action, { gated = true } = {}) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'companion',
          operation,
          code: 'COMPANION_FAILED',
        },
        publicError: { code: 'COMPANION_FAILED' },
      },
      async () => {
        if (gated) requireFeatureGate(featureId);
        try {
          return { ok: true, ...(await action()) };
        } catch (error) {
          if (error.companionStatus)
            return { ok: false, status: error.companionStatus };
          throw error;
        }
      },
    );

  ipcMain.handle('companion:get-status', () =>
    run('get-status', () => runtime.status(), { gated: false }),
  );
  ipcMain.handle('companion:configure', (_event, input) =>
    run('configure', () => runtime.configure(input)),
  );
  ipcMain.handle('companion:begin-pairing', () =>
    run('begin-pairing', () => runtime.beginPairing()),
  );
  ipcMain.handle('companion:cancel-pairing', () =>
    run(
      'cancel-pairing',
      async () => {
        runtime.cancelPairing();
        return {};
      },
      { gated: false },
    ),
  );
  // Revocation never needs the gate: removing access must always work.
  ipcMain.handle('companion:revoke', (_event, deviceId) =>
    run('revoke', async () => ({ removed: runtime.revoke(deviceId) }), {
      gated: false,
    }),
  );
  ipcMain.handle('companion:revoke-all', () =>
    run('revoke-all', async () => ({ removed: runtime.revokeAll() }), {
      gated: false,
    }),
  );
}

module.exports = { registerCompanionHandlers };
