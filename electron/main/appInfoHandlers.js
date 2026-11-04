'use strict';

function registerAppInfoHandlers({
  ipcMain,
  getVersion,
  relaunch,
  getRestartImpact = () => ({}),
}) {
  ipcMain.handle('app:get-version', async () => getVersion());
  // What a restart would interrupt, so the renderer can warn before it.
  ipcMain.handle('app:get-restart-impact', async () => {
    const impact = getRestartImpact();
    return {
      separation: impact.separation === true,
      output: ['resumes', 'stops'].includes(impact.output)
        ? impact.output
        : 'none',
    };
  });
  // Quits through the normal path, so before-quit cleanup still runs.
  ipcMain.handle('app:relaunch', async () => {
    relaunch();
    return true;
  });
}

module.exports = { registerAppInfoHandlers };
