'use strict';

const path = require('path');
const registry = require('../../../shared/featureDependencies.json');
const { getProviderRuntimePaths } = require('../providerRuntime');

const FEATURE_DEPENDENCIES_DIRNAME = 'dependencies';
const FFMPEG_DEPENDENCY_ID = 'ffmpeg-gyan-essentials';
const YTDLP_DEPENDENCY_ID = 'yt-dlp-provider-tool';
const SEPARATION_MODEL_DEPENDENCY_IDS = Object.freeze({
  kara2: 'uvr-mdxnet-kara-2',
  'inst-hq4': 'uvr-mdxnet-inst-hq-4',
});
const SAFE_PATH_COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,255}$/i;

function requireAbsoluteUserDataDir(userDataDir) {
  if (typeof userDataDir !== 'string' || !path.isAbsolute(userDataDir)) {
    throw new Error('feature dependency user data directory must be absolute');
  }
  return path.resolve(userDataDir);
}

function requireSafePathComponent(value, label) {
  if (
    typeof value !== 'string' ||
    !SAFE_PATH_COMPONENT_RE.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`invalid feature dependency ${label}`);
  }
  return value;
}

function resolveManagedRelativePath(rootDir, relativePath, label) {
  const segments =
    typeof relativePath === 'string'
      ? relativePath.replaceAll('\\', '/').split('/').filter(Boolean)
      : [];
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    segments.includes('..')
  ) {
    throw new Error(`invalid feature dependency ${label}`);
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (
    relative.length === 0 ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`invalid feature dependency ${label}`);
  }
  return resolvedPath;
}

function getFeatureDependency(
  dependencyId,
  dependencies = registry.dependencies,
) {
  return (
    dependencies.find((dependency) => dependency.id === dependencyId) || null
  );
}

function getFeatureDependencies(dependencies = registry.dependencies) {
  return dependencies.filter((dependency) => dependency.deprecated !== true);
}

function getFfmpegDependency() {
  const dependency = getFeatureDependency(FFMPEG_DEPENDENCY_ID);
  if (!dependency)
    throw new Error(`missing feature dependency: ${FFMPEG_DEPENDENCY_ID}`);
  return dependency;
}

function getYtdlpDependency() {
  const dependency = getFeatureDependency(YTDLP_DEPENDENCY_ID);
  if (!dependency)
    throw new Error(`missing feature dependency: ${YTDLP_DEPENDENCY_ID}`);
  return dependency;
}

function getSeparationModelDependency(modelId) {
  const dependencyId = SEPARATION_MODEL_DEPENDENCY_IDS[modelId];
  if (!dependencyId) throw new Error(`unknown separation model: ${modelId}`);
  const dependency = getFeatureDependency(dependencyId);
  if (!dependency)
    throw new Error(`missing feature dependency: ${dependencyId}`);
  return dependency;
}

function getFfmpegPaths(userDataDir, dependency = getFfmpegDependency()) {
  const root = requireAbsoluteUserDataDir(userDataDir);
  const installVersion = requireSafePathComponent(
    dependency.installVersion ?? dependency.version,
    'install version',
  );
  const installDir = path.join(
    root,
    FEATURE_DEPENDENCIES_DIRNAME,
    'ffmpeg',
    installVersion,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    executablePath: resolveManagedRelativePath(
      installDir,
      dependency.executableRelativePath,
      'executable path',
    ),
  };
}

function getYtdlpPaths(userDataDir, dependency = getYtdlpDependency()) {
  requireAbsoluteUserDataDir(userDataDir);
  if (dependency.kind !== 'runtime') {
    throw new Error(`unsupported yt-dlp dependency manifest: ${dependency.id}`);
  }
  return getProviderRuntimePaths(userDataDir);
}

function getModelDependencyPaths(userDataDir, dependency) {
  const root = requireAbsoluteUserDataDir(userDataDir);
  const dependencyId = requireSafePathComponent(dependency.id, 'dependency id');
  const version = requireSafePathComponent(dependency.version, 'model version');
  const installDir = path.join(
    root,
    FEATURE_DEPENDENCIES_DIRNAME,
    'models',
    dependencyId,
    version,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    filePath: resolveManagedRelativePath(
      installDir,
      dependency.fileRelativePath,
      'model file path',
    ),
    legacyPath: resolveManagedRelativePath(
      path.join(root, 'models'),
      dependency.fileRelativePath,
      'legacy model file path',
    ),
  };
}

function getManagedDependencyCleanupPaths(userDataDir, dependency) {
  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    return [path.dirname(getYtdlpPaths(userDataDir, dependency).installDir)];
  }

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    return [path.dirname(getFfmpegPaths(userDataDir, dependency).installDir)];
  }

  if (dependency.kind === 'model') {
    const paths = getModelDependencyPaths(userDataDir, dependency);
    return [path.dirname(paths.installDir), paths.legacyPath];
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

function getManagedDependencyInstallDir(userDataDir, dependency) {
  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    return getYtdlpPaths(userDataDir, dependency).installDir;
  }

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    return getFfmpegPaths(userDataDir, dependency).installDir;
  }

  if (dependency.kind === 'model') {
    return getModelDependencyPaths(userDataDir, dependency).installDir;
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

module.exports = {
  FEATURE_DEPENDENCIES_DIRNAME,
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  SEPARATION_MODEL_DEPENDENCY_IDS,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegDependency,
  getYtdlpDependency,
  getSeparationModelDependency,
  getFfmpegPaths,
  getYtdlpPaths,
  getModelDependencyPaths,
  getManagedDependencyInstallDir,
  getManagedDependencyCleanupPaths,
};
