'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  session,
  ipcMain: electronIpcMain,
  dialog,
  protocol,
  nativeTheme,
  screen,
  shell,
  clipboard,
  safeStorage,
  powerSaveBlocker,
} = require('electron');

const APP_NAME = 'Utawakui';
// Apply Chromium sandboxing before ready and before any BrowserWindow can be
// created. The helper process repeats the same invariant in its own bootstrap.
app.enableSandbox();
// Must run before app.getPath('userData') is read below (and before any
// require of a lib that reads it), or userData resolves to Electron's
// default app name instead of ours.
app.setName(APP_NAME);
app.setAppLogsPath();

const {
  detectPackagedRuntime,
  resolvePackagedUpdateConfigPath,
} = require('./main/runtimeEnvironment');
const isPackagedRuntime = detectPackagedRuntime({
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
});
const packagedUpdateConfigPath = resolvePackagedUpdateConfigPath({
  isPackagedRuntime,
  isElectronPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});

const { FEATURE_IDS, isFeatureGateEnabled } = require('./lib/featureGates');
const {
  inspectTrackMusicStructure,
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
  SUPPORTED_STRUCTURE_ANALYSIS_MODELS,
} = require('./lib/audioProcessing/structureAnalysisJob');
const {
  createStructureAnalysisBatchService,
} = require('./lib/audioProcessing/structureAnalysisBatchService');
const {
  createStructureAnalysisAutoQueue,
} = require('./lib/audioProcessing/structureAnalysisAutoQueue');
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
const {
  registerProviderDiscoveryHandlers,
} = require('./main/providerDiscoveryHandlers');
const { registerAppInfoHandlers } = require('./main/appInfoHandlers');
const { registerAppUpdateHandlers } = require('./main/appUpdateHandlers');
const { createAppUpdateService } = require('./main/appUpdateService');
const { createWindowsTrayController } = require('./main/windowsTrayController');
const {
  createWindowCloseDecisionBridge,
} = require('./main/windowCloseDecisionBridge');
const { registerAppUsageHandlers } = require('./main/appUsageHandlers');
const { createAppUsageService } = require('./main/appUsageService');
const { queryProcessTree } = require('./main/childProcessUsageSampler');
const { registerLyricsHandlers } = require('./main/lyricsHandlers');
const {
  registerMusicStructureHandlers,
} = require('./main/musicStructureHandlers');
const {
  createLyricsAcquisitionService,
} = require('./main/lyricsAcquisitionService');
const { registerLibraryHandlers } = require('./main/libraryHandlers');
const {
  registerLibraryStorageHandlers,
} = require('./main/libraryStorageHandlers');
const { createLibraryStorageService } = require('./lib/library/storage');
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
const {
  createSpoutHelperLaunch,
  createSpoutOutputRuntime,
} = require('./main/spoutOutputRuntime');
const { registerSpoutOutputHandlers } = require('./main/spoutOutputHandlers');
const { createObsAdapter } = require('./main/obsAdapter');
const { createObsCredentialStore } = require('./main/obsCredentialStore');
const { registerObsHandlers } = require('./main/obsHandlers');
const { createObsPowerSaveBlocker } = require('./main/obsPowerSaveBlocker');
const { createSessionHistoryService } = require('./main/sessionHistoryService');
const { createPlaybackPersistence } = require('./lib/playbackPersistence');
const {
  registerPlaybackPersistenceHandlers,
} = require('./main/playbackPersistenceHandlers');
const { registerDiagnosticsHandlers } = require('./main/diagnosticsHandlers');
const { registerDiagnosticsLifecycle } = require('./main/diagnosticsLifecycle');
const { createTrustedIpcMain } = require('./main/ipcSenderPolicy');
const { createRendererRecoveryController } = require('./main/rendererRecovery');
const { registerFeedbackHandlers } = require('./main/feedbackHandlers');
const { createFeedbackClient } = require('./lib/feedback/client');
const { resolveFeedbackEndpoint } = require('./lib/feedback/constants');
const {
  registerAudioOutputPermissions,
} = require('./main/audioOutputPermissions');
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
  signedManifestEnabled: APP_UPDATE_SIGNED_MANIFEST_ENABLED,
  startupCheckDelayMs: APP_UPDATE_STARTUP_DELAY_MS,
  recheckIntervalMs: APP_UPDATE_RECHECK_INTERVAL_MS,
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
const feedbackClient = createFeedbackClient({
  baseUrl: resolveFeedbackEndpoint(),
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
let spoutOutputRuntimeController = null;
let obsAdapterController = null;
let heavyJobScheduler = null;
let appUsageService = null;
let windowsTrayController = null;
let windowCloseDecisionBridge = null;
const startupTraceProbe = startupTrace.enabled
  ? createStartupTraceProbe({ BrowserWindow })
  : null;
let startupTraceCompletion = null;

const ipcMain = createTrustedIpcMain({
  ipcMain: electronIpcMain,
  getMainWebContents: () => windowState.getMainWindow()?.webContents ?? null,
  getPerformerWebContents: () =>
    performerWindowManager?.getWebContents() ?? null,
  onRejected: ({ channel, capability, kind }) =>
    diagnosticsService.record({
      process: 'main',
      level: 'warning',
      source: 'ipc',
      operation: 'sender-rejected',
      code: 'IPC_SENDER_UNTRUSTED',
      message: 'Rejected an untrusted IPC sender',
      context: { channel, capability, kind },
    }),
});

const rendererRecoveryController = createRendererRecoveryController({
  dialog,
  getMainWindow: windowState.getMainWindow,
  restartApp: () => {
    app.relaunch();
    app.quit();
  },
  quitApp: () => app.quit(),
  recordDiagnostic: (event) => diagnosticsService.record(event),
});

const obsPowerSaveBlockerSync = createObsPowerSaveBlocker({ powerSaveBlocker });

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
  windowsTrayController?.attachWindow(mainWindow);
  performerWindowManager?.attachMainWindow(mainWindow);
  appUsageService?.start();
  mainWindow.once('closed', () => appUsageService?.stop());
  return mainWindow;
}
registerDiagnosticsLifecycle({
  app,
  processTarget: process,
  service: diagnosticsService,
  getMainWebContents: () => windowState.getMainWindow()?.webContents ?? null,
  requestRendererRecovery: rendererRecoveryController.requestRecovery,
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
    if (windowsTrayController?.showWindow()) return;
    const mainWindow = windowState.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    recordMainMilestone('electron-ready');
    if (process.platform === 'win32')
      app.setAppUserModelId(windowState.getAppUserModelId());
    // Narrow exception for the main renderer's output picker and Web Audio
    // capture sink. Both Electron permission paths allow speaker selection
    // only for that trusted main frame; media capture and every unrelated
    // permission remain denied.
    registerAudioOutputPermissions(session.defaultSession, {
      getAllowedSender: () => windowState.getMainWindow()?.webContents ?? null,
    });
    configState.loadInitialConfig();
    windowCloseDecisionBridge = createWindowCloseDecisionBridge({
      ipcMain,
      getAllowedWindow: windowState.getMainWindow,
      createRequestId: () => crypto.randomUUID(),
    });
    windowsTrayController = createWindowsTrayController({
      app,
      Tray,
      Menu,
      dialog,
      iconPath: windowState.getAppIconPath(),
      appName: APP_NAME,
      initialBehavior: configState.getConfig().windowCloseBehavior,
      requestCloseDecision: (mainWindow) =>
        windowCloseDecisionBridge.requestDecision(mainWindow),
      persistWindowCloseBehavior: (behavior) =>
        configState.updateConfig({ windowCloseBehavior: behavior }),
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });
    app.once('will-quit', () => windowCloseDecisionBridge?.destroy());
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
            {
              onStaleSystemPath: () =>
                configState.updateConfig({ systemFfmpegPath: null }),
            },
          ),
        };
      },
      publishDocument: ({ trackId, document, identity, libraryDir }) =>
        saveTrackMusicStructure(libraryDir, trackId, document, identity),
    });
    const structureAnalysisProfileIds = Object.values(
      SUPPORTED_STRUCTURE_ANALYSIS_MODELS,
    ).map(({ profileId }) => profileId);
    const structureAnalysisBatchService = createStructureAnalysisBatchService({
      analysisService: structureAnalysisService,
      inspectTrack: (trackId) => {
        const config = configState.getConfig();
        return inspectTrackMusicStructure(
          configState.resolveDownloadDir(config),
          trackId,
        );
      },
      currentProfileIds: structureAnalysisProfileIds,
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
    const structureAnalysisAutoQueue = createStructureAnalysisAutoQueue({
      getConfig: configState.getConfig,
      isFeatureEnabled: isFeatureGateEnabled,
      featureId: FEATURE_IDS.AUDIO_PROCESSING_FLOW,
      capabilityService: structureAnalysisCapabilityService,
      analysisService: structureAnalysisService,
      batchService: structureAnalysisBatchService,
      inspectTrack: (trackId) => {
        const config = configState.getConfig();
        return inspectTrackMusicStructure(
          configState.resolveDownloadDir(config),
          trackId,
        );
      },
      currentProfileIds: structureAnalysisProfileIds,
      onTrackComplete: windowState.notifyLibraryUpdated,
      logger: runtimeDiagnosticsLogger,
    });
    const lyricsAcquisitionService = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: FEATURE_IDS.LYRICS_FLOW,
      logger: runtimeDiagnosticsLogger,
    });
    const obsCredentialStore = createObsCredentialStore({
      app,
      safeStorage,
      logger: runtimeDiagnosticsLogger,
    });
    obsAdapterController = createObsAdapter({
      requireFeatureGate,
      featureId: FEATURE_IDS.OBS_INTEGRATION,
      getPassword: async () => obsCredentialStore.loadPassword(),
      onStatusChange: (status) => {
        const mainWindow = windowState.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('obs:status', status);
        }
        obsPowerSaveBlockerSync.sync(status);
      },
      logger: runtimeDiagnosticsLogger,
    });
    // Created before outputRuntimeController below so its
    // handleProjectionChange can be wired into createOutputRuntime's
    // onProjectionChange option at construction time — no separate
    // subscribe step, and no new IPC channel (see the service's own header
    // comment for why the existing projection stream is enough).
    const sessionHistoryService = createSessionHistoryService({
      obsAdapter: obsAdapterController,
      userDataDir: app.getPath('userData'),
      logger: runtimeDiagnosticsLogger,
      getSkipThresholdMs: () =>
        configState.getConfig().obsIntegration.skipThresholdMs,
    });
    const playbackPersistence = createPlaybackPersistence({
      userDataDir: app.getPath('userData'),
    });
    const libraryStorageService = createLibraryStorageService({
      resolveLibraryDir: () =>
        configState.resolveDownloadDir(configState.getConfig()),
      getLastPlayedAtByTrackId: playbackPersistence.getLastPlayedAtByTrackId,
      getProtectedTrackIds: () => {
        const snapshot = playbackPersistence.getResumeSnapshot();
        return [
          windowState.getCurrentPlaybackTrackId(),
          snapshot?.currentTrackId,
          ...(snapshot?.queue?.sourceTrackIds || []),
          ...(snapshot?.queue?.queuedTrackIds || []),
        ].filter(Boolean);
      },
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
    });
    const enforceLibraryStoragePolicy = (options) => {
      const policy = configState.getConfig().libraryStorage;
      if (!policy.autoManageSeparation) return undefined;
      return libraryStorageService.enforcePolicy(policy, options);
    };
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
      onProjectionChange: sessionHistoryService.handleProjectionChange,
      recordOverlayMilestone: startupTrace.enabled
        ? recordOverlayMilestone
        : null,
      beforeStop: () => spoutOutputRuntimeController?.stop(),
      logger: runtimeDiagnosticsLogger,
    });
    spoutOutputRuntimeController = createSpoutOutputRuntime({
      outputRuntime: outputRuntimeController,
      requireFeatureGate,
      featureId: FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
      resolveLaunch: () =>
        createSpoutHelperLaunch({
          execPath: process.execPath,
          appPath: app.getAppPath(),
          packaged: isPackagedRuntime,
        }),
      onStatusChange: (status) => {
        const mainWindow = windowState.getMainWindow();
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('spout-output:status', status);
        }
      },
      logger: runtimeDiagnosticsLogger,
    });
    registerOutputRuntimeLifecycle({
      app,
      server: outputRuntimeController,
      logger: runtimeDiagnosticsLogger,
    });
    // Lazy per ADR 0013: only opens a socket (and only then requires the
    // obs-websocket-js SDK) when the user previously enabled it — same
    // fire-and-forget startup posture as appUpdateService's scheduled
    // checks below, not awaited so it never delays interactive app shell.
    const initialObsIntegration = configState.getConfig().obsIntegration;
    if (initialObsIntegration.enabled) {
      obsAdapterController.configure(initialObsIntegration).catch((error) => {
        runtimeDiagnosticsLogger.error?.(
          '[obs-adapter] Startup connect failed',
          error,
        );
      });
    }
    const providerRunnerManager = createProviderRunnerManager({
      app,
      userDataDir: app.getPath('userData'),
    });
    const appUpdateService = createAppUpdateService({
      currentVersion: app.getVersion(),
      isPackaged: isPackagedRuntime,
      isWindows: process.platform === 'win32',
      runtimeEnabled: APP_UPDATE_RUNTIME_ENABLED,
      signedManifestEnabled: APP_UPDATE_SIGNED_MANIFEST_ENABLED,
      autoCheckEnabled: configState.getConfig().autoCheckAppUpdates,
      packagedUpdateConfigPath,
      beforeInstall: () => windowsTrayController.beginQuit(),
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
    appUsageService = createAppUsageService({
      getAppMetrics: () => app.getAppMetrics(),
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      isHeavyJobActive: () => heavyJobScheduler?.isBusy() ?? false,
      sampleChildProcessTree:
        process.platform === 'win32'
          ? () =>
              queryProcessTree({
                logger: {
                  error: (message, error) =>
                    diagnosticsService.record({
                      level: 'error',
                      source: 'app-usage',
                      operation: 'child-process-query',
                      code: 'APP_USAGE_CHILD_QUERY_FAILED',
                      message,
                      error,
                    }),
                },
              })
          : undefined,
      publishStatus: (status) => {
        const mainWindow = windowState.getMainWindow();
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('app-usage:status', status);
        }
      },
      logger: {
        error: (_message, error) =>
          diagnosticsService.record({
            level: 'error',
            source: 'app-usage',
            operation: 'service',
            code: 'APP_USAGE_SERVICE_FAILED',
            message: 'App usage sampling failed',
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
      dialog,
      getMainWindow: windowState.getMainWindow,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
    });
    registerFeedbackHandlers({
      ipcMain,
      service: diagnosticsService,
      client: feedbackClient,
      dialog,
      getMainWindow: windowState.getMainWindow,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      locale: app.getLocale(),
    });
    registerStartupTraceHandler({
      ipcMain,
      trace: startupTrace,
      getAllowedSender: () => windowState.getMainWindow()?.webContents ?? null,
    });
    registerAppUpdateHandlers({ ipcMain, service: appUpdateService });
    registerAppUsageHandlers({ ipcMain, service: appUsageService });
    registerPlaybackPersistenceHandlers({
      ipcMain,
      service: playbackPersistence,
    });
    registerLibraryStorageHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      storage: libraryStorageService,
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

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
    registerSpoutOutputHandlers({
      ipcMain,
      runtime: spoutOutputRuntimeController,
      requireFeatureGate,
      featureId: FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
    });
    registerObsHandlers({
      ipcMain,
      adapter: obsAdapterController,
      credentialStore: obsCredentialStore,
      sessionHistoryService,
      requireFeatureGate,
      featureId: FEATURE_IDS.OBS_INTEGRATION,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      writeClipboardText: (value) => clipboard.writeText(value),
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
      requireFeatureGate,
      openExternal: (url) => shell.openExternal(url),
      getProviderRunner: providerRunnerManager.getRunner,
      lyricsAcquisitionService,
      enqueueMusicAnalysis: structureAnalysisAutoQueue.enqueue,
      enforceLibraryStoragePolicy,
      recordDiagnostic: (event) => diagnosticsService.record(event),
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
      recordDiagnostic: (event) => diagnosticsService.record(event),
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
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

    registerImportHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      getProviderRunner: providerRunnerManager.getRunner,
      lyricsAcquisitionService,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      enqueueMusicAnalysis: structureAnalysisAutoQueue.enqueue,
      enforceLibraryStoragePolicy,
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

    registerSeparationHandlers({
      ipcMain,
      getConfig: configState.getConfig,
      updateConfig: configState.updateConfig,
      resolveDownloadDir: configState.resolveDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      heavyJobScheduler,
      recordDiagnostic: (event) => diagnosticsService.record(event),
      enforceLibraryStoragePolicy,
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
      getDownloadDirStatus: configState.getDownloadDirStatus,
      validateDownloadDir: configState.validateDownloadDir,
      getMainWindow: windowState.getMainWindow,
      notifyLibraryUpdated: windowState.notifyLibraryUpdated,
      recordDiagnostic: (event) => diagnosticsService.record(event),
      titlebarColors: windowState.TITLEBAR_COLORS,
      applyAppUpdateAutoCheck: (enabled) =>
        appUpdateService.setAutoCheckEnabled(enabled),
      applyWindowCloseBehavior: (behavior) =>
        windowsTrayController.setCloseBehavior(behavior),
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

    registerProviderDiscoveryHandlers({
      ipcMain,
      openExternal: (url) => shell.openExternal(url),
      requireFeatureGate,
      featureIds: FEATURE_IDS,
      recordDiagnostic: (event) => diagnosticsService.record(event),
    });

    if (windowState.isDev) {
      const {
        createLyricsProviderCorpusReviewService,
      } = require('./lib/lyricsProviderCorpusReview');
      const {
        registerLyricsProviderCorpusReviewHandlers,
      } = require('./main/lyricsProviderCorpusReviewHandlers');
      registerLyricsProviderCorpusReviewHandlers({
        ipcMain,
        enabled: true,
        recordDiagnostic: (event) => diagnosticsService.record(event),
        writeClipboardText: (value) => clipboard.writeText(value),
        openExternal: (url) => shell.openExternal(url),
        service: createLyricsProviderCorpusReviewService({
          workspaceRoot: app.getAppPath(),
        }),
      });
    }

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
    appUpdateService.scheduleRecheck(APP_UPDATE_RECHECK_INTERVAL_MS);
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
