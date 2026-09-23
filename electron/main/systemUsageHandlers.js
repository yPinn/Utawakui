'use strict';

function registerSystemUsageHandlers({ ipcMain, service }) {
  ipcMain.handle('system-usage:get-status', async () => service.getStatus());
}

module.exports = { registerSystemUsageHandlers };
