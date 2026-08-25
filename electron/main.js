'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const {
  app,
  BrowserWindow,
  Menu,
  session,
  ipcMain,
  dialog,
  protocol,
  nativeTheme,
  screen,
  shell,
  clipboard,
} = require('electron');

const APP_NAME = 'Utawakui';
// Must run before app.getPath('userData') is read below (and before any
// require of a lib that reads it), or userData resolves to Electron's
// default app name instead of ours.
app.setName(APP_NAME);
app.setAppLogsPath();

const { detectPackagedRuntime } = require('./main/runtimeEnvironment');
const isPackagedRuntime = detectPackagedRuntime({
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
});

const { FEATURE_IDS } = require('./lib/featureGates');
const {
  loadTrackMusicStructure,
  prepareTrackMusicStructureSource,
  resolveTrackArtworkPath,
  saveTrackMusicStructure,
} = require('./lib/library');
const { getPreparedFfmpegPath } = require('./lib/featureDependencies');
const {
  createAudioPythonRuntimeHost,
} = require('./lib/audioProcessing/audioPythonRuntimeHost');
const {
  createHeavyJobScheduler,
} = require('./lib/audioProcessing/heavyJobScheduler');
const {
  createStructureAnalysisService,
} = require('./lib/audioProcessing/structureAnalysisService');
const {
  createStructureAnalysisBatchService,
} = require('./lib/audioProcessing/structureAnalysisBatchService');
const {
  createStructureAnalysisCapabilityService,
  loadStructureAnalysisCapabilityCatalog,
} = require('./lib/audioProcessing/structureAnalysisCapability');
const {
  registerHeavyJobSchedulerLifecycle,
} = require('./main/heavyJobSchedulerLifecycle');
const { createDiagnosticsService } = require('./lib/diagnostics');
const {
  createStartupBaselineMetadata,
  createStartupTrace,
  readStartupTraceOptions,
  registerStartupTraceHandler,
} = require('./lib/startupTrace');
const windowState = require('./main/windowState');
const configState = require('./main/configState');
const { registerConfigHandlers } = require('./main/configHandlers');
const { registerFeatureGateHandlers } = require('./main/featureGateHandlers');
const {
  registerExternalNavigationHandlers,
} = require('./main/externalNavigationHandlers');
const { registerAppInfoHandlers } = require('./main/appInfoHandlers');
const { registerAppUpdateHandlers } = require('./main/appUpdateHandlers');
const { createAppUpdateService } = require('./main/appUpdateService');
const { registerLyricsHandlers } = require('./main/lyricsHandlers');
const {
  registerMusicStructureHandlers,
} = require('./main/musicStructureHandlers');
const {
  createLyricsAcquisitionService,
} = require('./main/lyricsAcquisitionService');
const { registerLibraryHandlers } = require('./main/libraryHandlers');
const { registerMediaProtocol } = require('./main/mediaProtocol');
const { registerPlaylistsHandlers } = require('./main/playlistsHandlers');
const { registerImportHandlers } = require('./main/importHandlers');
const { registerSeparationHandlers } = require('./main/separationHandlers');
const {
  registerFeatureDependencyHandlers,
} = require('./main/featureDependencyHandlers');
const { runStartupMigrations } = require('./main/startupMigrations');
const { startInteractiveRuntime } = require('./main/startupCoordinator');
const { createStartupTraceProbe } = require('./main/startupTraceProbe');
const { MEDIA_SCHEME } = require('./main/mediaScheme');
const {
  createOutputRuntime,
  registerOutputRuntimeLifecycle,
} = require('./main/outputRuntime');
const { registerOutputHandlers } = require('./main/outputHandlers');
const { registerDiagnosticsHandlers } = require('./main/diagnosticsHandlers');
const { registerDiagnosticsLifecycle } = require('./main/diagnosticsLifecycle');
const {
  createRuntimeDiagnosticsLogger,
} = require('./main/runtimeDiagnosticsLogger');
const { createPerformerWindowManager } = require('./main/performerWindow');
const {
  registerPerformerViewHandlers,
} = require('./main/performerViewHandlers');
const { createProviderRunnerManager } = require('./main/providerRunner');
const {
  runtimeEnabled: APP_UPDATE_RUNTIME_ENABLED,
  startupCheckDelayMs: APP_UPDATE_STARTUP_DELAY_MS,
} = require('../shared/appUpdateValues.json');
const {
  baselineIdleSampleMs: STARTUP_BASELINE_IDLE_SAMPLE_MS,
  baselineSettleMs: STARTUP_BASELINE_SETTLE_MS,
} = require('../shared/startupTraceValues.json');

const diagnosticsService = createDiagnosticsService({
  logsDir: app.getPath('logs'),
  sessionId: crypto.randomUUID(),
  process: 'main',
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron,
});
const runtimeDiagnosticsLogger = createRuntimeDiagnosticsLogger({
  service: diagnosticsService,
});
const startupTraceOptions = readStartupTraceOptions(process.argv);
const startupTraceFilePath = startupTraceOptions.enabled
  ? path.resolve(
      startupTraceOptions.filePath ??
        path.join(
          app.getPath('logs'),
          `startup-trace-${Date.now()}-${process.pid}.jsonl`,
        ),
    )
  : null;
const startupTraceFileReady = startupTraceFilePath
  ? fs
      .mkdir(path.dirname(startupTraceFilePath), { recursive: true })
      .then(() => fs.writeFile(startupTraceFilePath, '', { flag: 'wx' }))
  : Promise.resolve();
const startupTrace = createStartupTrace({
  enabled: startupTraceOptions.enabled,
  sessionId: crypto.randomUUID(),
  timeOriginMs: performance.timeOrigin,
  writeLine: (line) =>
    startupTraceFileReady.then(() =>
      fs.appendFile(startupTraceFilePath, `${line}\n`),
    ),
  onError: (error) => {
    console.warn('[startup-trace] write failed', error?.code ?? 'unknown');
  },
});

function recordMainMilestone(name, metadata) {
  if (!startupTrace.enabled) return false;
  return startupTrace.record(name, {
    atUnixMs: performance.timeOrigin + performance.now(),
    ...(metadata ? { metadata } : {}),
  });
}

startupTrace.record('process-start', { atUnixMs: performance.timeOrigin });

let performerWindowManager = null;
let outputRuntimeController = null;
let heavyJobScheduler = null;
const startupTraceProbe = startupTrace.enabled
  ? createStartupTraceProbe({ BrowserWindow })
  : null;
let startupTraceCompletion = null;

function completeStartupTrace() {
  if (!startupTrace.enabled || startupTraceCompletion) {
    return startupTraceCompletion;
  }
  startupTraceCompletion = Promise.resolve()
    .then(
      () =>
        new Promise((resolve) =>
          setTimeout(resolve, STARTUP_BASELINE_SETTLE_MS),
        ),
    )
    .then(() => {
      // After a fixed post-frame settle interval, reset Electron's CPU counters
      // and sample the fully active default instance over a trace-only window.
      app.getAppMetrics();
      return new Promise((resolve) =>
        setTimeout(resolve, STARTUP_BASELINE_IDLE_SAMPLE_MS),
      );
    })
    .then(() => {
      const metadata = createStartupBaselineMetadata({
        appMetrics: app.getAppMetrics(),
        gpuFeatureStatus: app.getGPUFeatureStatus(),
        outputStatus: outputRuntimeController?.getStatus(),
      });
      recordMainMilestone('baseline-complete', metadata);
      startupTraceProbe?.stop();
      return startupTrace.flush();
    })
    .catch((error) => {
      console.warn(
        '[startup-trace] baseline completion failed',
        error?.message ?? 'unknown',
      );
    })
    .finally(() => {
      if (startupTraceOptions.exitOnComplete) app.quit();
    });
  return startupTraceCompletion;
}

function recordOverlayMilestone(name, options) {
  const accepted = startupTrace.record(name, options);
  if (accepted && name === 'first-rendered-frame') {
    void completeStartupTrace();
  }
  return accepted;
}

function createConfiguredMainWindow() {
  const config = configState.getConfig();
  const mainWindow = windowState.createMainWindow(
    config.uiTheme,
    config.sidebarWidth,
    config.captureDeviceId,
    { startupTraceEnabled: startupTrace.enabled },
  );
  performerWindowManager?.attachMainWindow(mainWindow);
  return mainWindow;
}
registerDiagnosticsLifecycle({
  app,
  processTarget: process,
  service: diagnosticsService,
});

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
    recordMainMilestone('electron-ready');
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
    recordMainMilestone('config-ready');
    const { requireFeatureGate } = configState;
    heavyJobScheduler = createHeavyJobScheduler();
    registerHeavyJobSchedulerLifecycle({
      app,
      scheduler: heavyJobScheduler,
      logger: runtimeDiagnosticsLogger,
    });
    const audioPythonRuntimeHost = createAudioPythonRuntimeHost({
      userDataDir: app.getPath('userData'),
      appPath: app.getAppPath(),
      isPackaged: isPackagedRuntime,
      resourcesPath: process.resourcesPath,
    });
    const structureAnalysisService = createStructureAnalysisService({
      host: audioPythonRuntimeHost,
      scheduler: heavyJobScheduler,
      createJobId: crypto.randomUUID,
      prepareSource: async ({ trackId }) => {
        const config = configState.getConfig();
        const dir = configState.resolveDownloadDir(config);
        return {
          ...(await prepareTrackMusicStructureSource(dir, trackId)),
          libraryDir: dir,
          ffmpegPath: getPreparedFfmpegPath(
            app.getPath('userData'),
            config.systemFfmpegPath,
          ),
        };
      },
      publishDocument: ({ trackId, document, identity, libraryDir }) =>
        saveTrackMusicStructure(libraryDir, trackId, document, identity),
    });
    const structureAnalysisBatchService = createStructureAnalysisBatchService({
      analysisService: structureAnalysisService,
      inspectTrack: (trackId) => {
        const config = configState.getConfig();
        return loadTrackMusicStructure(
          configState.resolveDownloadDir(config),
          trackId,
        );
      },
      onTrackComplete: windowState.notifyLibraryUpdated,
    });
    const structureAnalysisCapabilityService =
      createStructureAnalysisCapabilityService({
        host: audioPythonRuntimeHost,
        ...loadStructureAnalysisCapabilityCatalog({
          appPath: app.getAppPath(),
          isPackaged: isPackagedRuntime,
          resourcesPath: process.resourcesPath,
        }),
        getActiveJob: () =>
          structureAnalysisService.getActiveJob() ??
          (structureAnalysisBatchService.hasActiveBatch()
            ? { jobId: 'batch', trackId: 'batch' }
            : null),
      });
    const lyricsAcquisitionService = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: FEATURE_IDS.LYRICS_FLOW,
      logger: runtimeDiagnosticsLogger,
    });
    outputRuntimeController = createOutputRuntime({
      getConfig: configState.getConfig,
      requireFeatureGate,
      resolveArtworkAsset: (trackId) =>
        resolveTrackArtworkPath(
          configState.resolveDownloadDir(configState.getConfig()),
          trackId,
        ),
      featureId: FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
      onMilestone: recordMainMilestone,
      recordOverlayMilestone: startupTrace.enabled
        ? recordOverlayMilestone
        : null,
      logger: runtimeDiagnosticsLogger,
    });
    registerOutputRuntimeLifecycle({
      app,
      server: outputRuntimeController,
      logger: runtimeDiagnosticsLogger,
    });
    const providerRunnerManager = createProviderRunnerManager({
      app,
      userDataDir: app.getPath('userData'),
    });
    const appUpdateService = createAppUpdateService({
      currentVersion: app.getVersion(),
      isPackaged: isPackagedRuntime,
      isWindows: process.platform === 'win32',
      runtimeEnabled: APP_UPDATE_RUNTIME_ENABLED,
      publishStatus: (status) => {
        const mainWindow = windowState.getMainWindow();
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('app-update:status', status);
        }
      },
      logger: {
        error: (_message, error) =>
          diagnosticsService.record({
            level: 'error',
            source: 'app-update',
            operation: 'service',
            code: 'APP_UPDATE_SERVICE_FAILED',
            message: 'App update operation failed',
            error,
          }),
      },
    });

    registerAppInfoHandlers({
      ipcMain,
      getVersion: () => app.getVersion(),
    });
    registerDiagnosticsHandlers({
      ipcMain,
      service: diagnosticsService,
      openLogsDirectory: () => shell.openPath(app.getPath('logs')),
    });
    registerStartupTraceHandler({
      ipcMain,
      trace: startupTrace,
      getAllowedSender: () => windowState.getMainWindow()?.webContents ?? null,
    });
    registerAppUpdateHandlers({ ipcMain, service: appUpdateService });

    registerMediaProtocol({
      protocol,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
    });

    registerOutputHandlers({
      ipcMain,
      server: outputRuntimeController,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      writeClipboardText: (value) => clipboard.writeText(value),
      logger: runtimeDiagnosticsLogger,
    });

    performerWindowManager = createPerformerWindowManager({
      BrowserWindow,
      isDev: windowState.isDev,
      devUrl: 'http://localhost:5173/performer-view.html',
      pagePath: path.join(__dirname, '..', 'dist', 'performer-view.html'),
      preloadPath: path.join(__dirname, 'performerPreload.js'),
      getDisplayWorkArea: () => {
        const mainWindow = windowState.getMainWindow();
        if (!mainWindow?.isDestroyed()) {
          return screen.getDisplayMatching(mainWindow.getBounds()).workArea;
        }
        return screen.getPrimaryDisplay().workArea;
      },
      getUiTheme: () => configState.getConfig().uiTheme,
      publishStatus: (status) => {
        const mainWindow = windowState.getMainWindow();
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('performer-view:status', status);
        }
      },
    });
    registerPerformerViewHandlers({
      ipcMain,
      manager: performerWindowManager,
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
      lyricsAcquisitionService,
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
      lyricsAcquisitionService,
    });

    registerMusicStructureHandlers({
      ipcMain,
      dialog,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      analysisService: structureAnalysisService,
      capabilityService: structureAnalysisCapabilityService,
      batchService: structureAnalysisBatchService,
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
      lyricsAcquisitionService,
    });

    registerSeparationHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      heavyJobScheduler,
    });

    registerFeatureDependencyHandlers({
      ipcMain,
      requireFeatureGate,
      getMainWindow: windowState.getMainWindow,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      recordDiagnostic: (event) => diagnosticsService.record(event),
      resourcesPath: isPackagedRuntime ? process.resourcesPath : null,
    });

    registerConfigHandlers({
      ipcMain,
      dialog,
      openPath: (targetPath) => shell.openPath(targetPath),
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      recordDiagnostic: (event) => diagnosticsService.record(event),
      titlebarColors: windowState.TITLEBAR_COLORS,
    });

    registerFeatureGateHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

    registerExternalNavigationHandlers({
      ipcMain,
      openExternal: (url) => shell.openExternal(url),
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

    windowState.registerPlayerStateHandler(ipcMain);

    nativeTheme.on('updated', windowState.updateThumbar);

    const interactiveRuntime = startInteractiveRuntime({
      createWindow: createConfiguredMainWindow,
      attachRenderer: (webContents) =>
        outputRuntimeController.attachRenderer(webContents),
      startOutput: () => outputRuntimeController.startConfigured(),
      runMigrations: () =>
        runStartupMigrations(
          configState.resolveDownloadDir(configState.getConfig()),
        ),
      recordMilestone: recordMainMilestone,
      logger: runtimeDiagnosticsLogger,
    });
    if (startupTraceProbe) {
      interactiveRuntime.outputStartup.then((status) => {
        if (status?.running && status.httpUrl) {
          startupTraceProbe.start(status.httpUrl);
        }
      });
    }
    appUpdateService.scheduleStartupCheck(APP_UPDATE_STARTUP_DELAY_MS);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const mainWindow = createConfiguredMainWindow();
      outputRuntimeController?.attachRenderer(mainWindow.webContents);
    }
  });
}
