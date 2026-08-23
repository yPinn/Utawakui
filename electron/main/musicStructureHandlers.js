'use strict';

const { loadTrackMusicStructure } = require('../lib/library');

function registerMusicStructureHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  loadMusicStructure = loadTrackMusicStructure,
}) {
  ipcMain.handle('music-structure:get-track', async (event, trackId) =>
    loadMusicStructure(resolveDownloadDir(getConfig()), trackId),
  );
}

module.exports = { registerMusicStructureHandlers };
