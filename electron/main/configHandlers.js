'use strict';

const { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } = require('../lib/config');
const {
  buildFeatureConfirmation,
  normalizeFeatureConfirmations,
} = require('../lib/featureGates');

function registerConfigHandlers({
  ipcMain,
  dialog,
  shell,
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

  // shell.openPath resolves (never rejects) with an empty string on
  // success or an OS error string on failure — surfacing that as a thrown
  // error keeps this handler's failure shape consistent with every other
  // handler in this file.
  ipcMain.handle('config:open-download-dir', async () => {
    const error = await shell.openPath(resolveDownloadDir(getConfig()));
    if (error) throw new Error(error);
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

  ipcMain.handle(
    'config:get-capture-device',
    async () => getConfig().captureDeviceId,
  );

  // Same untrusted-input trust boundary as config:set-ui-theme above. `null`
  // clears the setting (feature off); anything else must be a device id
  // string — device *existence* is not verifiable from main (device list is
  // a renderer-only Web API), so that's left to useAudioOutput.js at apply
  // time, same as an unplugged device failing later rather than up front.
  ipcMain.handle('config:set-capture-device', async (event, deviceId) => {
    if (deviceId !== null && typeof deviceId !== 'string') {
      throw new Error(`invalid capture device id: ${deviceId}`);
    }
    updateConfig({ captureDeviceId: deviceId });
    return getConfig().captureDeviceId;
  });

  // shell.openExternal launches the OS default browser — a plain <a href>
  // in the renderer is inert here (main.js's setWindowOpenHandler denies
  // all new windows, and will-navigate blocks any non-same-document URL),
  // so this is the only way a Vue component can send someone to a vendor
  // download page (see VirtualCableGuideModal.vue's only caller). https-only
  // is deliberate, same untrusted-input posture as the setters above: this
  // channel only ever receives hardcoded vendor URLs today, but validating
  // the scheme rather than trusting it costs nothing and rules out
  // javascript:/file:/custom schemes outright.
  ipcMain.handle('shell:open-external', async (event, url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`invalid url: ${url}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`unsupported url scheme: ${parsed.protocol}`);
    }
    await shell.openExternal(url);
  });
}

module.exports = { registerConfigHandlers };
