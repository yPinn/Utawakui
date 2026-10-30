'use strict';

const { createAppError } = require('../lib/appError');
const {
  ANNOUNCEMENT_VERSION_MAX_LENGTH,
  AUTO_ERROR_REPORTING_VALUES,
  CAPTURE_DEVICE_ID_MAX_LENGTH,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  isValidAudioPreferences,
} = require('../lib/config');
const {
  isWindowCloseBehavior,
} = require('../../shared/windowCloseBehaviorContract.mjs');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

// Copy comes from errors.<CODE> in the UI catalog.
function createValidationError(code) {
  return createAppError({ code, severity: 'warning' });
}

function runConfigOperation({ recordDiagnostic, operation, code }, handler) {
  return runDiagnosticIpcOperation(
    {
      recordDiagnostic,
      diagnostic: { source: 'config', operation, code },
      publicError: { code },
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
  getDownloadDirStatus = (config) => ({
    downloadDir: resolveDownloadDir(config),
    isDefault: !config.downloadDir,
    available: true,
    reason: null,
  }),
  validateDownloadDir = () => undefined,
  getMainWindow,
  notifyLibraryUpdated,
  onLibraryDirectoryChanged = () => undefined,
  recordDiagnostic,
  titlebarColors,
  applyPerformerUiTheme = () => undefined,
  applyAppUpdateAutoCheck = () => undefined,
  applyWindowCloseBehavior = () => undefined,
}) {
  ipcMain.handle('config:get-obs-arrangement-dock', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-obs-arrangement-dock',
        code: 'OBS_ARRANGEMENT_DOCK_READ_FAILED',
      },
      () => getConfig().autoShowArrangementOnObs === true,
    ),
  );
  ipcMain.handle('config:set-obs-arrangement-dock', async (_event, enabled) => {
    if (typeof enabled !== 'boolean')
      throw createValidationError('OBS_ARRANGEMENT_DOCK_INVALID');
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-obs-arrangement-dock',
        code: 'OBS_ARRANGEMENT_DOCK_UPDATE_FAILED',
      },
      () => {
        updateConfig({ autoShowArrangementOnObs: enabled });
        return getConfig().autoShowArrangementOnObs === true;
      },
    );
  });
  ipcMain.handle('config:get', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-download-directory',
        code: 'DOWNLOAD_DIRECTORY_READ_FAILED',
      },
      () => getDownloadDirStatus(getConfig()),
    ),
  );

  ipcMain.handle('config:choose-download-dir', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'choose-download-directory',
        code: 'DOWNLOAD_DIRECTORY_CHOOSE_FAILED',
      },
      async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) {
          return getDownloadDirStatus(getConfig()).downloadDir;
        }
        validateDownloadDir(result.filePaths[0]);
        updateConfig({ downloadDir: result.filePaths[0] });
        onLibraryDirectoryChanged();
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
      },
      () => {
        const defaultDir = resolveDownloadDir({
          ...getConfig(),
          downloadDir: null,
        });
        updateConfig({ downloadDir: null });
        onLibraryDirectoryChanged();
        notifyLibraryUpdated();
        return defaultDir;
      },
    ),
  );

  ipcMain.handle('config:open-download-dir', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'open-download-directory',
        code: 'DOWNLOAD_DIRECTORY_OPEN_FAILED',
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
      },
      () => getConfig().uiTheme,
    ),
  );

  ipcMain.handle('config:set-ui-theme', async (event, theme) => {
    if (!Object.hasOwn(titlebarColors, theme)) {
      throw createValidationError('UI_THEME_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-ui-theme',
        code: 'UI_THEME_UPDATE_FAILED',
      },
      () => {
        updateConfig({ uiTheme: theme });
        const win = getMainWindow();
        if (win) {
          const { backgroundColor, ...titleBarOverlay } = titlebarColors[theme];
          win.setTitleBarOverlay(titleBarOverlay);
          win.setBackgroundColor(backgroundColor);
        }
        applyPerformerUiTheme(theme);
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
      },
      () => getConfig().sidebarWidth,
    ),
  );

  ipcMain.handle('config:set-sidebar-width', async (event, width) => {
    if (
      !Number.isFinite(width) ||
      (width !== SIDEBAR_WIDTH_MIN && width !== SIDEBAR_WIDTH_MAX)
    ) {
      throw createValidationError('SIDEBAR_WIDTH_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-sidebar-width',
        code: 'SIDEBAR_WIDTH_UPDATE_FAILED',
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
      throw createValidationError('CAPTURE_DEVICE_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-capture-device',
        code: 'CAPTURE_DEVICE_UPDATE_FAILED',
      },
      () => {
        updateConfig({ captureDeviceId: deviceId });
        return getConfig().captureDeviceId;
      },
    );
  });

  ipcMain.handle('config:get-audio-preferences', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-audio-preferences',
        code: 'AUDIO_PREFERENCES_READ_FAILED',
      },
      () => ({ ...getConfig().audioPreferences }),
    ),
  );

  ipcMain.handle(
    'config:set-audio-preferences',
    async (event, audioPreferences) => {
      if (!isValidAudioPreferences(audioPreferences)) {
        throw createValidationError('AUDIO_PREFERENCES_INVALID');
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-audio-preferences',
          code: 'AUDIO_PREFERENCES_UPDATE_FAILED',
        },
        () => {
          updateConfig({ audioPreferences });
          return { ...getConfig().audioPreferences };
        },
      );
    },
  );

  ipcMain.handle('config:get-auto-music-analysis', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-auto-music-analysis',
        code: 'AUTO_MUSIC_ANALYSIS_READ_FAILED',
      },
      () => getConfig().autoAnalyzeMusicStructure,
    ),
  );

  ipcMain.handle('config:set-auto-music-analysis', async (event, enabled) => {
    if (typeof enabled !== 'boolean') {
      throw createValidationError('AUTO_MUSIC_ANALYSIS_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-auto-music-analysis',
        code: 'AUTO_MUSIC_ANALYSIS_UPDATE_FAILED',
      },
      () => {
        updateConfig({ autoAnalyzeMusicStructure: enabled });
        return getConfig().autoAnalyzeMusicStructure;
      },
    );
  });

  ipcMain.handle('config:get-youtube-browser-cookies', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-youtube-browser-cookies',
        code: 'YOUTUBE_BROWSER_COOKIES_READ_FAILED',
      },
      () => getConfig().youtubeBrowserCookies,
    ),
  );

  ipcMain.handle(
    'config:set-youtube-browser-cookies',
    async (event, enabled) => {
      if (typeof enabled !== 'boolean') {
        throw createValidationError('YOUTUBE_BROWSER_COOKIES_INVALID');
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-youtube-browser-cookies',
          code: 'YOUTUBE_BROWSER_COOKIES_UPDATE_FAILED',
        },
        () => {
          updateConfig({ youtubeBrowserCookies: enabled });
          return getConfig().youtubeBrowserCookies;
        },
      );
    },
  );

  ipcMain.handle('config:get-auto-error-reporting', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-auto-error-reporting',
        code: 'AUTO_ERROR_REPORTING_READ_FAILED',
      },
      () => getConfig().autoErrorReporting,
    ),
  );

  ipcMain.handle('config:set-auto-error-reporting', async (event, value) => {
    if (!AUTO_ERROR_REPORTING_VALUES.has(value)) {
      throw createValidationError('AUTO_ERROR_REPORTING_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-auto-error-reporting',
        code: 'AUTO_ERROR_REPORTING_UPDATE_FAILED',
      },
      () => {
        updateConfig({ autoErrorReporting: value });
        return getConfig().autoErrorReporting;
      },
    );
  });

  ipcMain.handle('config:get-separation-gpu-acceleration', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-separation-gpu-acceleration',
        code: 'SEPARATION_GPU_ACCELERATION_READ_FAILED',
      },
      () => getConfig().separationGpuAcceleration,
    ),
  );

  ipcMain.handle(
    'config:set-separation-gpu-acceleration',
    async (event, enabled) => {
      if (typeof enabled !== 'boolean') {
        throw createValidationError('SEPARATION_GPU_ACCELERATION_INVALID');
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-separation-gpu-acceleration',
          code: 'SEPARATION_GPU_ACCELERATION_UPDATE_FAILED',
        },
        () => {
          updateConfig({ separationGpuAcceleration: enabled });
          return getConfig().separationGpuAcceleration;
        },
      );
    },
  );

  ipcMain.handle('config:get-app-update-auto-check', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-app-update-auto-check',
        code: 'APP_UPDATE_AUTO_CHECK_READ_FAILED',
      },
      () => getConfig().autoCheckAppUpdates,
    ),
  );

  ipcMain.handle('config:set-app-update-auto-check', async (event, enabled) => {
    if (typeof enabled !== 'boolean') {
      throw createValidationError('APP_UPDATE_AUTO_CHECK_INVALID');
    }
    return runConfigOperation(
      {
        recordDiagnostic,
        operation: 'set-app-update-auto-check',
        code: 'APP_UPDATE_AUTO_CHECK_UPDATE_FAILED',
      },
      () => {
        updateConfig({ autoCheckAppUpdates: enabled });
        const next = getConfig().autoCheckAppUpdates;
        applyAppUpdateAutoCheck(next);
        return next;
      },
    );
  });

  ipcMain.handle('config:get-window-close-behavior', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-window-close-behavior',
        code: 'WINDOW_CLOSE_BEHAVIOR_READ_FAILED',
      },
      () => getConfig().windowCloseBehavior,
    ),
  );

  ipcMain.handle(
    'config:set-window-close-behavior',
    async (event, behavior) => {
      if (!isWindowCloseBehavior(behavior)) {
        throw createValidationError('WINDOW_CLOSE_BEHAVIOR_INVALID');
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-window-close-behavior',
          code: 'WINDOW_CLOSE_BEHAVIOR_UPDATE_FAILED',
        },
        () => {
          const previous = getConfig().windowCloseBehavior;
          let liveStateApplied = false;
          try {
            // Tray creation can fail for native-shell reasons. Apply first so
            // a failed enable is never persisted as if background mode were
            // live.
            applyWindowCloseBehavior(behavior);
            liveStateApplied = true;
            updateConfig({ windowCloseBehavior: behavior });
            return behavior;
          } catch (error) {
            if (liveStateApplied) {
              try {
                applyWindowCloseBehavior(previous);
              } catch {
                // Preserve the persistence failure as the primary diagnostic.
                // The rollback path only changes this app-owned Tray policy.
              }
            }
            throw error;
          }
        },
      );
    },
  );

  ipcMain.handle('config:get-announcement-seen-version', async () =>
    runConfigOperation(
      {
        recordDiagnostic,
        operation: 'get-announcement-seen-version',
        code: 'ANNOUNCEMENT_SEEN_VERSION_READ_FAILED',
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
        throw createValidationError('ANNOUNCEMENT_SEEN_VERSION_INVALID');
      }
      return runConfigOperation(
        {
          recordDiagnostic,
          operation: 'set-announcement-seen-version',
          code: 'ANNOUNCEMENT_SEEN_VERSION_UPDATE_FAILED',
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
