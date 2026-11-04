'use strict';

function registerAppInfoHandlers({ ipcMain, getVersion, relaunch }) {
  ipcMain.handle('app:get-version', async () => getVersion());
  // Quits through the normal path, so before-quit cleanup still runs.
  ipcMain.handle('app:relaunch', async () => {
    relaunch();
    return true;
  });
}

module.exports = { registerAppInfoHandlers };
