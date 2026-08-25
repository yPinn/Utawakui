'use strict';

const fs = require('fs');
const { isProviderRuntimeInstalled } = require('../providerRuntime');
const {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  getFeatureDependencies,
  getFeatureDependency,
  getFfmpegPaths,
  getManagedDependencyCleanupPaths,
  getModelDependencyPaths,
  getYtdlpPaths,
} = require('./registry');
const {
  isDependencyUpdateAvailable,
  readInstalledAt,
  readInstalledVersion,
} = require('./manifests');
const { ensureYtdlpDependency } = require('./providerRuntime');
const { ensureFfmpegDependency } = require('./ffmpeg');
const { ensureModelDependency, isModelFileValid } = require('./models');

function buildDependencyStatus(userDataDir, dependency, systemFfmpegPath) {
  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    const paths = getYtdlpPaths(userDataDir, dependency);
    const installed = isProviderRuntimeInstalled(paths);
    const installedVersion = installed
      ? readInstalledVersion(paths.manifestPath)
      : null;
    return {
      ...dependency,
      installed,
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion,
      updateAvailable: isDependencyUpdateAvailable(
        dependency,
        installedVersion,
      ),
    };
  }

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    // A live systemFfmpegPath always wins over the managed install's own
    // presence — separationHandlers.js resolves the same way (see
    // getPreparedFfmpegPath above), so the Settings row must agree with
    // what a separation run would actually use.
    if (systemFfmpegPath && fs.existsSync(systemFfmpegPath)) {
      return {
        ...dependency,
        installed: true,
        source: 'system',
        installedAt: null,
        installedVersion: null,
        updateAvailable: false,
      };
    }

    const paths = getFfmpegPaths(userDataDir, dependency);
    const installed = fs.existsSync(paths.executablePath);
    const installedVersion = installed
      ? readInstalledVersion(paths.manifestPath)
      : null;
    return {
      ...dependency,
      installed,
      source: 'managed',
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion,
      updateAvailable: isDependencyUpdateAvailable(
        dependency,
        installedVersion,
      ),
    };
  }

  if (dependency.kind === 'model') {
    const paths = getModelDependencyPaths(userDataDir, dependency);
    const installed = isModelFileValid(paths.filePath, dependency, {
      verifySha: true,
    });
    const legacyAvailable =
      !installed &&
      isModelFileValid(paths.legacyPath, dependency, { verifySha: true });
    const installedVersion = installed
      ? readInstalledVersion(paths.manifestPath)
      : null;
    return {
      ...dependency,
      installed,
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion,
      updateAvailable: isDependencyUpdateAvailable(
        dependency,
        installedVersion,
      ),
      canMigrate: legacyAvailable,
    };
  }

  return {
    ...dependency,
    installed: false,
    installedAt: null,
    updateAvailable: false,
  };
}

function listFeatureDependencyStatuses(
  userDataDir,
  dependencies = getFeatureDependencies(),
  systemFfmpegPath = null,
) {
  return dependencies.map((dependency) =>
    buildDependencyStatus(userDataDir, dependency, systemFfmpegPath),
  );
}

async function prepareFeatureDependency(
  userDataDir,
  dependencyId,
  options = {},
) {
  const dependency = getFeatureDependency(
    dependencyId,
    options.registryDependencies,
  );
  if (!dependency)
    throw new Error(`unknown feature dependency: ${dependencyId}`);

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    await ensureFfmpegDependency(userDataDir, options);
    return buildDependencyStatus(userDataDir, dependency);
  }

  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    await ensureYtdlpDependency(userDataDir, options);
    return buildDependencyStatus(userDataDir, dependency);
  }

  if (dependency.kind === 'model') {
    await ensureModelDependency(userDataDir, dependency.modelId, {
      ...options,
      dependency,
    });
    return buildDependencyStatus(userDataDir, dependency);
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

function removeFeatureDependency(userDataDir, dependencyId, options = {}) {
  const dependency = getFeatureDependency(
    dependencyId,
    options.registryDependencies,
  );
  if (!dependency)
    throw new Error(`unknown feature dependency: ${dependencyId}`);

  for (const cleanupPath of getManagedDependencyCleanupPaths(
    userDataDir,
    dependency,
  )) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
  return buildDependencyStatus(userDataDir, dependency);
}

async function repairFeatureDependency(
  userDataDir,
  dependencyId,
  options = {},
) {
  removeFeatureDependency(userDataDir, dependencyId, options);
  return prepareFeatureDependency(userDataDir, dependencyId, options);
}

module.exports = {
  buildDependencyStatus,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
};
