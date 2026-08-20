'use strict';

const { app } = require('electron');
const {
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
} = require('../lib/featureDependencies');

function getDependencyStatusOrThrow(userDataDir, dependencyId) {
  const currentStatus = listFeatureDependencyStatuses(userDataDir).find(
    (dependency) => dependency.id === dependencyId,
  );
  if (!currentStatus) {
    throw new Error(`unknown feature dependency: ${dependencyId}`);
  }
  return currentStatus;
}

function emitFeatureDependencyStatuses(getMainWindow, userDataDir) {
  getMainWindow()?.webContents.send(
    'feature-dependencies:updated',
    listFeatureDependencyStatuses(userDataDir),
  );
}

function registerFeatureDependencyHandlers({
  ipcMain,
  requireFeatureGate,
  getMainWindow,
}) {
  ipcMain.handle('feature-dependencies:list', async () =>
    listFeatureDependencyStatuses(app.getPath('userData')),
  );

  ipcMain.handle(
    'feature-dependencies:prepare',
    async (event, dependencyId) => {
      const userDataDir = app.getPath('userData');
      const currentStatus = getDependencyStatusOrThrow(
        userDataDir,
        dependencyId,
      );

      requireFeatureGate(currentStatus.featureId);
      const prepared = await prepareFeatureDependency(
        userDataDir,
        dependencyId,
        app.isPackaged ? { resourcesPath: process.resourcesPath } : {},
      );
      emitFeatureDependencyStatuses(getMainWindow, userDataDir);
      return prepared;
    },
  );

  ipcMain.handle('feature-dependencies:remove', async (event, dependencyId) => {
    const userDataDir = app.getPath('userData');
    const currentStatus = getDependencyStatusOrThrow(userDataDir, dependencyId);

    requireFeatureGate(currentStatus.featureId);
    const removed = removeFeatureDependency(userDataDir, dependencyId);
    emitFeatureDependencyStatuses(getMainWindow, userDataDir);
    return removed;
  });

  ipcMain.handle('feature-dependencies:repair', async (event, dependencyId) => {
    const userDataDir = app.getPath('userData');
    const currentStatus = getDependencyStatusOrThrow(userDataDir, dependencyId);

    requireFeatureGate(currentStatus.featureId);
    const repaired = await repairFeatureDependency(
      userDataDir,
      dependencyId,
      app.isPackaged ? { resourcesPath: process.resourcesPath } : {},
    );
    emitFeatureDependencyStatuses(getMainWindow, userDataDir);
    return repaired;
  });
}

module.exports = { registerFeatureDependencyHandlers };
