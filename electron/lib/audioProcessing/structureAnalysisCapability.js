'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const {
  assertAudioPythonEnvironmentActivatable,
  assertAudioPythonModelActivatable,
  computeAudioPythonManifestHash,
  validateAudioPythonRuntimeManifest,
} = require('./audioPythonManifest');
const { AUDIO_PYTHON_PROTOCOL_VERSION } = require('./audioPythonRuntimeHost');
const {
  prepareStructureAnalysisArtifacts,
} = require('./audioPythonArtifactPreparation');

const STRUCTURE_ANALYSIS_CAPABILITY_ID = 'structure-analysis';
const STRUCTURE_ANALYSIS_MODEL_LABEL = 'Beat This! small0';
const STRUCTURE_ANALYSIS_INSTALLED_BYTES_ESTIMATE = 557000000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function optionalCurrentActivation(host) {
  try {
    return host.getCurrentActivation();
  } catch (error) {
    if (!fs.existsSync(host.paths.currentActivationPath)) return null;
    throw error;
  }
}

function artifactPaths(host, refs, modelManifest) {
  const runtime = host.getRuntimeArtifactPaths(
    refs.runtime.familyId,
    refs.runtime.artifactHash,
  );
  const environment = host.getEnvironmentPaths(
    refs.environment.id,
    refs.environment.lockHash,
  );
  const model = host.getModelPaths(
    refs.model.kind,
    refs.model.id,
    refs.model.version,
  );
  return {
    runtime,
    environment,
    model,
    required: [
      runtime.pythonPath,
      runtime.manifestPath,
      environment.sitePackagesPath,
      environment.manifestPath,
      model.manifestPath,
      ...modelManifest.files.map((file) =>
        path.join(model.installDir, file.filename),
      ),
    ],
  };
}

function removePath(filePath) {
  fs.rmSync(filePath, { recursive: true, force: true });
}

function loadStructureAnalysisCapabilityCatalog({
  isPackaged,
  resourcesPath,
  appPath,
}) {
  const root = isPackaged
    ? path.join(resourcesPath, 'audio-processing')
    : path.join(appPath, 'resources', 'audio-processing');
  const readManifest = (filename) => {
    const filePath = path.join(root, filename);
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > 2 * 1024 * 1024) {
      throw new Error('invalid structure-analysis capability catalog');
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  };
  return {
    runtimeManifest: readManifest('audio-python-runtime-3.14.7.json'),
    environmentLock: readManifest('analysis-beat-this-py314-lock.json'),
    modelManifest: readManifest('analysis-beat-this-small0-model.json'),
  };
}

function createStructureAnalysisCapabilityService({
  host,
  runtimeManifest,
  environmentLock,
  modelManifest,
  prepareArtifacts = prepareStructureAnalysisArtifacts,
  getActiveJob = () => null,
  now = () => new Date().toISOString(),
  createGenerationId = crypto.randomUUID,
}) {
  if (
    !host ||
    typeof host.publishActivation !== 'function' ||
    typeof prepareArtifacts !== 'function' ||
    typeof getActiveJob !== 'function'
  ) {
    throw new Error('invalid structure-analysis capability dependencies');
  }

  validateAudioPythonRuntimeManifest(runtimeManifest);
  assertAudioPythonEnvironmentActivatable(environmentLock);
  assertAudioPythonModelActivatable(modelManifest);
  if (
    environmentLock.environmentId !== 'analysis-structure' ||
    environmentLock.runtime.familyId !== runtimeManifest.familyId ||
    environmentLock.runtime.pythonVersion !== runtimeManifest.version ||
    modelManifest.id !== 'beat-this-small0' ||
    modelManifest.wrapper.package !== 'beat-this' ||
    modelManifest.wrapper.model !== 'small0'
  ) {
    throw new Error('invalid fixed structure-analysis capability catalog');
  }

  const capabilityReference = Object.freeze({
    runtime: Object.freeze({
      familyId: runtimeManifest.familyId,
      artifactHash: runtimeManifest.artifact.sha256,
    }),
    environment: Object.freeze({
      id: environmentLock.environmentId,
      lockHash: computeAudioPythonManifestHash(environmentLock),
    }),
    worker: Object.freeze({ protocolVersion: AUDIO_PYTHON_PROTOCOL_VERSION }),
    model: Object.freeze({
      kind: modelManifest.kind,
      id: modelManifest.id,
      version: modelManifest.version,
      manifestHash: computeAudioPythonManifestHash(modelManifest),
    }),
  });
  const downloadBytes =
    runtimeManifest.artifact.sizeBytes +
    environmentLock.packages.reduce(
      (total, packageEntry) => total + packageEntry.artifact.sizeBytes,
      0,
    ) +
    modelManifest.files.reduce((total, file) => total + file.sizeBytes, 0);

  let operation = null;

  function baseStatus(status, installed) {
    return {
      status,
      installed,
      busy: operation !== null,
      canPrepare: !installed && operation === null,
      canRepair: installed && operation === null,
      canRemove: installed && operation === null,
      modelName: STRUCTURE_ANALYSIS_MODEL_LABEL,
      modelVersion: modelManifest.wrapper.version,
      downloadBytes,
      installedBytesEstimate: STRUCTURE_ANALYSIS_INSTALLED_BYTES_ESTIMATE,
    };
  }

  function getStatus() {
    if (operation) return baseStatus(operation, operation !== 'preparing');
    let activation;
    try {
      activation = optionalCurrentActivation(host);
    } catch {
      return baseStatus('damaged', true);
    }
    const activeReference =
      activation?.capabilities?.[STRUCTURE_ANALYSIS_CAPABILITY_ID];
    if (!activeReference) return baseStatus('missing', false);
    if (!sameValue(activeReference, capabilityReference)) {
      return baseStatus('damaged', true);
    }
    const paths = artifactPaths(host, capabilityReference, modelManifest);
    if (paths.required.some((filePath) => !fs.existsSync(filePath))) {
      return baseStatus('damaged', true);
    }
    return baseStatus('ready', true);
  }

  function assertLifecycleAvailable() {
    if (operation) {
      throw new Error(
        'a structure-analysis capability operation is already running',
      );
    }
  }

  function publishWithStructureCapability() {
    let current;
    try {
      current = optionalCurrentActivation(host);
    } catch {
      current = null;
    }
    return host.publishActivation({
      schemaVersion: 1,
      generationId: createGenerationId(),
      createdAt: now(),
      capabilities: {
        ...(current?.capabilities ?? {}),
        [STRUCTURE_ANALYSIS_CAPABILITY_ID]: clone(capabilityReference),
      },
    });
  }

  async function prepare({ onProgress, force = false } = {}) {
    assertLifecycleAvailable();
    if (getActiveJob()) {
      throw new Error(
        'structure-analysis capability has an active analysis job',
      );
    }
    operation = 'preparing';
    try {
      onProgress?.({ stage: 'starting', percent: 0 });
      await prepareArtifacts({
        host,
        runtimeManifest,
        environmentLock,
        modelManifest,
        refs: clone(capabilityReference),
        force,
        emitProgress: onProgress ?? (() => {}),
      });
      onProgress?.({ stage: 'activating', percent: 98 });
      publishWithStructureCapability();
      onProgress?.({ stage: 'ready', percent: 100 });
    } finally {
      operation = null;
    }
    return getStatus();
  }

  async function repair(options) {
    return prepare({ ...(options ?? {}), force: true });
  }

  async function remove() {
    if (getActiveJob()) {
      throw new Error(
        'structure-analysis capability has an active analysis job',
      );
    }
    assertLifecycleAvailable();
    operation = 'removing';
    try {
      let current;
      let currentIsDamaged = false;
      try {
        current = optionalCurrentActivation(host);
      } catch {
        currentIsDamaged = true;
      }
      if (currentIsDamaged) {
        host.publishActivation({
          schemaVersion: 1,
          generationId: createGenerationId(),
          createdAt: now(),
          capabilities: {},
        });
        current = null;
      }
      const activeReference =
        current?.capabilities?.[STRUCTURE_ANALYSIS_CAPABILITY_ID];
      if (current && activeReference) {
        const nextCapabilities = { ...current.capabilities };
        delete nextCapabilities[STRUCTURE_ANALYSIS_CAPABILITY_ID];
        host.publishActivation({
          schemaVersion: 1,
          generationId: createGenerationId(),
          createdAt: now(),
          capabilities: nextCapabilities,
        });

        if (host.canCollectGeneration(current.generationId)) {
          const paths = artifactPaths(host, activeReference, modelManifest);
          removePath(paths.environment.installDir);
          removePath(paths.model.installDir);
          const runtimeStillUsed = Object.values(nextCapabilities).some(
            (capability) =>
              sameValue(capability.runtime, activeReference.runtime),
          );
          if (!runtimeStillUsed) removePath(paths.runtime.installDir);
        }
      }
    } finally {
      operation = null;
    }
    return getStatus();
  }

  return {
    capabilityReference,
    getStatus,
    prepare,
    repair,
    remove,
  };
}

module.exports = {
  STRUCTURE_ANALYSIS_CAPABILITY_ID,
  STRUCTURE_ANALYSIS_INSTALLED_BYTES_ESTIMATE,
  createStructureAnalysisCapabilityService,
  loadStructureAnalysisCapabilityCatalog,
};
