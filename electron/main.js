'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  session,
  ipcMain,
  dialog,
  protocol,
  nativeTheme,
  shell,
} = require('electron');

const APP_NAME = 'Utawakui';
// Must run before app.getPath('userData') is read below (and before any
// require of a lib that reads it), or userData resolves to Electron's
// default app name instead of ours.
app.setName(APP_NAME);

// youtube-dl-exec's yt-dlp.exe path is computed once, at first require of
// its constants module, from the YOUTUBE_DL_DIR env var — so this managed
// feature-dependency path must be set before the lib requires below pull it
// in transitively (downloader.js, ytdlpStatus.js, youtubeAttempts.js all
// require it). The binary is copied into that dir only when provider-flow's
// Settings row prepares the tool.
const { setupYtdlpRuntimeEnvironment } = require('./lib/featureDependencies');
setupYtdlpRuntimeEnvironment(app.getPath('userData'));

if (app.isPackaged) {
  // A packaged app can't assume Node.js is on the end user's PATH, which
  // youtubeAttempts.js's jsRuntimes option otherwise requires. Point yt-dlp
  // at this Electron binary running in Node mode instead — inherited by
  // yt-dlp's child process the same way YOUTUBE_DL_DIR's effect is, via
  // tinyspawn's default env passthrough (see youtube-dl-exec/src/index.js).
  process.env.UTAWAKUI_YTDLP_JS_RUNTIME = `node:${process.execPath}`;
  process.env.ELECTRON_RUN_AS_NODE = '1';
}

const { FEATURE_IDS } = require('./lib/featureGates');
const windowState = require('./main/windowState');
const configState = require('./main/configState');
const { registerYtdlpHandlers } = require('./main/ytdlpHandlers');
const { registerConfigHandlers } = require('./main/configHandlers');
const { registerLyricsHandlers } = require('./main/lyricsHandlers');
const { registerLibraryHandlers } = require('./main/libraryHandlers');
const { registerMediaProtocol } = require('./main/mediaProtocol');
const { registerPlaylistsHandlers } = require('./main/playlistsHandlers');
const { registerImportHandlers } = require('./main/importHandlers');
const { registerSeparationHandlers } = require('./main/separationHandlers');
const {
  registerFeatureDependencyHandlers,
} = require('./main/featureDependencyHandlers');
const { runStartupMigrations } = require('./main/startupMigrations');
const { MEDIA_SCHEME } = require('./main/mediaScheme');

// Also removes Electron's default Ctrl+0/+/- zoom accelerators, which let
// content zoom drift and desync the titlebar theme button from the
// OS-drawn window controls. Guards against an accidental zoom mid-stream too.
Menu.setApplicationMenu(null);

// Electron requires scheme privileges before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    // Required by fetch() and CORS-clean Web Audio playback.
    privileges: {
      standard: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = windowState.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32')
      app.setAppUserModelId(windowState.getAppUserModelId());
    // Narrow exception for the capture-device output picker (see
    // usePlayer.js's capture chain / useAudioOutput.js): 'media' with
    // mediaType 'audio' unlocks labeled enumerateDevices() results (Chromium
    // returns blank labels for audiooutput devices without it), and
    // 'speaker-selection' is what setSinkId() itself checks for a
    // non-default device. Neither grants microphone *capture* — no
    // getUserMedia call is ever made, so no mic indicator lights up.
    // Everything else stays denied.
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        if (permission === 'speaker-selection') return callback(true);
        if (permission === 'media' && details?.mediaType === 'audio') {
          return callback(true);
        }
        callback(false);
      },
    );
    // setPermissionCheckHandler is the synchronous counterpart
    // enumerateDevices() itself consults for device labels — without this,
    // the request handler above only covers explicit getUserMedia() calls,
    // which this app never makes.
    session.defaultSession.setPermissionCheckHandler(
      (webContents, permission) => permission === 'media',
    );

    configState.loadInitialConfig();
    const { requireFeatureGate } = configState;

    registerMediaProtocol({
      protocol,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
    });

    registerLibraryHandlers({
      ipcMain,
      dialog,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      sendBackfillStatus: windowState.sendBackfillStatus,
      featureIds: FEATURE_IDS,
    });

    registerLyricsHandlers({
      ipcMain,
      dialog,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
    });

    registerPlaylistsHandlers({
      ipcMain,
      dialog,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
    });

    registerImportHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      userDataDir: app.getPath('userData'),
      resolveDownloadDir: configState.resolveDownloadDir,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
    });

    registerSeparationHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
    });

    registerFeatureDependencyHandlers({
      ipcMain,
      requireFeatureGate,
      getMainWindow: windowState.getMainWindow,
    });

    registerConfigHandlers({
      ipcMain,
      dialog,
      shell,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      titlebarColors: windowState.TITLEBAR_COLORS,
    });

    registerYtdlpHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
    });

    windowState.registerPlayerStateHandler(ipcMain);

    nativeTheme.on('updated', windowState.updateThumbar);

    runStartupMigrations(
      configState.resolveDownloadDir(configState.getConfig()),
    );

    windowState.createMainWindow(
      configState.getConfig().uiTheme,
      configState.getConfig().sidebarWidth,
      configState.getConfig().captureDeviceId,
    );
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      windowState.createMainWindow();
  });
}
