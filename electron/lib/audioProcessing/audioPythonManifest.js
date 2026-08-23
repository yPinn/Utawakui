'use strict';

const crypto = require('crypto');
const path = require('path');

const SHA256_RE = /^[a-f0-9]{64}$/;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const PACKAGE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^[0-9][a-z0-9.+_-]{0,63}$/i;
const MODEL_FILE_ROLES = Object.freeze(['weights', 'config']);
const AUDIO_PYTHON_ENVIRONMENT_IDS = Object.freeze([
  'separation-cpu',
  'analysis-structure',
  'combined-ml',
]);
const ANALYSIS_SIGNAL_IDS = Object.freeze([
  'tempo',
  'beats',
  'downbeats',
  'sections',
]);
const ANALYSIS_MODEL_FILE_ROLES = Object.freeze([
  'structure-checkpoint',
  'separation-checkpoint',
  'separation-config',
]);

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

function assertComponent(value, label) {
  if (!COMPONENT_RE.test(value || '') || value === '.' || value === '..') {
    throw new Error(`invalid ${label}`);
  }
}

function assertExactVersion(value, label) {
  if (
    !VERSION_RE.test(value || '') ||
    /(?:latest|stable)/i.test(value) ||
    /[*<>=!~\s]/.test(value)
  ) {
    throw new Error(`invalid ${label} version`);
  }
}

function assertPackageName(value, label = 'package') {
  if (!PACKAGE_NAME_RE.test(value || '')) {
    throw new Error(`invalid ${label} name`);
  }
}

function assertHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid ${label} URL`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    throw new Error(`invalid ${label} URL`);
  }
}

function assertFilename(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    value === '.' ||
    value === '..' ||
    path.basename(value) !== value ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(`invalid ${label} filename`);
  }
}

function validateArtifact(artifact, label, { wheelOnly = false } = {}) {
  assertExactKeys(
    artifact,
    ['filename', 'url', 'sizeBytes', 'sha256'],
    `${label} artifact`,
  );
  assertFilename(artifact.filename, label);
  assertHttpsUrl(artifact.url, label);
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    throw new Error(`invalid ${label} artifact size`);
  }
  if (!SHA256_RE.test(artifact.sha256 || '')) {
    throw new Error(`invalid ${label} artifact hash`);
  }
  if (wheelOnly && !artifact.filename.toLowerCase().endsWith('.whl')) {
    throw new Error(`${label} artifact must be a wheel`);
  }
}

function validateLicense(value, label, { nullable = false } = {}) {
  assertExactKeys(
    value,
    ['spdx', 'evidenceUrl', 'productUse', 'reason'],
    `${label} license`,
  );
  if (!['accepted', 'blocked'].includes(value.productUse)) {
    throw new Error(`invalid ${label} license product use`);
  }
  if (value.productUse === 'blocked') {
    if (
      typeof value.reason !== 'string' ||
      value.reason.length === 0 ||
      (!nullable && (value.spdx === null || value.evidenceUrl === null))
    ) {
      throw new Error(`invalid ${label} blocked license`);
    }
    if (value.spdx !== null) {
      if (typeof value.spdx !== 'string' || value.spdx.length > 128) {
        throw new Error(`invalid ${label} license`);
      }
      assertHttpsUrl(value.evidenceUrl, `${label} license evidence`);
    } else if (value.evidenceUrl !== null) {
      throw new Error(`invalid ${label} license evidence`);
    }
    return;
  }
  if (value.reason !== null) {
    throw new Error(`invalid ${label} accepted license`);
  }
  if (
    typeof value.spdx !== 'string' ||
    value.spdx.length === 0 ||
    value.spdx.length > 128
  ) {
    throw new Error(`invalid ${label} license`);
  }
  assertHttpsUrl(value.evidenceUrl, `${label} license evidence`);
}

function validateAudioPythonRuntimeManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'manifestKind',
      'familyId',
      'version',
      'platform',
      'arch',
      'entryPoint',
      'artifact',
      'license',
    ],
    'audio Python runtime manifest',
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.manifestKind !== 'runtime-artifact' ||
    manifest.platform !== 'win32' ||
    manifest.arch !== 'x64'
  ) {
    throw new Error('invalid audio Python runtime manifest');
  }
  assertComponent(manifest.familyId, 'runtime family id');
  assertExactVersion(manifest.version, 'runtime');
  assertFilename(manifest.entryPoint, 'runtime entry point');
  validateArtifact(manifest.artifact, 'runtime');
  validateLicense(manifest.license, 'runtime');
  return manifest;
}

function validateRequirement(requirement) {
  assertExactKeys(
    requirement,
    ['name', 'version'],
    'audio Python direct requirement',
  );
  assertPackageName(requirement.name, 'requirement');
  assertExactVersion(requirement.version, 'requirement');
}

function validatePackageEntry(packageEntry) {
  assertExactKeys(
    packageEntry,
    ['name', 'version', 'artifact', 'resolvedDependencies', 'license'],
    'audio Python locked package',
  );
  assertPackageName(packageEntry.name);
  assertExactVersion(packageEntry.version, 'package');
  validateArtifact(packageEntry.artifact, packageEntry.name, {
    wheelOnly: true,
  });
  if (
    !Array.isArray(packageEntry.resolvedDependencies) ||
    packageEntry.resolvedDependencies.some(
      (dependency) => !PACKAGE_NAME_RE.test(dependency || ''),
    ) ||
    new Set(packageEntry.resolvedDependencies).size !==
      packageEntry.resolvedDependencies.length
  ) {
    throw new Error(`invalid ${packageEntry.name} dependency list`);
  }
  validateLicense(packageEntry.license, packageEntry.name);
}

function validateAudioPythonEnvironmentLock(lock) {
  assertExactKeys(
    lock,
    [
      'schemaVersion',
      'manifestKind',
      'environmentId',
      'runtime',
      'platform',
      'arch',
      'resolver',
      'requirements',
      'packages',
      'probeImports',
    ],
    'audio Python environment lock',
  );
  if (
    lock.schemaVersion !== 1 ||
    lock.manifestKind !== 'environment-lock' ||
    !AUDIO_PYTHON_ENVIRONMENT_IDS.includes(lock.environmentId) ||
    lock.platform !== 'win32' ||
    lock.arch !== 'x64'
  ) {
    throw new Error('invalid audio Python environment lock');
  }
  assertExactKeys(
    lock.runtime,
    ['familyId', 'pythonVersion'],
    'audio Python lock runtime',
  );
  assertComponent(lock.runtime.familyId, 'runtime family id');
  assertExactVersion(lock.runtime.pythonVersion, 'Python');
  assertExactKeys(
    lock.resolver,
    ['name', 'version'],
    'audio Python lock resolver',
  );
  if (lock.resolver.name !== 'pip') {
    throw new Error('invalid audio Python lock resolver');
  }
  assertExactVersion(lock.resolver.version, 'resolver');
  if (!Array.isArray(lock.requirements) || lock.requirements.length === 0) {
    throw new Error('missing audio Python direct requirement');
  }
  if (!Array.isArray(lock.packages) || lock.packages.length === 0) {
    throw new Error('missing audio Python locked package');
  }
  for (const requirement of lock.requirements) validateRequirement(requirement);
  for (const packageEntry of lock.packages) validatePackageEntry(packageEntry);

  const packagesByName = new Map();
  for (const packageEntry of lock.packages) {
    if (packagesByName.has(packageEntry.name)) {
      throw new Error(`duplicate locked package: ${packageEntry.name}`);
    }
    packagesByName.set(packageEntry.name, packageEntry);
  }
  for (const requirement of lock.requirements) {
    const packageEntry = packagesByName.get(requirement.name);
    if (!packageEntry || packageEntry.version !== requirement.version) {
      throw new Error(`unresolved direct requirement: ${requirement.name}`);
    }
  }
  for (const packageEntry of lock.packages) {
    for (const dependency of packageEntry.resolvedDependencies) {
      if (!packagesByName.has(dependency)) {
        throw new Error(
          `unresolved dependency: ${packageEntry.name} -> ${dependency}`,
        );
      }
    }
  }
  if (
    !Array.isArray(lock.probeImports) ||
    lock.probeImports.length === 0 ||
    lock.probeImports.some(
      (importName) =>
        typeof importName !== 'string' ||
        !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(importName),
    ) ||
    new Set(lock.probeImports).size !== lock.probeImports.length
  ) {
    throw new Error('invalid audio Python probe imports');
  }
  return lock;
}

function assertAudioPythonEnvironmentActivatable(lock) {
  validateAudioPythonEnvironmentLock(lock);
  const blocked = lock.packages
    .filter((packageEntry) => packageEntry.license.productUse === 'blocked')
    .map((packageEntry) => packageEntry.name);
  if (blocked.length > 0) {
    throw new Error(
      `audio Python environment license blocked: ${blocked.join(', ')}`,
    );
  }
  return lock;
}

function validateModelFile(file, allowedRoles = MODEL_FILE_ROLES) {
  assertExactKeys(
    file,
    ['role', 'filename', 'url', 'sizeBytes', 'sha256', 'license'],
    'audio Python model file',
  );
  if (!allowedRoles.includes(file.role)) {
    throw new Error('invalid audio Python model file role');
  }
  validateArtifact(
    {
      filename: file.filename,
      url: file.url,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    },
    `model ${file.role}`,
  );
  validateLicense(file.license, `model ${file.role}`, { nullable: true });
}

function validateModelDistribution(manifest) {
  const weightFiles = manifest.files.filter((file) =>
    ['weights', 'structure-checkpoint', 'separation-checkpoint'].includes(
      file.role,
    ),
  );
  assertExactKeys(
    manifest.distribution,
    ['status', 'reason'],
    'audio Python model distribution',
  );
  if (manifest.distribution.status === 'benchmark-only') {
    if (
      typeof manifest.distribution.reason !== 'string' ||
      manifest.distribution.reason.length === 0
    ) {
      throw new Error('invalid benchmark-only model reason');
    }
  } else if (
    ['product-downloadable', 'redistributable'].includes(
      manifest.distribution.status,
    )
  ) {
    if (manifest.distribution.reason !== null) {
      throw new Error('invalid product model reason');
    }
    if (
      weightFiles.some(
        (file) =>
          file.license.spdx === null ||
          file.license.evidenceUrl === null ||
          file.license.productUse !== 'accepted',
      )
    ) {
      throw new Error('missing model weight license');
    }
  } else {
    throw new Error('invalid audio Python model distribution status');
  }
}

function validateAnalysisModelManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'manifestKind',
      'kind',
      'id',
      'version',
      'architecture',
      'wrapper',
      'signals',
      'files',
      'distribution',
    ],
    'audio Python analysis model manifest',
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.manifestKind !== 'model' ||
    manifest.kind !== 'analysis'
  ) {
    throw new Error('invalid audio Python analysis model manifest');
  }
  assertComponent(manifest.id, 'model id');
  assertComponent(manifest.version, 'model version');
  assertComponent(manifest.architecture, 'model architecture');
  assertExactKeys(
    manifest.wrapper,
    ['package', 'version', 'model'],
    'audio Python analysis model wrapper',
  );
  assertPackageName(manifest.wrapper.package, 'model wrapper package');
  assertExactVersion(manifest.wrapper.version, 'model wrapper');
  assertComponent(manifest.wrapper.model, 'analysis model');
  if (
    !Array.isArray(manifest.signals) ||
    manifest.signals.length !== ANALYSIS_SIGNAL_IDS.length ||
    new Set(manifest.signals).size !== ANALYSIS_SIGNAL_IDS.length ||
    ANALYSIS_SIGNAL_IDS.some((signal) => !manifest.signals.includes(signal))
  ) {
    throw new Error('invalid audio Python analysis signals');
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== ANALYSIS_MODEL_FILE_ROLES.length
  ) {
    throw new Error('invalid audio Python analysis model files');
  }
  for (const file of manifest.files) {
    validateModelFile(file, ANALYSIS_MODEL_FILE_ROLES);
  }
  const roles = manifest.files.map(({ role }) => role);
  if (
    !manifest.files.some(({ role }) => role === 'structure-checkpoint') ||
    !manifest.files.some(({ role }) => role === 'separation-checkpoint') ||
    !manifest.files.some(({ role }) => role === 'separation-config') ||
    new Set(roles).size !== ANALYSIS_MODEL_FILE_ROLES.length ||
    new Set(manifest.files.map(({ filename }) => filename)).size !==
      manifest.files.length
  ) {
    throw new Error('invalid audio Python analysis model files');
  }
  validateModelDistribution(manifest);
  return manifest;
}

function validateAudioPythonModelManifest(manifest) {
  if (manifest?.kind === 'analysis') {
    return validateAnalysisModelManifest(manifest);
  }
  assertExactKeys(
    manifest,
    [
      'schemaVersion',
      'manifestKind',
      'kind',
      'id',
      'version',
      'architecture',
      'wrapper',
      'stems',
      'files',
      'distribution',
    ],
    'audio Python model manifest',
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.manifestKind !== 'model' ||
    manifest.kind !== 'separation'
  ) {
    throw new Error('invalid audio Python model manifest');
  }
  assertComponent(manifest.id, 'model id');
  assertComponent(manifest.version, 'model version');
  assertComponent(manifest.architecture, 'model architecture');
  assertExactKeys(
    manifest.wrapper,
    ['package', 'version', 'modelFilename'],
    'audio Python model wrapper',
  );
  assertPackageName(manifest.wrapper.package, 'model wrapper package');
  assertExactVersion(manifest.wrapper.version, 'model wrapper');
  assertFilename(manifest.wrapper.modelFilename, 'model wrapper');
  if (
    !Array.isArray(manifest.stems) ||
    manifest.stems.length !== 2 ||
    manifest.stems[0] !== 'instrumental' ||
    manifest.stems[1] !== 'vocals'
  ) {
    throw new Error('invalid audio Python model stem semantics');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== 2) {
    throw new Error('invalid audio Python model files');
  }
  for (const file of manifest.files) validateModelFile(file);
  const roles = manifest.files.map((file) => file.role);
  if (
    new Set(roles).size !== MODEL_FILE_ROLES.length ||
    MODEL_FILE_ROLES.some((role) => !roles.includes(role))
  ) {
    throw new Error('invalid audio Python model files');
  }
  const weightFile = manifest.files.find((file) => file.role === 'weights');
  if (weightFile.filename !== manifest.wrapper.modelFilename) {
    throw new Error('invalid audio Python model wrapper filename');
  }
  validateModelDistribution(manifest);
  return manifest;
}

function assertAudioPythonModelActivatable(manifest) {
  validateAudioPythonModelManifest(manifest);
  if (
    !['product-downloadable', 'redistributable'].includes(
      manifest.distribution.status,
    )
  ) {
    throw new Error('audio Python model is benchmark-only');
  }
  const blocked = manifest.files
    .filter((file) => file.license.productUse === 'blocked')
    .map((file) => file.role);
  if (blocked.length > 0) {
    throw new Error(
      `audio Python model license blocked: ${blocked.join(', ')}`,
    );
  }
  return manifest;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function computeAudioPythonManifestHash(manifest) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(manifest)))
    .digest('hex');
}

module.exports = {
  assertAudioPythonEnvironmentActivatable,
  assertAudioPythonModelActivatable,
  computeAudioPythonManifestHash,
  validateAudioPythonEnvironmentLock,
  validateAudioPythonModelManifest,
  validateAudioPythonRuntimeManifest,
};
