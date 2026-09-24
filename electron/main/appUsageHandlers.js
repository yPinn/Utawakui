'use strict';

function registerAppUsageHandlers({ ipcMain, service }) {
  ipcMain.handle('app-usage:get-status', async () => service.getStatus());
}

module.exports = { registerAppUsageHandlers };
