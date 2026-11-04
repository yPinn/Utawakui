'use strict';

const { createAppError } = require('../lib/appError');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const { releaseRepository } = require('../../shared/appUpdateValues.json');

const EXTERNAL_TARGETS = Object.freeze({
  'vb-cable': 'https://vb-audio.com/Cable/',
  voicemeeter: 'https://vb-audio.com/Voicemeeter/',
  'vb-audio-licensing': 'https://vb-audio.com/Services/licensing.htm',
  // The public update feed identity (see electron-builder.yml's
  // provider/owner/repo and ADR 0007) — the release list page, not a
  // deep link to one version, so no version-string validation is needed.
  'release-notes': `https://github.com/${releaseRepository}/releases`,
  // Author-run Discord server for announcements and user feedback
  // discussion — a fixed vendor invite link, not a per-user or expiring one.
  'community-discord': 'https://discord.gg/yJKddEtpNt',
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
