'use strict';

const fs = require('fs');
const { AUDIO_PYTHON_PROTOCOL_VERSION } = require('./audioPythonRuntimeHost');
const {
  createAudioPythonProcessJob,
} = require('./engines/audioPythonProcessJob');

function normalizeHostProbeResult(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    Object.getPrototypeOf(result) !== Object.prototype ||
    Object.keys(result).sort().join(',') !==
      'hostReady,isolated,noUserSite,protocolVersion,pythonVersion' ||
    result.protocolVersion !== AUDIO_PYTHON_PROTOCOL_VERSION ||
    result.hostReady !== true ||
    typeof result.isolated !== 'boolean' ||
    typeof result.noUserSite !== 'boolean' ||
    !Array.isArray(result.pythonVersion) ||
    result.pythonVersion.length !== 3 ||
    result.pythonVersion.some((part) => !Number.isSafeInteger(part) || part < 0)
  ) {
    throw new Error('audio Python host probe protocol error');
  }
  return {
    protocolVersion: result.protocolVersion,
    hostReady: true,
    pythonVersion: [...result.pythonVersion],
    isolated: result.isolated,
    noUserSite: result.noUserSite,
  };
}

function createAudioPythonRuntimeProbeJob({
  host,
  runtimeFamilyId,
  artifactHash,
  emitProgress,
  existsSync = fs.existsSync,
  createProcessJob = createAudioPythonProcessJob,
}) {
  if (!host || typeof host.getRuntimeArtifactPaths !== 'function') {
    throw new Error('audio Python runtime host is required');
  }
  const runtimePaths = host.getRuntimeArtifactPaths(
    runtimeFamilyId,
    artifactHash,
  );
  if (!existsSync(runtimePaths.pythonPath)) {
    throw new Error('audio Python runtime artifact is not installed');
  }
  const job = createProcessJob({
    executablePath: runtimePaths.pythonPath,
    workerPath: host.resolveWorkerPath(),
    request: { operation: 'probe-host' },
    emitProgress,
  });
  return {
    result: Promise.resolve(job.result).then(normalizeHostProbeResult),
    cancel: job.cancel,
  };
}

module.exports = { createAudioPythonRuntimeProbeJob };
