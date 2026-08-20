'use strict';

const {
  checkForUpdate: checkYtdlpUpdate,
  getStatus: getYtdlpStatus,
} = require('../lib/ytdlpStatus');

function registerYtdlpHandlers({ ipcMain, getConfig, updateConfig }) {
  ipcMain.handle('ytdlp:get-status', async () => ({
    ...(await getYtdlpStatus()),
    ...getConfig().ytdlpStatus,
  }));

  // Runs yt-dlp's own -U (check + apply in one step); not gated behind
  // provider-flow, same as library:refresh-metadata's maintenance action.
  ipcMain.handle('ytdlp:check-update', async () => {
    const result = await checkYtdlpUpdate();
    updateConfig({
      ytdlpStatus: {
        lastCheckedAt: new Date().toISOString(),
        lastKnownVersion: result.version,
        lastCheckResult: result.outcome,
      },
    });
    return {
      ...(await getYtdlpStatus()),
      ...getConfig().ytdlpStatus,
    };
  });
}

module.exports = { registerYtdlpHandlers };
