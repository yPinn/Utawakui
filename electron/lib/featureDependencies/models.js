'use strict';

const fs = require('fs');
const registry = require('../../../shared/featureDependencies.json');
const { atomicWriteBuffer } = require('../atomicWrite');
const { FEATURE_IDS } = require('../featureGates');
const {
  getFeatureDependency,
  getModelDependencyPaths,
  getSeparationModelDependency,
} = require('./registry');
const { downloadBuffer, emitProgress, sha256 } = require('./download');
const {
  createMissingDependencyError,
  writeDependencyManifest,
  writeDependencyNotices,
} = require('./manifests');

function isModelFileValid(filePath, dependency, options = {}) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.size !== dependency.expectedSize) return false;
  if (options.verifySha) {
    return sha256(fs.readFileSync(filePath)) === dependency.sha256;
  }
  return true;
}

function validateDownloadedModel(buffer, dependency) {
  if (buffer.length !== dependency.expectedSize) {
    throw new Error(
      `Downloaded model size ${buffer.length} does not match expected ${dependency.expectedSize}`,
    );
  }
  const actualSha = sha256(buffer);
  if (actualSha !== dependency.sha256) {
    throw new Error(
      `Downloaded model checksum ${actualSha} does not match expected ${dependency.sha256}`,
    );
  }
}

function installModelBuffer(userDataDir, dependency, buffer, options = {}) {
  emitProgress(options, { stage: 'verifying' });
  validateDownloadedModel(buffer, dependency);
  const { installDir, manifestPath, filePath } = getModelDependencyPaths(
    userDataDir,
    dependency,
  );
  fs.mkdirSync(installDir, { recursive: true });
  atomicWriteBuffer(filePath, buffer);
  writeDependencyNotices(installDir, dependency);
  writeDependencyManifest(manifestPath, dependency, options);
  return filePath;
}

function removeSupersededModelDependencies(
  userDataDir,
  dependency,
  dependencies = registry.dependencies,
) {
  for (const dependencyId of dependency.supersedes || []) {
    const superseded = getFeatureDependency(dependencyId, dependencies);
    if (
      !superseded ||
      superseded.kind !== 'model' ||
      superseded.deprecated !== true
    ) {
      throw new Error(`invalid superseded model dependency: ${dependencyId}`);
    }
    fs.rmSync(getModelDependencyPaths(userDataDir, superseded).installDir, {
      recursive: true,
      force: true,
    });
  }
}

function finishModelDependency(userDataDir, dependency, filePath, options) {
  removeSupersededModelDependencies(
    userDataDir,
    dependency,
    options.registryDependencies,
  );
  emitProgress(options, { stage: 'ready', percent: 100 });
  return filePath;
}

async function ensureModelDependency(userDataDir, modelId, options = {}) {
  const dependency =
    options.dependency || getSeparationModelDependency(modelId);
  if (
    dependency.featureId !== FEATURE_IDS.AUDIO_PROCESSING_FLOW ||
    dependency.kind !== 'model'
  ) {
    throw new Error(`unsupported model dependency manifest: ${dependency.id}`);
  }

  const paths = getModelDependencyPaths(userDataDir, dependency);
  if (isModelFileValid(paths.filePath, dependency, { verifySha: true })) {
    writeDependencyNotices(paths.installDir, dependency);
    if (!fs.existsSync(paths.manifestPath)) {
      writeDependencyManifest(paths.manifestPath, dependency, options);
    }
    return finishModelDependency(
      userDataDir,
      dependency,
      paths.filePath,
      options,
    );
  }

  if (isModelFileValid(paths.legacyPath, dependency, { verifySha: true })) {
    return finishModelDependency(
      userDataDir,
      dependency,
      installModelBuffer(
        userDataDir,
        dependency,
        fs.readFileSync(paths.legacyPath),
        options,
      ),
      options,
    );
  }

  const buffer = await downloadBuffer(
    dependency.downloadUrl,
    options.fetchImpl,
    options,
    dependency,
  );
  return finishModelDependency(
    userDataDir,
    dependency,
    installModelBuffer(userDataDir, dependency, buffer, options),
    options,
  );
}

function getPreparedSeparationModelPath(userDataDir, modelId) {
  const dependency = getSeparationModelDependency(modelId);
  const { filePath } = getModelDependencyPaths(userDataDir, dependency);
  if (!isModelFileValid(filePath, dependency, { verifySha: true })) {
    throw createMissingDependencyError(dependency);
  }
  return filePath;
}

module.exports = {
  ensureModelDependency,
  getPreparedSeparationModelPath,
  isModelFileValid,
};
