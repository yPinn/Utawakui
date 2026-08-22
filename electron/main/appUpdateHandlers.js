'use strict';

function registerAppUpdateHandlers({ ipcMain, service }) {
  ipcMain.handle('app-update:get-status', async () => service.getStatus());
  ipcMain.handle('app-update:check', async () => service.check());
  ipcMain.handle('app-update:download', async () => service.download());
  ipcMain.handle('app-update:install', async () => service.install());
}

module.exports = { registerAppUpdateHandlers };
