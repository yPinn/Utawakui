'use strict';

const { createAppError } = require('../lib/appError');
const {
  buildFeatureConfirmation,
  getFeatureGate,
  normalizeFeatureConfirmations,
} = require('../lib/featureGates');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerFeatureGateHandlers({
  ipcMain,
  getConfig,
  updateConfig,
  recordDiagnostic,
}) {
  ipcMain.handle('feature-gates:list', async () =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'feature-gates',
          operation: 'list',
          code: 'FEATURE_GATE_LIST_FAILED',
        },
        publicError: {
          code: 'FEATURE_GATE_LIST_FAILED',
        },
      },
      () => normalizeFeatureConfirmations(getConfig().featureConfirmations),
    ),
  );

  ipcMain.handle(
    'feature-gates:confirm',
    async (event, featureId, noticeVersion) => {
      const gate = getFeatureGate(featureId);
      if (!gate) {
        throw createAppError({
          code: 'FEATURE_GATE_UNKNOWN',
          severity: 'warning',
        });
      }
      if (noticeVersion !== gate.noticeVersion) {
        throw createAppError({
          code: 'FEATURE_GATE_NOTICE_STALE',
          severity: 'warning',
        });
      }

      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'feature-gates',
            operation: 'confirm',
            code: 'FEATURE_GATE_CONFIRM_FAILED',
            context: { featureId },
          },
          publicError: {
            code: 'FEATURE_GATE_CONFIRM_FAILED',
          },
        },
        () => {
          const record = buildFeatureConfirmation(featureId);
          updateConfig({
            featureConfirmations: {
              ...getConfig().featureConfirmations,
              [featureId]: record,
            },
          });
          return record;
        },
      );
    },
  );
}

module.exports = { registerFeatureGateHandlers };
