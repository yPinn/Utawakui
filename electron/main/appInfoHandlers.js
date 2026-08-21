'use strict';

function registerAppInfoHandlers({ ipcMain, getVersion }) {
  ipcMain.handle('app:get-version', async () => getVersion());
}

module.exports = { registerAppInfoHandlers };
