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
          title: '無法讀取功能確認狀態',
          message: '目前無法讀取功能確認狀態，請稍後再試。',
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
          title: '無法辨識功能',
          message: '指定的功能確認項目不存在。',
        });
      }
      if (noticeVersion !== gate.noticeVersion) {
        throw createAppError({
          code: 'FEATURE_GATE_NOTICE_STALE',
          severity: 'warning',
          title: '功能說明已更新',
          message: '功能說明已更新，請重新閱讀後再確認。',
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
            title: '無法儲存功能確認',
            message: '目前無法儲存功能確認，請稍後再試。',
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
