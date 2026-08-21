'use strict';

const { app } = require('electron');
const {
  getFfmpegDependency,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
} = require('../lib/featureDependencies');
const { detectSystemFfmpeg } = require('../lib/systemFfmpeg');

function getDependencyStatusOrThrow(userDataDir, dependencyId, getConfig) {
  const currentStatus = listFeatureDependencyStatuses(
    userDataDir,
    undefined,
    getConfig().systemFfmpegPath,
  ).find((dependency) => dependency.id === dependencyId);
  if (!currentStatus) {
    throw new Error(`unknown feature dependency: ${dependencyId}`);
  }
  return currentStatus;
}

function emitFeatureDependencyStatuses(getMainWindow, userDataDir, getConfig) {
  getMainWindow()?.webContents.send(
    'feature-dependencies:updated',
    listFeatureDependencyStatuses(
      userDataDir,
      undefined,
      getConfig().systemFfmpegPath,
    ),
  );
}

function emitFeatureDependencyProgress(getMainWindow, dependencyId, payload) {
  getMainWindow()?.webContents.send('feature-dependencies:progress', {
    dependencyId,
    ...payload,
  });
}

function buildPrepareOptions(getMainWindow, dependencyId) {
  return {
    ...(app.isPackaged ? { resourcesPath: process.resourcesPath } : {}),
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
}) {
  ipcMain.handle('feature-dependencies:list', async () =>
    listFeatureDependencyStatuses(
      app.getPath('userData'),
      undefined,
      getConfig().systemFfmpegPath,
    ),
  );

  ipcMain.handle(
    'feature-dependencies:prepare',
    async (event, dependencyId) => {
      const userDataDir = app.getPath('userData');
      const currentStatus = getDependencyStatusOrThrow(
        userDataDir,
        dependencyId,
        getConfig,
      );

      requireFeatureGate(currentStatus.featureId);
      const prepared = await prepareFeatureDependency(
        userDataDir,
        dependencyId,
        buildPrepareOptions(getMainWindow, dependencyId),
      );
      emitFeatureDependencyStatuses(getMainWindow, userDataDir, getConfig);
      return prepared;
    },
  );

  ipcMain.handle('feature-dependencies:remove', async (event, dependencyId) => {
    const userDataDir = app.getPath('userData');
    const currentStatus = getDependencyStatusOrThrow(
      userDataDir,
      dependencyId,
      getConfig,
    );

    requireFeatureGate(currentStatus.featureId);
    const removed = removeFeatureDependency(userDataDir, dependencyId);
    emitFeatureDependencyStatuses(getMainWindow, userDataDir, getConfig);
    return removed;
  });

  ipcMain.handle('feature-dependencies:repair', async (event, dependencyId) => {
    const userDataDir = app.getPath('userData');
    const currentStatus = getDependencyStatusOrThrow(
      userDataDir,
      dependencyId,
      getConfig,
    );

    requireFeatureGate(currentStatus.featureId);
    const repaired = await repairFeatureDependency(
      userDataDir,
      dependencyId,
      buildPrepareOptions(getMainWindow, dependencyId),
    );
    emitFeatureDependencyStatuses(getMainWindow, userDataDir, getConfig);
    return repaired;
  });

  // Read-only PATH probe — no feature gate, since it neither downloads nor
  // installs anything. The renderer can call this speculatively (e.g. on
  // Settings mount) to learn whether the opt-in is even offerable.
  ipcMain.handle('feature-dependencies:detect-system-ffmpeg', async () =>
    detectSystemFfmpeg(),
  );

  // `useSystem` is the only renderer-controlled input here — main always
  // re-detects and smoke-tests the path itself before persisting it, so a
  // renderer can never make main spawn an arbitrary executable (see
  // config.js's systemFfmpegPath comment for why this boundary matters).
  ipcMain.handle(
    'feature-dependencies:set-ffmpeg-source',
    async (event, useSystem) => {
      requireFeatureGate(getFfmpegDependency().featureId);

      if (!useSystem) {
        updateConfig({ systemFfmpegPath: null });
        emitFeatureDependencyStatuses(
          getMainWindow,
          app.getPath('userData'),
          getConfig,
        );
        return { source: 'managed' };
      }

      const detected = await detectSystemFfmpeg();
      if (!detected.ok) {
        throw new Error(detected.reason || '找不到可用的系統 FFmpeg');
      }
      updateConfig({ systemFfmpegPath: detected.path });
      emitFeatureDependencyStatuses(
        getMainWindow,
        app.getPath('userData'),
        getConfig,
      );
      return {
        source: 'system',
        path: detected.path,
        version: detected.version,
      };
    },
  );
}

module.exports = { registerFeatureDependencyHandlers };
