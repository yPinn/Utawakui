'use strict';

function registerSpoutOutputHandlers({
  ipcMain,
  runtime,
  requireFeatureGate,
  featureId,
}) {
  ipcMain.handle('spout-output:get-status', async () => runtime.getStatus());
  ipcMain.handle(
    'spout-output:set-frame-rate-profile',
    async (_event, frameRateProfile) => {
      requireFeatureGate(featureId);
      return runtime.setFrameRateProfile(frameRateProfile);
    },
  );
  ipcMain.handle('spout-output:start', async () => {
    requireFeatureGate(featureId);
    return runtime.start();
  });
  ipcMain.handle('spout-output:stop', async () => runtime.stop());
}

module.exports = { registerSpoutOutputHandlers };
