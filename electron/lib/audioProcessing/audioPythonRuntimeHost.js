'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteText } = require('../atomicWrite');

const AUDIO_PYTHON_PROTOCOL_VERSION = 1;
const AUDIO_PYTHON_WORKER_RELATIVE_PATH = path.join(
  'audio-processing',
  'audio_python_worker.py',
);
const AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH = path.join(
  'audio-processing',
  'refined_worker.py',
);
const AUDIO_PYTHON_ENVIRONMENT_IDS = Object.freeze([
  'separation-cpu',
  'analysis-structure',
  'combined-ml',
]);
const AUDIO_PYTHON_CAPABILITY_IDS = Object.freeze([
  'refined',
  'structure-analysis',
]);
const AUDIO_PYTHON_MODEL_KINDS = Object.freeze(['separation', 'analysis']);
const SAFE_COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_JOB_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/i;
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
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`invalid ${label}`);
  }
}

function assertSafeComponent(value, label) {
  if (!SAFE_COMPONENT_RE.test(value || '') || value === '.' || value === '..') {
    throw new Error(`invalid ${label}`);
  }
}

function assertHash(value, label) {
  if (!SHA256_RE.test(value || '')) throw new Error(`invalid ${label} hash`);
}

function getAudioPythonFamilyPaths(userDataDir) {
  if (!path.isAbsolute(userDataDir || '')) {
    throw new Error('audio Python user data directory must be absolute');
  }
  const root = path.join(userDataDir, 'dependencies', 'audio-python');
  const activationsDir = path.join(root, 'activations');
  return {
    userDataDir,
    root,
    runtimesDir: path.join(root, 'runtimes'),
    environmentsDir: path.join(root, 'environments'),
    activationsDir,
    generationsDir: path.join(activationsDir, 'generations'),
    currentActivationPath: path.join(activationsDir, 'current.json'),
    modelsDir: path.join(root, 'models'),
    jobsDir: path.join(root, 'jobs'),
  };
}

function getRuntimeArtifactPaths(paths, runtimeFamilyId, artifactHash) {
  assertSafeComponent(runtimeFamilyId, 'runtime family id');
  assertHash(artifactHash, 'runtime artifact');
  const installDir = path.join(
    paths.runtimesDir,
    runtimeFamilyId,
    artifactHash,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    pythonPath: path.join(installDir, 'python.exe'),
  };
}

function getEnvironmentPaths(paths, environmentId, lockHash) {
  if (!AUDIO_PYTHON_ENVIRONMENT_IDS.includes(environmentId)) {
    throw new Error('invalid audio Python environment id');
  }
  assertHash(lockHash, 'environment lock');
  const installDir = path.join(paths.environmentsDir, environmentId, lockHash);
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    sitePackagesPath: path.join(installDir, 'Lib', 'site-packages'),
  };
}

function getModelPaths(paths, kind, modelId, version) {
  if (!AUDIO_PYTHON_MODEL_KINDS.includes(kind)) {
    throw new Error('invalid audio Python model kind');
  }
  assertSafeComponent(modelId, 'model id');
  assertSafeComponent(version, 'model version');
  const installDir = path.join(paths.modelsDir, kind, modelId, version);
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
  };
}

function resolveAudioPythonWorkerResourcePath({
  isPackaged,
  resourcesPath,
  appPath,
  relativePath,
  existsSync = fs.existsSync,
}) {
  const rootPath = isPackaged
    ? resourcesPath
    : typeof appPath === 'string'
      ? path.join(appPath, 'resources')
      : null;
  if (!rootPath || !path.isAbsolute(rootPath)) {
    throw new Error('missing audio Python worker resource root');
  }
  const workerPath = path.join(rootPath, relativePath);
  if (!existsSync(workerPath)) {
    throw new Error('audio Python worker bootstrap is missing');
  }
  return workerPath;
}

function resolveAudioPythonWorkerPath(options) {
  return resolveAudioPythonWorkerResourcePath({
    ...options,
    relativePath: AUDIO_PYTHON_WORKER_RELATIVE_PATH,
  });
}

function resolveAudioPythonCapabilityWorkerPath(capabilityId, options) {
  if (capabilityId !== 'refined') {
    throw new Error('audio Python capability worker is not available');
  }
  return resolveAudioPythonWorkerResourcePath({
    ...options,
    relativePath: AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH,
  });
}

function validateCapability(capabilityId, capability) {
  assertExactKeys(
    capability,
    ['runtime', 'environment', 'worker', 'model'],
    'audio Python capability generation',
  );
  assertExactKeys(
    capability.runtime,
    ['familyId', 'artifactHash'],
    'audio Python runtime reference',
  );
  assertSafeComponent(capability.runtime.familyId, 'runtime family id');
  assertHash(capability.runtime.artifactHash, 'runtime artifact');
  assertExactKeys(
    capability.environment,
    ['id', 'lockHash'],
    'audio Python environment reference',
  );
  if (!AUDIO_PYTHON_ENVIRONMENT_IDS.includes(capability.environment.id)) {
    throw new Error('invalid audio Python environment id');
  }
  assertHash(capability.environment.lockHash, 'environment lock');
  assertExactKeys(
    capability.worker,
    ['protocolVersion'],
    'audio Python worker reference',
  );
  if (capability.worker.protocolVersion !== AUDIO_PYTHON_PROTOCOL_VERSION) {
    throw new Error('invalid audio Python worker protocol');
  }
  assertExactKeys(
    capability.model,
    ['kind', 'id', 'version', 'manifestHash'],
    'audio Python model reference',
  );
  if (!AUDIO_PYTHON_MODEL_KINDS.includes(capability.model.kind)) {
    throw new Error('invalid audio Python model kind');
  }
  assertSafeComponent(capability.model.id, 'model id');
  assertSafeComponent(capability.model.version, 'model version');
  assertHash(capability.model.manifestHash, 'model manifest');

  const mappingIsValid =
    capabilityId === 'refined'
      ? ['separation-cpu', 'combined-ml'].includes(capability.environment.id) &&
        capability.model.kind === 'separation'
      : ['analysis-structure', 'combined-ml'].includes(
          capability.environment.id,
        ) && capability.model.kind === 'analysis';
  if (!mappingIsValid) {
    throw new Error('invalid audio Python capability mapping');
  }
}

function validateActivationGeneration(generation) {
  assertExactKeys(
    generation,
    ['schemaVersion', 'generationId', 'createdAt', 'capabilities'],
    'audio Python activation generation',
  );
  if (generation.schemaVersion !== 1) {
    throw new Error('invalid audio Python activation generation');
  }
  assertSafeComponent(generation.generationId, 'activation generation id');
  if (
    typeof generation.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(generation.createdAt))
  ) {
    throw new Error('invalid audio Python activation generation');
  }
  if (!isPlainObject(generation.capabilities)) {
    throw new Error('invalid audio Python activation generation');
  }
  const capabilityIds = Object.keys(generation.capabilities);
  if (
    capabilityIds.some(
      (capabilityId) => !AUDIO_PYTHON_CAPABILITY_IDS.includes(capabilityId),
    )
  ) {
    throw new Error('invalid audio Python activation generation');
  }
  for (const capabilityId of capabilityIds) {
    validateCapability(capabilityId, generation.capabilities[capabilityId]);
  }
  const refined = generation.capabilities.refined;
  const analysis = generation.capabilities['structure-analysis'];
  if (
    refined?.environment.id === 'combined-ml' &&
    analysis?.environment.id === 'combined-ml' &&
    (refined.environment.lockHash !== analysis.environment.lockHash ||
      refined.runtime.familyId !== analysis.runtime.familyId ||
      refined.runtime.artifactHash !== analysis.runtime.artifactHash)
  ) {
    throw new Error('invalid combined audio Python capability mapping');
  }
  return JSON.parse(JSON.stringify(generation));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createAudioPythonRuntimeHost({
  userDataDir,
  isPackaged = false,
  resourcesPath,
  appPath,
  existsSync = fs.existsSync,
}) {
  const paths = getAudioPythonFamilyPaths(userDataDir);
  const leaseCounts = new Map();

  function publishActivation(input) {
    const generation = validateActivationGeneration(input);
    fs.mkdirSync(paths.generationsDir, { recursive: true });
    const generationPath = path.join(
      paths.generationsDir,
      `${generation.generationId}.json`,
    );
    const generationBytes = `${JSON.stringify(generation, null, 2)}\n`;
    if (fs.existsSync(generationPath)) {
      if (fs.readFileSync(generationPath, 'utf8') !== generationBytes) {
        throw new Error('audio Python activation generation is immutable');
      }
    } else {
      atomicWriteText(generationPath, generationBytes);
    }
    atomicWriteText(
      paths.currentActivationPath,
      `${JSON.stringify(
        { schemaVersion: 1, generationId: generation.generationId },
        null,
        2,
      )}\n`,
    );
    return generation;
  }

  function getCurrentActivation() {
    const pointer = readJson(paths.currentActivationPath);
    assertExactKeys(
      pointer,
      ['schemaVersion', 'generationId'],
      'audio Python activation pointer',
    );
    if (pointer.schemaVersion !== 1) {
      throw new Error('invalid audio Python activation pointer');
    }
    assertSafeComponent(pointer.generationId, 'activation generation id');
    const generationPath = path.join(
      paths.generationsDir,
      `${pointer.generationId}.json`,
    );
    const generation = validateActivationGeneration(readJson(generationPath));
    if (generation.generationId !== pointer.generationId) {
      throw new Error('invalid audio Python activation pointer');
    }
    return generation;
  }

  function acquireCurrentGeneration() {
    const generation = getCurrentActivation();
    const generationId = generation.generationId;
    leaseCounts.set(generationId, (leaseCounts.get(generationId) || 0) + 1);
    let released = false;
    return {
      generation,
      release() {
        if (released) return;
        released = true;
        const nextCount = (leaseCounts.get(generationId) || 1) - 1;
        if (nextCount === 0) leaseCounts.delete(generationId);
        else leaseCounts.set(generationId, nextCount);
      },
    };
  }

  function canCollectGeneration(generationId) {
    assertSafeComponent(generationId, 'activation generation id');
    if ((leaseCounts.get(generationId) || 0) > 0) return false;
    if (!fs.existsSync(paths.currentActivationPath)) return true;
    return getCurrentActivation().generationId !== generationId;
  }

  function createJobWorkspace({
    capabilityId,
    jobId,
    generationId,
    environmentHash,
  }) {
    if (!AUDIO_PYTHON_CAPABILITY_IDS.includes(capabilityId)) {
      throw new Error('invalid audio Python capability id');
    }
    if (!SAFE_JOB_ID_RE.test(jobId || '')) {
      throw new Error('invalid audio Python job id');
    }
    assertSafeComponent(generationId, 'activation generation id');
    assertHash(environmentHash, 'environment');
    const capabilityDir = path.join(paths.jobsDir, capabilityId);
    const jobDir = path.join(capabilityDir, jobId);
    fs.mkdirSync(capabilityDir, { recursive: true });
    fs.mkdirSync(jobDir);
    const manifestPath = path.join(jobDir, 'job.json');
    atomicWriteText(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          capabilityId,
          jobId,
          generationId,
          environmentHash,
        },
        null,
        2,
      )}\n`,
    );
    let cleaned = false;
    return {
      jobDir,
      manifestPath,
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        fs.rmSync(jobDir, { recursive: true, force: true });
      },
    };
  }

  return {
    paths,
    getRuntimeArtifactPaths: (runtimeFamilyId, artifactHash) =>
      getRuntimeArtifactPaths(paths, runtimeFamilyId, artifactHash),
    getEnvironmentPaths: (environmentId, lockHash) =>
      getEnvironmentPaths(paths, environmentId, lockHash),
    getModelPaths: (kind, modelId, version) =>
      getModelPaths(paths, kind, modelId, version),
    resolveWorkerPath: () =>
      resolveAudioPythonWorkerPath({
        isPackaged,
        resourcesPath,
        appPath,
        existsSync,
      }),
    resolveCapabilityWorkerPath: (capabilityId) =>
      resolveAudioPythonCapabilityWorkerPath(capabilityId, {
        isPackaged,
        resourcesPath,
        appPath,
        existsSync,
      }),
    publishActivation,
    getCurrentActivation,
    acquireCurrentGeneration,
    canCollectGeneration,
    createJobWorkspace,
  };
}

module.exports = {
  AUDIO_PYTHON_CAPABILITY_IDS,
  AUDIO_PYTHON_ENVIRONMENT_IDS,
  AUDIO_PYTHON_MODEL_KINDS,
  AUDIO_PYTHON_PROTOCOL_VERSION,
  AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH,
  AUDIO_PYTHON_WORKER_RELATIVE_PATH,
  createAudioPythonRuntimeHost,
};
