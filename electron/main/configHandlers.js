'use strict';

const { createAppError } = require('../lib/appError');
const {
  ANNOUNCEMENT_VERSION_MAX_LENGTH,
  CAPTURE_DEVICE_ID_MAX_LENGTH,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} = require('../lib/config');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function createValidationError(code, title, message) {
  return createAppError({ code, severity: 'warning', title, message });
}

function runConfigOperation(
  { recordDiagnostic, operation, code, title, message },
  handler,
) {
  return runDiagnosticIpcOperation(
    {
      recordDiagnostic,
      diagnostic: { source: 'config', operation, code },
      publicError: { code, title, message },
    },
    handler,
  );
}

function registerConfigHandlers({
  ipcMain,
  dialog,
  openPath,
  getConfig,
  updateConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  recordDiagnostic,
  titlebarColors,
  applyAppUpdateAutoCheck = () => undefined,
}) {
  ipcMain.handle('config:get', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-download-directory',
        code: 'DOWNLOAD_DIRECTORY_READ_FAILED',
        title: '無法讀取下載位置',
        message: '目前無法讀取下載位置，請稍後再試。',
      },
      () => {
        const config = getConfig();
        return {
          downloadDir: resolveDownloadDir(config),
          isDefault: !config.downloadDir,
        };
      },
    ),
  );

  ipcMain.handle('config:choose-download-dir', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'choose-download-directory',
        code: 'DOWNLOAD_DIRECTORY_CHOOSE_FAILED',
        title: '無法變更下載位置',
        message: '目前無法變更下載位置，請稍後再試。',
      },
      async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) {
          return resolveDownloadDir(getConfig());
        }
        updateConfig({ downloadDir: result.filePaths[0] });
        // Invalidates both renderer library state and the module-scope playlist
        // cache before either can write against the newly selected directory.
        notifyLibraryUpdated();
        return result.filePaths[0];
      },
    ),
  );

  ipcMain.handle('config:reset-download-dir', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'reset-download-directory',
        code: 'DOWNLOAD_DIRECTORY_RESET_FAILED',
        title: '無法重設下載位置',
        message: '目前無法重設下載位置，請稍後再試。',
      },
      () => {
        updateConfig({ downloadDir: null });
        notifyLibraryUpdated();
        return resolveDownloadDir(getConfig());
      },
    ),
  );

  ipcMain.handle('config:open-download-dir', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'open-download-directory',
        code: 'DOWNLOAD_DIRECTORY_OPEN_FAILED',
        title: '無法開啟下載位置',
        message: '目前無法開啟下載位置，請確認資料夾仍可使用。',
      },
      async () => {
        // Electron resolves with an OS error string instead of rejecting.
        const error = await openPath(resolveDownloadDir(getConfig()));
        if (error) throw new Error(error);
      },
    ),
  );

  ipcMain.handle('config:get-ui-theme', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-ui-theme',
        code: 'UI_THEME_READ_FAILED',
        title: '無法讀取介面主題',
        message: '目前無法讀取介面主題。',
      },
      () => getConfig().uiTheme,
    ),
  );

  ipcMain.handle('config:set-ui-theme', async (event, theme) => {
    if (!Object.hasOwn(titlebarColors, theme)) {
      throw createValidationError(
        'UI_THEME_INVALID',
        '無法套用介面主題',
        '指定的介面主題不受支援。',
      );
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-ui-theme',
        code: 'UI_THEME_UPDATE_FAILED',
        title: '無法套用介面主題',
        message: '目前無法套用介面主題，請稍後再試。',
      },
      () => {
        updateConfig({ uiTheme: theme });
        const win = getMainWindow();
        if (win) {
          win.setTitleBarOverlay(titlebarColors[theme]);
          win.setBackgroundColor(titlebarColors[theme].color);
        }
        return getConfig().uiTheme;
      },
    );
  });

  ipcMain.handle('config:get-sidebar-width', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-sidebar-width',
        code: 'SIDEBAR_WIDTH_READ_FAILED',
        title: '無法讀取側欄寬度',
        message: '目前無法讀取側欄寬度。',
      },
      () => getConfig().sidebarWidth,
    ),
  );

  ipcMain.handle('config:set-sidebar-width', async (event, width) => {
    if (
      !Number.isFinite(width) ||
      width < SIDEBAR_WIDTH_MIN ||
      width > SIDEBAR_WIDTH_MAX
    ) {
      throw createValidationError(
        'SIDEBAR_WIDTH_INVALID',
        '無法調整側欄寬度',
        '指定的側欄寬度超出支援範圍。',
      );
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-sidebar-width',
        code: 'SIDEBAR_WIDTH_UPDATE_FAILED',
        title: '無法調整側欄寬度',
        message: '目前無法調整側欄寬度，請稍後再試。',
      },
      () => {
        updateConfig({ sidebarWidth: width });
        return getConfig().sidebarWidth;
      },
    );
  });

  ipcMain.handle('config:get-capture-device', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-capture-device',
        code: 'CAPTURE_DEVICE_READ_FAILED',
        title: '無法讀取擷取裝置',
        message: '目前無法讀取擷取裝置設定。',
      },
      () => getConfig().captureDeviceId,
    ),
  );

  ipcMain.handle('config:set-capture-device', async (event, deviceId) => {
    if (
      deviceId !== null &&
      (typeof deviceId !== 'string' ||
        deviceId.length === 0 ||
        deviceId.length > CAPTURE_DEVICE_ID_MAX_LENGTH)
    ) {
      throw createValidationError(
        'CAPTURE_DEVICE_INVALID',
        '無法套用擷取裝置',
        '指定的擷取裝置識別值無效。',
      );
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-capture-device',
        code: 'CAPTURE_DEVICE_UPDATE_FAILED',
        title: '無法套用擷取裝置',
        message: '目前無法套用擷取裝置，請稍後再試。',
      },
      () => {
        updateConfig({ captureDeviceId: deviceId });
        return getConfig().captureDeviceId;
      },
    );
  });

  ipcMain.handle('config:get-auto-music-analysis', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-auto-music-analysis',
        code: 'AUTO_MUSIC_ANALYSIS_READ_FAILED',
        title: '無法讀取自動分析設定',
        message: '目前無法讀取自動分析設定。',
      },
      () => getConfig().autoAnalyzeMusicStructure,
    ),
  );

  ipcMain.handle('config:set-auto-music-analysis', async (event, enabled) => {
    if (typeof enabled !== 'boolean') {
      throw createValidationError(
        'AUTO_MUSIC_ANALYSIS_INVALID',
        '無法套用自動分析設定',
        '指定的自動分析設定無效。',
      );
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-auto-music-analysis',
        code: 'AUTO_MUSIC_ANALYSIS_UPDATE_FAILED',
        title: '無法套用自動分析設定',
        message: '目前無法套用自動分析設定，請稍後再試。',
      },
      () => {
        updateConfig({ autoAnalyzeMusicStructure: enabled });
        return getConfig().autoAnalyzeMusicStructure;
      },
    );
  });

  ipcMain.handle('config:get-app-update-auto-check', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-app-update-auto-check',
        code: 'APP_UPDATE_AUTO_CHECK_READ_FAILED',
        title: '無法讀取自動檢查更新設定',
        message: '目前無法讀取自動檢查更新設定。',
      },
      () => getConfig().autoCheckAppUpdates,
    ),
  );

  ipcMain.handle('config:set-app-update-auto-check', async (event, enabled) => {
    if (typeof enabled !== 'boolean') {
      throw createValidationError(
        'APP_UPDATE_AUTO_CHECK_INVALID',
        '無法套用自動檢查更新設定',
        '指定的自動檢查更新設定無效。',
      );
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-app-update-auto-check',
        code: 'APP_UPDATE_AUTO_CHECK_UPDATE_FAILED',
        title: '無法套用自動檢查更新設定',
        message: '目前無法套用自動檢查更新設定，請稍後再試。',
      },
      () => {
        updateConfig({ autoCheckAppUpdates: enabled });
        const next = getConfig().autoCheckAppUpdates;
        applyAppUpdateAutoCheck(next);
        return next;
      },
    );
  });

  ipcMain.handle('config:get-announcement-seen-version', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-announcement-seen-version',
        code: 'ANNOUNCEMENT_SEEN_VERSION_READ_FAILED',
        title: '無法讀取公告狀態',
        message: '目前無法讀取公告狀態。',
      },
      () => getConfig().lastSeenAnnouncementVersion,
    ),
  );

  ipcMain.handle(
    'config:set-announcement-seen-version',
    async (event, version) => {
      if (
        typeof version !== 'string' ||
        version.length === 0 ||
        version.length > ANNOUNCEMENT_VERSION_MAX_LENGTH
      ) {
        throw createValidationError(
          'ANNOUNCEMENT_SEEN_VERSION_INVALID',
          '無法儲存公告狀態',
          '指定的版本號無效。',
        );
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-announcement-seen-version',
          code: 'ANNOUNCEMENT_SEEN_VERSION_UPDATE_FAILED',
          title: '無法儲存公告狀態',
          message: '目前無法儲存公告狀態，請稍後再試。',
        },
        () => {
          updateConfig({ lastSeenAnnouncementVersion: version });
          return getConfig().lastSeenAnnouncementVersion;
        },
      );
    },
  );
}

module.exports = { registerConfigHandlers };
