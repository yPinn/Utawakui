'use strict';

const { createAppError } = require('../lib/appError');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

const EXTERNAL_TARGETS = Object.freeze({
  'vb-cable': 'https://vb-audio.com/Cable/',
  voicemeeter: 'https://vb-audio.com/Voicemeeter/',
  // The public update feed identity (see electron-builder.yml's
  // provider/owner/repo and ADR 0007) — the release list page, not a
  // deep link to one version, so no version-string validation is needed.
  'release-notes': 'https://github.com/yPinn/Utawakui-Releases/releases',
});

function registerExternalNavigationHandlers({
  ipcMain,
  openExternal,
  recordDiagnostic,
}) {
  ipcMain.handle('shell:open-external', async (event, targetId) => {
    if (!Object.hasOwn(EXTERNAL_TARGETS, targetId)) {
      throw createAppError({
        code: 'EXTERNAL_TARGET_UNKNOWN',
        severity: 'warning',
        title: '無法開啟外部頁面',
        message: '指定的外部頁面不受支援。',
      });
    }

    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'external-navigation',
          operation: 'open',
          code: 'EXTERNAL_TARGET_OPEN_FAILED',
          context: { targetId },
        },
        publicError: {
          code: 'EXTERNAL_TARGET_OPEN_FAILED',
          title: '無法開啟外部頁面',
          message: '目前無法開啟外部頁面，請稍後再試。',
        },
      },
      () => openExternal(EXTERNAL_TARGETS[targetId]),
    );
  });
}

module.exports = {
  EXTERNAL_TARGETS,
  registerExternalNavigationHandlers,
};
