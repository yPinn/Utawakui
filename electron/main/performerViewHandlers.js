'use strict';

function registerPerformerViewHandlers({ ipcMain, manager }) {
  ipcMain.handle('performer-view:open', (event, snapshot) => {
    manager.publish(snapshot);
    return manager.open();
  });
  ipcMain.handle('performer-view:publish', (event, snapshot) =>
    manager.publish(snapshot),
  );
  ipcMain.handle('performer-view:get-status', () => manager.getStatus());
  ipcMain.handle('performer-view:get-snapshot', () => manager.getSnapshot());
  ipcMain.handle('performer-view:close', () => manager.close());
  ipcMain.handle('performer-view:minimize', () => manager.minimize());
  ipcMain.handle('performer-view:toggle-full-screen', () =>
    manager.toggleFullScreen(),
  );
  ipcMain.handle('performer-view:toggle-always-on-top', () =>
    manager.toggleAlwaysOnTop(),
  );
}

module.exports = { registerPerformerViewHandlers };
