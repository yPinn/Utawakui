'use strict';

const fs = require('fs');
const path = require('path');
const {
  computeAudioPythonManifestHash,
  validateAudioPythonModelManifest,
} = require('./audioPythonManifest');
const { AUDIO_PYTHON_PROTOCOL_VERSION } = require('./audioPythonRuntimeHost');
const {
  createAudioPythonProcessJob,
} = require('./engines/audioPythonProcessJob');

const REFINED_RECIPE_ID = 'refined';
const REFINED_MODEL_ID = 'bs-roformer-viperx-1297';
const REFINED_MODEL_ARCHITECTURE = 'bs-roformer';
const REFINED_WRAPPER_PACKAGE = 'audio-separator';
const REFINED_WRAPPER_VERSION = '0.44.5';
const REFINED_CATALOG_FILENAME = 'download_checks.json';
const REFINED_CONFIG_FILENAME = 'model_bs_roformer_ep_317_sdr_12.9755.yaml';
const REFINED_CHECKPOINT_FILENAME = 'model_bs_roformer_ep_317_sdr_12.9755.ckpt';
const SHA256_RE = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) throw new Error(`invalid ${label}`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`invalid ${label}`);
  }
}

function assertArtifactPresent(filePath, expectedSize) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('Refined worker artifact is missing');
  }
  if (
    Number.isSafeInteger(expectedSize) &&
    fs.statSync(filePath).size !== expectedSize
  ) {
    throw new Error('Refined worker artifact size mismatch');
  }
}

function normalizeRefinedProbeResult(result) {
  const expectedKeys = [
    'implementation',
    'modelId',
    'noUserCache',
    'offlineEnforced',
    'probePassed',
    'protocolVersion',
    'recipeId',
  ];
  if (
    !isPlainObject(result) ||
    Object.keys(result).sort().join(',') !== expectedKeys.sort().join(',') ||
    result.protocolVersion !== AUDIO_PYTHON_PROTOCOL_VERSION ||
    result.probePassed !== true ||
    result.recipeId !== REFINED_RECIPE_ID ||
    result.modelId !== REFINED_MODEL_ID ||
    result.implementation !== 'new-roformer' ||
    result.offlineEnforced !== true ||
    result.noUserCache !== true
  ) {
    throw new Error('Refined worker probe protocol error');
  }
  return { ...result };
}

function createRefinedPythonWorkerProbeJob({
  host,
  runtimeRef,
  environmentRef,
  modelRef,
  catalogSha256,
  jobId,
  releaseGenerationLease,
  emitProgress,
  createProcessJob = createAudioPythonProcessJob,
}) {
  let workspace = null;
  let cleanupComplete = false;

  function releaseLease() {
    if (typeof releaseGenerationLease === 'function') {
      releaseGenerationLease();
    }
  }

  function cleanup() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    try {
      workspace?.cleanup();
    } finally {
      releaseLease();
    }
  }

  try {
    if (
      !host ||
      typeof host.getRuntimeArtifactPaths !== 'function' ||
      typeof host.getEnvironmentPaths !== 'function' ||
      typeof host.getModelPaths !== 'function' ||
      typeof host.resolveCapabilityWorkerPath !== 'function' ||
      typeof host.createJobWorkspace !== 'function'
    ) {
      throw new Error('audio Python runtime host is required');
    }
    assertExactKeys(
      runtimeRef,
      ['familyId', 'artifactHash'],
      'Refined runtime reference',
    );
    assertExactKeys(
      environmentRef,
      ['id', 'lockHash'],
      'Refined environment reference',
    );
    assertExactKeys(
      modelRef,
      ['version', 'manifestHash'],
      'Refined model reference',
    );
    if (!['separation-cpu', 'combined-ml'].includes(environmentRef.id)) {
      throw new Error('invalid Refined environment');
    }
    if (!SHA256_RE.test(modelRef.manifestHash || '')) {
      throw new Error('invalid Refined model manifest hash');
    }
    if (!SHA256_RE.test(catalogSha256 || '')) {
      throw new Error('invalid Refined catalog hash');
    }

    const runtimePaths = host.getRuntimeArtifactPaths(
      runtimeRef.familyId,
      runtimeRef.artifactHash,
    );
    const environmentPaths = host.getEnvironmentPaths(
      environmentRef.id,
      environmentRef.lockHash,
    );
    const modelPaths = host.getModelPaths(
      'separation',
      REFINED_MODEL_ID,
      modelRef.version,
    );
    const workerPath = host.resolveCapabilityWorkerPath(REFINED_RECIPE_ID);

    if (!fs.existsSync(runtimePaths.pythonPath)) {
      throw new Error('Refined worker runtime is missing');
    }
    if (!fs.existsSync(environmentPaths.sitePackagesPath)) {
      throw new Error('Refined worker environment is missing');
    }
    if (!fs.existsSync(modelPaths.manifestPath)) {
      throw new Error('Refined worker model manifest is missing');
    }
    const modelManifest = validateAudioPythonModelManifest(
      JSON.parse(fs.readFileSync(modelPaths.manifestPath, 'utf8')),
    );
    if (
      computeAudioPythonManifestHash(modelManifest) !== modelRef.manifestHash
    ) {
      throw new Error('Refined worker model manifest hash mismatch');
    }
    if (
      modelManifest.id !== REFINED_MODEL_ID ||
      modelManifest.architecture !== REFINED_MODEL_ARCHITECTURE ||
      modelManifest.wrapper.package !== REFINED_WRAPPER_PACKAGE ||
      modelManifest.wrapper.version !== REFINED_WRAPPER_VERSION ||
      modelManifest.wrapper.modelFilename !== REFINED_CHECKPOINT_FILENAME
    ) {
      throw new Error('invalid fixed Refined model');
    }
    const config = modelManifest.files.find(({ role }) => role === 'config');
    const checkpoint = modelManifest.files.find(
      ({ role }) => role === 'weights',
    );
    if (
      config?.filename !== REFINED_CONFIG_FILENAME ||
      checkpoint?.filename !== REFINED_CHECKPOINT_FILENAME
    ) {
      throw new Error('invalid fixed Refined model files');
    }

    const catalogPath = path.join(
      modelPaths.installDir,
      REFINED_CATALOG_FILENAME,
    );
    const configPath = path.join(modelPaths.installDir, config.filename);
    const checkpointPath = path.join(
      modelPaths.installDir,
      checkpoint.filename,
    );
    assertArtifactPresent(catalogPath);
    assertArtifactPresent(configPath, config.sizeBytes);
    assertArtifactPresent(checkpointPath, checkpoint.sizeBytes);

    workspace = host.createJobWorkspace({
      capabilityId: REFINED_RECIPE_ID,
      jobId,
      generationId: 'unactivated-refined-probe',
      environmentHash: environmentRef.lockHash,
    });
    const processJob = createProcessJob({
      executablePath: runtimePaths.pythonPath,
      workerPath,
      request: {
        operation: 'probe-refined',
        recipeId: REFINED_RECIPE_ID,
        modelId: REFINED_MODEL_ID,
        environmentPath: environmentPaths.sitePackagesPath,
        jobPath: workspace.jobDir,
        modelPath: modelPaths.installDir,
        files: {
          catalog: { path: catalogPath, sha256: catalogSha256 },
          config: { path: configPath, sha256: config.sha256 },
          checkpoint: { path: checkpointPath, sha256: checkpoint.sha256 },
        },
      },
      emitProgress,
      cleanup,
    });
    return {
      result: Promise.resolve(processJob.result).then(
        normalizeRefinedProbeResult,
      ),
      cancel: processJob.cancel,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

module.exports = {
  REFINED_MODEL_ID,
  REFINED_RECIPE_ID,
  createRefinedPythonWorkerProbeJob,
};
