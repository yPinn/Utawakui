'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertAudioPythonEnvironmentActivatable,
  assertAudioPythonModelActivatable,
  computeAudioPythonManifestHash,
  validateAudioPythonEnvironmentLock,
  validateAudioPythonModelManifest,
  validateAudioPythonRuntimeManifest,
} = require('./audioPythonManifest');
const { AUDIO_PYTHON_PROTOCOL_VERSION } = require('./audioPythonRuntimeHost');
const {
  createAudioPythonProcessJob,
} = require('./engines/audioPythonProcessJob');
const { createFfmpegDecodeJob } = require('./ffmpegDecodeJob');
const {
  evaluateM2Sections,
  validateMusicStructureDocument,
} = require('../musicStructureContract');
const musicStructureContractValues = require('../../../shared/musicStructureContractValues.json');

const STRUCTURE_CAPABILITY_ID = 'structure-analysis';
const STRUCTURE_ANALYZER_ID = 'beat-this';
const STRUCTURE_PROFILE_ID = 'beat-this-small0-cpu-v2';
const STRUCTURE_MODEL_ID = 'beat-this-small0';
const SUPPORTED_STRUCTURE_ANALYSIS_MODELS = Object.freeze({
  'beat-this-small0': Object.freeze({
    analyzerId: STRUCTURE_ANALYZER_ID,
    profileId: STRUCTURE_PROFILE_ID,
    architecture: 'beat-this',
    wrapperPackage: 'beat-this',
    wrapperVersion: '1.1.0',
    modelName: 'small0',
    signals: Object.freeze(['tempo', 'beats', 'downbeats']),
    files: Object.freeze({ weights: 'small0.ckpt' }),
  }),
  'beat-this-final0': Object.freeze({
    analyzerId: STRUCTURE_ANALYZER_ID,
    profileId: 'beat-this-final0-cpu-v2',
    architecture: 'beat-this',
    wrapperPackage: 'beat-this',
    wrapperVersion: '1.1.0',
    modelName: 'final0',
    signals: Object.freeze(['tempo', 'beats', 'downbeats']),
    files: Object.freeze({ weights: 'final0.ckpt' }),
  }),
  'all-in-one-harmonix-fold0': Object.freeze({
    analyzerId: 'all-in-one-structure',
    profileId: 'all-in-one-cpu-v1',
    architecture: 'all-in-one-with-htdemucs',
    wrapperPackage: 'all-in-one-infer',
    wrapperVersion: '3.1.0',
    modelName: 'harmonix-fold0',
    signals: Object.freeze(['tempo', 'beats', 'downbeats', 'sections']),
    files: Object.freeze({
      'structure-checkpoint': 'harmonix-fold0-0vra4ys2.pth',
      'separation-checkpoint': '955717e8-8726e21a.th',
      'separation-config': 'htdemucs.yaml',
    }),
  }),
});
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_WORKER_MESSAGE_BYTES =
  musicStructureContractValues.maxDocumentBytes + 64 * 1024;
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
    throw new Error('structure-analysis artifact is missing');
  }
  if (fs.statSync(filePath).size !== expectedSize) {
    throw new Error('structure-analysis artifact size mismatch');
  }
}

function readModelManifest(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
    throw new Error('structure-analysis model manifest is invalid');
  }
  return validateAudioPythonModelManifest(
    JSON.parse(fs.readFileSync(filePath, 'utf8')),
  );
}

function readRequiredManifest(filePath, label, validate) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
      throw new Error('invalid manifest');
    }
    return validate(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    throw new Error(`structure-analysis ${label} manifest is invalid`);
  }
}

function requireConfidence(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`structure-analysis ${label} confidence is required`);
  }
}

function normalizeWorkerResult(result, provenance, profile) {
  assertExactKeys(
    result,
    [
      'protocolVersion',
      'analyzerId',
      'profileId',
      'modelId',
      'offlineEnforced',
      'noUserCache',
      'durationMs',
      'tempo',
      'beats',
      'sections',
    ],
    'structure-analysis worker result',
  );
  if (
    result.protocolVersion !== AUDIO_PYTHON_PROTOCOL_VERSION ||
    result.analyzerId !== profile.analyzerId ||
    result.profileId !== profile.profileId ||
    result.modelId !== provenance.modelId ||
    result.offlineEnforced !== true ||
    result.noUserCache !== true ||
    !Number.isSafeInteger(result.durationMs) ||
    result.durationMs < 1 ||
    !Array.isArray(result.beats) ||
    !Array.isArray(result.sections)
  ) {
    throw new Error('structure-analysis worker protocol error');
  }
  if (result.tempo !== null) {
    requireConfidence(result.tempo?.confidence, 'tempo');
  }
  for (const beat of result.beats) {
    requireConfidence(beat?.confidence, 'beat');
  }
  for (const section of result.sections) {
    requireConfidence(section?.confidence, 'section');
  }

  const identity = {
    sourceSha256: provenance.sourceSha256,
    sourceDurationMs: result.durationMs,
  };
  let document = validateMusicStructureDocument(
    {
      schemaVersion: 1,
      source: {
        sha256: provenance.sourceSha256,
        durationMs: result.durationMs,
      },
      analyzer: {
        contractVersion: 1,
        id: profile.analyzerId,
        profileId: profile.profileId,
        environmentLock: provenance.environmentLock,
        modelIds: [provenance.modelId],
        completedAt: provenance.completedAt,
      },
      tempo: result.tempo,
      beats: result.beats,
      sections: result.sections,
    },
    identity,
  );
  if (
    profile.signals.includes('sections') &&
    evaluateM2Sections(document.sections, document.source.durationMs) !==
      'current'
  ) {
    document = { ...document, sections: [] };
  }
  return { document, identity };
}

function createStructureAnalysisJob({
  host,
  runtimeRef,
  environmentRef,
  modelRef,
  generationId,
  jobId,
  inputPath,
  ffmpegPath,
  sourceSha256,
  publishDocument,
  releaseGenerationLease,
  completedAt = () => new Date().toISOString(),
  emitProgress,
  createDecodeJob = createFfmpegDecodeJob,
  createProcessJob = createAudioPythonProcessJob,
}) {
  let workspace = null;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseGenerationLease?.();
  };

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
      'structure-analysis runtime reference',
    );
    assertExactKeys(
      environmentRef,
      ['id', 'lockHash'],
      'structure-analysis environment reference',
    );
    assertExactKeys(
      modelRef,
      ['kind', 'id', 'version', 'manifestHash'],
      'structure-analysis model reference',
    );
    if (!['analysis-structure', 'combined-ml'].includes(environmentRef.id)) {
      throw new Error('invalid structure-analysis environment');
    }
    if (
      modelRef.kind !== 'analysis' ||
      !SUPPORTED_STRUCTURE_ANALYSIS_MODELS[modelRef.id] ||
      !SHA256_RE.test(modelRef.manifestHash || '') ||
      !SHA256_RE.test(sourceSha256 || '') ||
      !path.isAbsolute(inputPath || '') ||
      !fs.existsSync(inputPath) ||
      !path.isAbsolute(ffmpegPath || '') ||
      !fs.existsSync(ffmpegPath) ||
      typeof publishDocument !== 'function'
    ) {
      throw new Error('invalid structure-analysis job input');
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
      'analysis',
      modelRef.id,
      modelRef.version,
    );
    const workerPath = host.resolveCapabilityWorkerPath(
      STRUCTURE_CAPABILITY_ID,
    );
    if (!fs.existsSync(runtimePaths.pythonPath)) {
      throw new Error('structure-analysis runtime is missing');
    }
    const runtimeManifest = readRequiredManifest(
      runtimePaths.manifestPath,
      'runtime',
      validateAudioPythonRuntimeManifest,
    );
    if (
      runtimeManifest.familyId !== runtimeRef.familyId ||
      runtimeManifest.artifact.sha256 !== runtimeRef.artifactHash ||
      runtimeManifest.entryPoint !== path.basename(runtimePaths.pythonPath)
    ) {
      throw new Error('structure-analysis runtime manifest is incompatible');
    }
    if (!fs.existsSync(environmentPaths.sitePackagesPath)) {
      throw new Error('structure-analysis environment is missing');
    }
    const environmentLock = readRequiredManifest(
      environmentPaths.manifestPath,
      'environment',
      validateAudioPythonEnvironmentLock,
    );
    if (
      computeAudioPythonManifestHash(environmentLock) !==
        environmentRef.lockHash ||
      environmentLock.environmentId !== environmentRef.id ||
      environmentLock.runtime.familyId !== runtimeRef.familyId ||
      environmentLock.runtime.pythonVersion !== runtimeManifest.version
    ) {
      throw new Error(
        'structure-analysis environment manifest is incompatible',
      );
    }
    assertAudioPythonEnvironmentActivatable(environmentLock);
    if (!fs.existsSync(modelPaths.manifestPath)) {
      throw new Error('structure-analysis model manifest is missing');
    }
    const modelManifest = readModelManifest(modelPaths.manifestPath);
    if (
      computeAudioPythonManifestHash(modelManifest) !== modelRef.manifestHash
    ) {
      throw new Error('structure-analysis model manifest hash mismatch');
    }
    assertAudioPythonModelActivatable(modelManifest);
    const profile = SUPPORTED_STRUCTURE_ANALYSIS_MODELS[modelRef.id];
    const expectedFiles = Object.entries(profile.files);
    if (
      modelManifest.id !== modelRef.id ||
      modelManifest.version !== modelRef.version ||
      modelManifest.architecture !== profile.architecture ||
      modelManifest.wrapper.package !== profile.wrapperPackage ||
      modelManifest.wrapper.version !== profile.wrapperVersion ||
      modelManifest.wrapper.model !== profile.modelName ||
      modelManifest.signals.length !== profile.signals.length ||
      profile.signals.some(
        (signal) => !modelManifest.signals.includes(signal),
      ) ||
      modelManifest.files.length !== expectedFiles.length ||
      expectedFiles.some(
        ([role, filename]) =>
          !modelManifest.files.some(
            (file) => file.role === role && file.filename === filename,
          ),
      )
    ) {
      throw new Error('invalid fixed structure-analysis model');
    }
    const modelFiles = modelManifest.files.map((file) => {
      const filePath = path.join(modelPaths.installDir, file.filename);
      assertArtifactPresent(filePath, file.sizeBytes);
      return { role: file.role, path: filePath, sha256: file.sha256 };
    });

    workspace = host.createJobWorkspace({
      capabilityId: STRUCTURE_CAPABILITY_ID,
      jobId,
      generationId,
      environmentHash: environmentRef.lockHash,
    });
    const decodedInputPath = path.join(workspace.jobDir, 'input.wav');
    let activeJob = null;
    let cancelRequested = false;
    let finalizing = false;
    const run = async () => {
      activeJob = createDecodeJob({
        ffmpegPath,
        inputPath,
        outputPath: decodedInputPath,
        emitProgress,
      });
      await activeJob.result;
      if (cancelRequested) {
        throw new Error('structure-analysis job cancelled');
      }

      activeJob = createProcessJob({
        executablePath: runtimePaths.pythonPath,
        workerPath,
        request: {
          operation: 'analyze-structure',
          analyzerId: profile.analyzerId,
          profileId: profile.profileId,
          modelId: modelRef.id,
          modelName: profile.modelName,
          environmentPath: environmentPaths.sitePackagesPath,
          inputPath: decodedInputPath,
          jobPath: workspace.jobDir,
          modelPath: modelPaths.installDir,
          modelFiles,
        },
        maxMessageBytes: MAX_WORKER_MESSAGE_BYTES,
        emitProgress,
      });
      return activeJob.result;
    };
    return {
      result: run()
        .then((result) =>
          normalizeWorkerResult(
            result,
            {
              sourceSha256,
              environmentLock: environmentRef.lockHash,
              modelId: modelRef.id,
              completedAt: completedAt(),
            },
            profile,
          ),
        )
        .then(({ document, identity }) => {
          finalizing = true;
          return publishDocument(document, identity);
        })
        .finally(() => {
          try {
            workspace?.cleanup();
          } finally {
            release();
          }
        }),
      cancel: async () => {
        if (finalizing) return false;
        cancelRequested = true;
        await activeJob?.cancel?.();
        return true;
      },
    };
  } catch (error) {
    try {
      workspace?.cleanup();
    } finally {
      release();
    }
    throw error;
  }
}

module.exports = {
  STRUCTURE_ANALYZER_ID,
  STRUCTURE_CAPABILITY_ID,
  STRUCTURE_MODEL_ID,
  STRUCTURE_PROFILE_ID,
  SUPPORTED_STRUCTURE_ANALYSIS_MODELS,
  createStructureAnalysisJob,
  normalizeWorkerResult,
};
