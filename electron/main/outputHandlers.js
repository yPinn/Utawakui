'use strict';

const {
  loadOutputProfiles,
  selectOutputProfile,
  upsertOutputProfile,
} = require('../lib/outputProfiles');

function registerOutputHandlers({
  ipcMain,
  server,
  requireFeatureGate,
  featureIds,
  getConfig,
  resolveDownloadDir,
}) {
  function outputDir() {
    return resolveDownloadDir(getConfig());
  }

  ipcMain.handle('output:get-status', async () => server.getStatus());

  ipcMain.handle('output:start', async () => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    return server.start();
  });

  ipcMain.handle('output:stop', async () => {
    await server.stop();
    return server.getStatus();
  });

  ipcMain.handle('output:publish', async (event, snapshot) => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    if (!server.getStatus().running) return false;
    return server.publish(snapshot);
  });

  ipcMain.handle('output-profiles:list', async () => {
    return loadOutputProfiles(outputDir());
  });

  ipcMain.handle('output-profiles:upsert', async (event, profile) => {
    return upsertOutputProfile(outputDir(), profile);
  });

  ipcMain.handle('output-profiles:select', async (event, profileId) => {
    return selectOutputProfile(outputDir(), profileId);
  });
}

module.exports = { registerOutputHandlers };
