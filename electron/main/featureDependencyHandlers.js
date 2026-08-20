'use strict';

const { app } = require('electron');
const {
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
} = require('../lib/featureDependencies');

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
      const currentStatus = listFeatureDependencyStatuses(
        app.getPath('userData'),
      ).find((dependency) => dependency.id === dependencyId);
      if (!currentStatus) {
        throw new Error(`unknown feature dependency: ${dependencyId}`);
      }

      requireFeatureGate(currentStatus.featureId);
      const prepared = await prepareFeatureDependency(
        app.getPath('userData'),
        dependencyId,
      );
      getMainWindow()?.webContents.send(
        'feature-dependencies:updated',
        listFeatureDependencyStatuses(app.getPath('userData')),
      );
      return prepared;
    },
  );
}

module.exports = { registerFeatureDependencyHandlers };
