'use strict';

const { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } = require('../lib/config');
const {
  buildFeatureConfirmation,
  normalizeFeatureConfirmations,
} = require('../lib/featureGates');

function registerConfigHandlers({
  ipcMain,
  dialog,
  getConfig,
  updateConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  titlebarColors,
}) {
  ipcMain.handle('config:get', async () => {
    return {
      downloadDir: resolveDownloadDir(getConfig()),
      isDefault: !getConfig().downloadDir,
    };
  });

  ipcMain.handle('feature-gates:list', async () => {
    return normalizeFeatureConfirmations(getConfig().featureConfirmations);
  });

  ipcMain.handle(
    'feature-gates:confirm',
    async (event, featureId, noticeVersion) => {
      const record = buildFeatureConfirmation(featureId);
      if (noticeVersion !== record.noticeVersion) {
        throw new Error(`stale feature notice: ${featureId}`);
      }
      updateConfig({
        featureConfirmations: {
          ...getConfig().featureConfirmations,
          [featureId]: record,
        },
      });
      return record;
    },
  );

  ipcMain.handle('config:choose-download-dir', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return resolveDownloadDir(getConfig());
    }
    updateConfig({
      downloadDir: result.filePaths[0],
    });
    // Invalidates both the renderer's track list AND usePlaylists.js's
    // module-scope playlist cache — that composable survives Setlist tab
    // switches, so without this push it would keep the old dir's
    // playlists and silently write them (with stale trackIds) into the
    // new dir on the next mutation.
    notifyLibraryUpdated();
    return result.filePaths[0];
  });

  ipcMain.handle('config:reset-download-dir', async () => {
    updateConfig({ downloadDir: null });
    notifyLibraryUpdated();
    return resolveDownloadDir(getConfig());
  });

  ipcMain.handle('config:get-ui-theme', async () => getConfig().uiTheme);

  ipcMain.handle('config:set-ui-theme', async (event, theme) => {
    // Untrusted renderer input — same trust-boundary role as
    // extractVideoId() for video ids.
    if (!Object.hasOwn(titlebarColors, theme)) {
      throw new Error(`invalid ui theme: ${theme}`);
    }
    updateConfig({ uiTheme: theme });
    const win = getMainWindow();
    if (win) {
      win.setTitleBarOverlay(titlebarColors[theme]);
      win.setBackgroundColor(titlebarColors[theme].color);
    }
    return getConfig().uiTheme;
  });

  ipcMain.handle(
    'config:get-sidebar-width',
    async () => getConfig().sidebarWidth,
  );

  // Same untrusted-input trust boundary as config:set-ui-theme above.
  ipcMain.handle('config:set-sidebar-width', async (event, width) => {
    if (
      !Number.isFinite(width) ||
      width < SIDEBAR_WIDTH_MIN ||
      width > SIDEBAR_WIDTH_MAX
    ) {
      throw new Error(`invalid sidebar width: ${width}`);
    }
    updateConfig({ sidebarWidth: width });
    return getConfig().sidebarWidth;
  });
}

module.exports = { registerConfigHandlers };
