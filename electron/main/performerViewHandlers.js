'use strict';

const {
  isPerformerReadingScale,
  normalizePerformerReadingScale,
  parsePerformerLyricsOffsetIntent,
} = require('../../shared/performerViewContract.mjs');

function registerPerformerViewHandlers({
  ipcMain,
  manager,
  sendLyricsOffsetIntent = () => false,
  getConfig = () => ({}),
  updateConfig = () => {},
}) {
  ipcMain.handle('performer-view:open', (event, snapshot) => {
    manager.publish(snapshot);
    return manager.open();
  });
  ipcMain.handle('performer-view:publish', (event, snapshot) =>
    manager.publish(snapshot),
  );
  ipcMain.handle('performer-view:get-status', () => manager.getStatus());
  ipcMain.handle('performer-view:get-snapshot', () => manager.getSnapshot());
  ipcMain.handle('performer-view:adjust-lyrics-offset', (event, value) =>
    sendLyricsOffsetIntent(parsePerformerLyricsOffsetIntent(value)),
  );
  ipcMain.handle('performer-view:get-reading-scale', () =>
    normalizePerformerReadingScale(getConfig().performerReadingScale),
  );
  ipcMain.handle('performer-view:set-reading-scale', (event, value) => {
    if (!isPerformerReadingScale(value)) {
      throw new TypeError('Invalid performer reading scale');
    }
    updateConfig({ performerReadingScale: value });
    return value;
  });
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
