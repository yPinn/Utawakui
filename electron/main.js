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

const { FEATURE_IDS } = require('./lib/featureGates');
const windowState = require('./main/windowState');
const configState = require('./main/configState');
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
const {
  outputServer,
  registerOutputRuntimeLifecycle,
} = require('./main/outputRuntime');
const { registerOutputHandlers } = require('./main/outputHandlers');
const { createProviderRunnerManager } = require('./main/providerRunner');

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
  registerOutputRuntimeLifecycle({ app });

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
    const providerRunnerManager = createProviderRunnerManager({
      app,
      userDataDir: app.getPath('userData'),
    });

    registerMediaProtocol({
      protocol,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
    });

    registerOutputHandlers({
      ipcMain,
      server: outputServer,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
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
      getProviderRunner: providerRunnerManager.getRunner,
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
      resolveDownloadDir: configState.resolveDownloadDir,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      getProviderRunner: providerRunnerManager.getRunner,
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
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
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
