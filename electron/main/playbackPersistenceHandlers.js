'use strict';

function registerPlaybackPersistenceHandlers({ ipcMain, service }) {
  ipcMain.handle('playback-history:get', async () =>
    service.getRecentHistory(),
  );
  ipcMain.handle(
    'playback-history:record',
    async (_event, trackId, sourceContext) =>
      service.recordRecentPlayback(trackId, sourceContext),
  );
  ipcMain.handle('playback-history:get-source-recency', async () =>
    service.getSourceRecency(),
  );
  ipcMain.handle('playback-history:record-source', async (_event, sourceId) =>
    service.recordSourceUse(sourceId),
  );
  ipcMain.handle('playback-history:clear', async () =>
    service.clearRecentHistory(),
  );
  ipcMain.handle('playback-resume:get', async () =>
    service.getResumeSnapshot(),
  );
  ipcMain.handle('playback-resume:save', async (_event, snapshot) =>
    service.saveResumeSnapshot(snapshot),
  );
  ipcMain.handle('playback-usage:get-play-counts', async () =>
    service.getPlayCountByTrackId(),
  );
}

module.exports = { registerPlaybackPersistenceHandlers };
