'use strict';

const { app } = require('electron');
const {
  getFfmpegDependency,
  resolveFfmpegRuntime,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
} = require('../lib/featureDependencies');
const { detectSystemFfmpeg } = require('../lib/systemFfmpeg');
const { createAppError } = require('../lib/appError');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

const OPERATION_PUBLIC_ERRORS = Object.freeze({
  list: Object.freeze({
    code: 'FEATURE_DEPENDENCY_LIST_FAILED',
    title: '無法讀取準備狀態',
    message: '請再試一次。',
  }),
  prepare: Object.freeze({
    code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
    title: '準備失敗',
    message: '請再試一次。',
  }),
  remove: Object.freeze({
    code: 'FEATURE_DEPENDENCY_REMOVE_FAILED',
    title: '移除失敗',
    message: '請再試一次。',
  }),
  repair: Object.freeze({
    code: 'FEATURE_DEPENDENCY_REPAIR_FAILED',
    title: '修復失敗',
    message: '請再試一次。',
  }),
  detect: Object.freeze({
    code: 'SYSTEM_FFMPEG_DETECTION_FAILED',
    title: '偵測失敗',
    message: '請再試一次。',
  }),
  'set-ffmpeg-source': Object.freeze({
    code: 'FFMPEG_SOURCE_UPDATE_FAILED',
    title: 'FFmpeg 來源未更新',
    message: '請再試一次。',
  }),
});

function getDependencyStatusOrThrow(
  userDataDir,
  dependencyId,
  getConfig,
  listStatuses,
) {
  const currentStatus = listStatuses(
    userDataDir,
    undefined,
    getConfig().systemFfmpegPath,
  ).find((dependency) => dependency.id === dependencyId);
  if (!currentStatus) {
    throw createAppError({
      code: 'FEATURE_DEPENDENCY_UNKNOWN',
      severity: 'warning',
      title: '無法辨識功能項目',
      message: '這個功能項目不存在或已不再支援。',
    });
  }
  return currentStatus;
}

function runDependencyOperation(
  operation,
  dependencyId,
  recordDiagnostic,
  handler,
) {
  const publicError = OPERATION_PUBLIC_ERRORS[operation];
  const context = dependencyId ? { dependencyId } : {};
  return runDiagnosticIpcOperation(
    {
      recordDiagnostic,
      diagnostic: {
        source: 'feature-dependencies',
        operation,
        code: publicError.code,
        message: `Feature dependency ${operation} failed`,
        context,
      },
      publicError: { ...publicError, context },
    },
    handler,
  );
}

function emitFeatureDependencyStatuses(
  getMainWindow,
  userDataDir,
  getConfig,
  listStatuses,
) {
  getMainWindow()?.webContents.send(
    'feature-dependencies:updated',
    listStatuses(userDataDir, undefined, getConfig().systemFfmpegPath),
  );
}

function emitFeatureDependencyProgress(getMainWindow, dependencyId, payload) {
  getMainWindow()?.webContents.send('feature-dependencies:progress', {
    dependencyId,
    ...payload,
  });
}

function buildPrepareOptions(getMainWindow, dependencyId, resourcesPath) {
  return {
    ...(resourcesPath ? { resourcesPath } : {}),
    onProgress: (payload) =>
      emitFeatureDependencyProgress(getMainWindow, dependencyId, payload),
  };
}

function registerFeatureDependencyHandlers({
  ipcMain,
  requireFeatureGate,
  getMainWindow,
  getConfig,
  updateConfig,
  recordDiagnostic,
  getUserDataDir = () => app.getPath('userData'),
  dependencyService = {
    getFfmpegDependency,
    listFeatureDependencyStatuses,
    prepareFeatureDependency,
    removeFeatureDependency,
    repairFeatureDependency,
  },
  detectSystemFfmpegImpl = detectSystemFfmpeg,
  resolveFfmpegRuntimeImpl = resolveFfmpegRuntime,
  resourcesPath = null,
}) {
  ipcMain.handle('feature-dependencies:list', async () =>
    runDependencyOperation('list', null, recordDiagnostic, () => {
      const userDataDir = getUserDataDir();
      const configuredPath = getConfig().systemFfmpegPath;
      let activeSystemPath = configuredPath;
      if (configuredPath) {
        const runtime = resolveFfmpegRuntimeImpl(userDataDir, configuredPath);
        if (runtime.staleSystemPath) {
          updateConfig({ systemFfmpegPath: null });
          activeSystemPath = null;
        }
      }
      return dependencyService.listFeatureDependencyStatuses(
        userDataDir,
        undefined,
        activeSystemPath,
      );
    }),
  );

  ipcMain.handle(
    'feature-dependencies:prepare',
    async (event, dependencyId) => {
      const userDataDir = getUserDataDir();
      const currentStatus = getDependencyStatusOrThrow(
        userDataDir,
        dependencyId,
        getConfig,
        dependencyService.listFeatureDependencyStatuses,
      );

      requireFeatureGate(currentStatus.featureId);
      return runDependencyOperation(
        'prepare',
        dependencyId,
        recordDiagnostic,
        async () => {
          const prepared = await dependencyService.prepareFeatureDependency(
            userDataDir,
            dependencyId,
            buildPrepareOptions(getMainWindow, dependencyId, resourcesPath),
          );
          emitFeatureDependencyStatuses(
            getMainWindow,
            userDataDir,
            getConfig,
            dependencyService.listFeatureDependencyStatuses,
          );
          return prepared;
        },
      );
    },
  );

  ipcMain.handle('feature-dependencies:remove', async (event, dependencyId) => {
    const userDataDir = getUserDataDir();
    const currentStatus = getDependencyStatusOrThrow(
      userDataDir,
      dependencyId,
      getConfig,
      dependencyService.listFeatureDependencyStatuses,
    );

    requireFeatureGate(currentStatus.featureId);
    return runDependencyOperation(
      'remove',
      dependencyId,
      recordDiagnostic,
      () => {
        const removed = dependencyService.removeFeatureDependency(
          userDataDir,
          dependencyId,
        );
        emitFeatureDependencyStatuses(
          getMainWindow,
          userDataDir,
          getConfig,
          dependencyService.listFeatureDependencyStatuses,
        );
        return removed;
      },
    );
  });

  ipcMain.handle('feature-dependencies:repair', async (event, dependencyId) => {
    const userDataDir = getUserDataDir();
    const currentStatus = getDependencyStatusOrThrow(
      userDataDir,
      dependencyId,
      getConfig,
      dependencyService.listFeatureDependencyStatuses,
    );

    requireFeatureGate(currentStatus.featureId);
    return runDependencyOperation(
      'repair',
      dependencyId,
      recordDiagnostic,
      async () => {
        const repaired = await dependencyService.repairFeatureDependency(
          userDataDir,
          dependencyId,
          buildPrepareOptions(getMainWindow, dependencyId, resourcesPath),
        );
        emitFeatureDependencyStatuses(
          getMainWindow,
          userDataDir,
          getConfig,
          dependencyService.listFeatureDependencyStatuses,
        );
        return repaired;
      },
    );
  });

  // Read-only PATH probe — no feature gate, since it neither downloads nor
  // installs anything. The renderer can call this speculatively (e.g. on
  // Settings mount) to learn whether the opt-in is even offerable.
  ipcMain.handle('feature-dependencies:detect-system-ffmpeg', async () =>
    runDependencyOperation('detect', null, recordDiagnostic, () =>
      detectSystemFfmpegImpl(),
    ),
  );

  // `useSystem` is the only renderer-controlled input here — main always
  // re-detects and smoke-tests the path itself before persisting it, so a
  // renderer can never make main spawn an arbitrary executable (see
  // config.js's systemFfmpegPath comment for why this boundary matters).
  ipcMain.handle(
    'feature-dependencies:set-ffmpeg-source',
    async (event, useSystem) => {
      requireFeatureGate(dependencyService.getFfmpegDependency().featureId);
      return runDependencyOperation(
        'set-ffmpeg-source',
        dependencyService.getFfmpegDependency().id,
        recordDiagnostic,
        async () => {
          if (!useSystem) {
            updateConfig({ systemFfmpegPath: null });
            emitFeatureDependencyStatuses(
              getMainWindow,
              getUserDataDir(),
              getConfig,
              dependencyService.listFeatureDependencyStatuses,
            );
            return { source: 'managed' };
          }

          const detected = await detectSystemFfmpegImpl();
          if (!detected.ok) {
            throw new Error(detected.reason || 'system FFmpeg unavailable');
          }
          updateConfig({ systemFfmpegPath: detected.path });
          emitFeatureDependencyStatuses(
            getMainWindow,
            getUserDataDir(),
            getConfig,
            dependencyService.listFeatureDependencyStatuses,
          );
          return {
            source: 'system',
            path: detected.path,
            version: detected.version,
          };
        },
      );
    },
  );
}

module.exports = { registerFeatureDependencyHandlers };
