import path from 'node:path';
import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';

const MAX_IPC_BYTES = 4096;
const MAX_TEXT_LENGTH = 256;
const MAX_DURATION_SECONDS = 86_400;
const RECORDING_VERSIONS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);

export const NETEASE_RUNTIME_PROFILE = Object.freeze({
  schemaVersion: 1,
  profileId: 'netease-yrc-evaluation-v1',
  packageId: '@neteasecloudmusicapienhanced/api',
  packageVersion: '4.40.1',
  packageIntegrity:
    'sha512-RUpVnxUCkeEt0yYeElc+UvCXqucikI/PIlJaLj18FlwHQ8X9wk4QkM/h7C+qePC97COMODcmgRXKgWO94YLuWA==',
  packageUnpackedSize: 15_322_633,
  license: 'MIT',
  minimumNodeMajor: 24,
});

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) throw new TypeError(`invalid ${label}`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`invalid ${label}`);
  }
}

function validText(value, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_TEXT_LENGTH &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    })
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertBoundedSerializedValue(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`invalid ${label}`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_IPC_BYTES) {
    throw new TypeError(`invalid ${label}`);
  }
}

function validateReference(value) {
  assertExactKeys(
    value,
    ['title', 'artist', 'album', 'durationSeconds', 'version'],
    'NetEase worker reference',
  );
  if (
    !validText(value.title) ||
    !validText(value.artist) ||
    !validText(value.album, { nullable: true }) ||
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds <= 0 ||
    value.durationSeconds > MAX_DURATION_SECONDS ||
    !RECORDING_VERSIONS.has(value.version)
  ) {
    throw new TypeError('invalid NetEase worker reference');
  }
  return clone(value);
}

export function validateNeteaseWorkerRequest(value) {
  assertBoundedSerializedValue(value, 'NetEase worker request');
  assertExactKeys(
    value,
    ['schemaVersion', 'type', 'reference'],
    'NetEase worker request',
  );
  if (value.schemaVersion !== 1 || value.type !== 'probe') {
    throw new TypeError('invalid NetEase worker request');
  }
  return {
    schemaVersion: 1,
    type: 'probe',
    reference: validateReference(value.reference),
  };
}

export function validateNeteaseReviewCandidate(value) {
  if (value === null) return null;
  assertExactKeys(
    value,
    [
      'title',
      'artists',
      'album',
      'durationSeconds',
      'matchBand',
      'durationDeltaSeconds',
      'versionMismatch',
    ],
    'NetEase worker review candidate',
  );
  if (
    !validText(value.title) ||
    !Array.isArray(value.artists) ||
    value.artists.length < 1 ||
    value.artists.length > 4 ||
    value.artists.some((artist) => !validText(artist)) ||
    !validText(value.album, { nullable: true }) ||
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds <= 0 ||
    value.durationSeconds > MAX_DURATION_SECONDS ||
    !new Set(['exact', 'strong']).has(value.matchBand) ||
    !Number.isFinite(value.durationDeltaSeconds) ||
    value.durationDeltaSeconds < 0 ||
    value.durationDeltaSeconds > MAX_DURATION_SECONDS ||
    typeof value.versionMismatch !== 'boolean'
  ) {
    throw new TypeError('invalid NetEase worker review candidate');
  }
  return clone(value);
}

export function validateNeteaseWorkerResult(value) {
  assertBoundedSerializedValue(value, 'NetEase worker result');
  assertExactKeys(
    value,
    ['schemaVersion', 'type', 'observation', 'reviewCandidate'],
    'NetEase worker result',
  );
  if (value.schemaVersion !== 1 || value.type !== 'result') {
    throw new TypeError('invalid NetEase worker result');
  }
  let observation;
  try {
    observation = normalizeProbeOutcome(value.observation, 'netease');
  } catch {
    throw new TypeError('invalid NetEase worker result');
  }
  const reviewCandidate = validateNeteaseReviewCandidate(value.reviewCandidate);
  if (
    (observation.catalogStatus === 'match') !== (reviewCandidate !== null) ||
    (reviewCandidate !== null &&
      observation.matchBand !== reviewCandidate.matchBand)
  ) {
    throw new TypeError('invalid NetEase worker result');
  }
  return {
    schemaVersion: 1,
    type: 'result',
    observation,
    reviewCandidate,
  };
}

export function createNeteaseRuntimePaths(projectRoot) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) {
    throw new TypeError('invalid NetEase evaluation project root');
  }
  const root = path.join(
    path.resolve(projectRoot),
    '.benchmarks',
    'lyrics-provider',
    'netease-runtime',
  );
  return Object.freeze({
    root,
    generationsDir: path.join(root, 'generations'),
    stagingDir: path.join(root, 'staging'),
    currentActivationPath: path.join(root, 'current.json'),
    profileRoot: path.join(root, 'profile'),
  });
}

export function createCleanNeteaseWorkerEnvironment({
  baseEnvironment = process.env,
  profileRoot,
  runtimeRoot,
}) {
  if (
    !baseEnvironment ||
    typeof baseEnvironment !== 'object' ||
    typeof profileRoot !== 'string' ||
    !path.isAbsolute(profileRoot) ||
    typeof runtimeRoot !== 'string' ||
    !path.isAbsolute(runtimeRoot)
  ) {
    throw new TypeError('invalid NetEase worker environment inputs');
  }
  const home = path.join(profileRoot, 'home');
  const temporary = path.join(profileRoot, 'temp');
  const environment = {
    ...(typeof baseEnvironment.SystemRoot === 'string'
      ? { SystemRoot: baseEnvironment.SystemRoot }
      : {}),
    ...(typeof baseEnvironment.WINDIR === 'string'
      ? { WINDIR: baseEnvironment.WINDIR }
      : {}),
    ...(typeof baseEnvironment.ComSpec === 'string'
      ? { ComSpec: baseEnvironment.ComSpec }
      : {}),
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(profileRoot, 'roaming'),
    LOCALAPPDATA: path.join(profileRoot, 'local'),
    TEMP: temporary,
    TMP: temporary,
    UTAWAKUI_NETEASE_RUNTIME_ROOT: runtimeRoot,
  };
  return Object.freeze(environment);
}

export function validateNeteaseRuntimeLock(value) {
  assertExactKeys(
    value,
    ['name', 'version', 'lockfileVersion', 'requires', 'packages'],
    'NetEase runtime lock',
  );
  if (
    value.name !== 'utawakui-netease-evaluation-runtime' ||
    value.version !== '1.0.0' ||
    value.lockfileVersion !== 3 ||
    value.requires !== true ||
    !isPlainObject(value.packages)
  ) {
    throw new TypeError('invalid NetEase runtime lock');
  }
  const root = value.packages[''];
  assertExactKeys(
    root,
    ['name', 'version', 'dependencies'],
    'NetEase runtime lock root',
  );
  if (
    root.name !== value.name ||
    root.version !== value.version ||
    !isPlainObject(root.dependencies) ||
    Object.keys(root.dependencies).length !== 1 ||
    root.dependencies[NETEASE_RUNTIME_PROFILE.packageId] !==
      NETEASE_RUNTIME_PROFILE.packageVersion
  ) {
    throw new TypeError('invalid NetEase runtime lock root');
  }
  let missingIntegrityCount = 0;
  let lockedPackageCount = 0;
  for (const [packagePath, packageValue] of Object.entries(value.packages)) {
    if (packagePath === '') continue;
    if (
      !packagePath.startsWith('node_modules/') ||
      !isPlainObject(packageValue)
    ) {
      throw new TypeError('invalid NetEase runtime locked package');
    }
    lockedPackageCount += 1;
    if (
      typeof packageValue.version !== 'string' ||
      typeof packageValue.resolved !== 'string' ||
      !packageValue.resolved.startsWith('https://registry.npmjs.org/') ||
      typeof packageValue.integrity !== 'string' ||
      !packageValue.integrity.startsWith('sha512-')
    ) {
      missingIntegrityCount += 1;
    }
  }
  const packageEntry =
    value.packages[`node_modules/${NETEASE_RUNTIME_PROFILE.packageId}`];
  if (
    !packageEntry ||
    packageEntry.version !== NETEASE_RUNTIME_PROFILE.packageVersion ||
    packageEntry.integrity !== NETEASE_RUNTIME_PROFILE.packageIntegrity
  ) {
    throw new TypeError('invalid NetEase runtime package lock');
  }
  return Object.freeze({
    packageVersion: packageEntry.version,
    packageIntegrity: packageEntry.integrity,
    lockedPackageCount,
    missingIntegrityCount,
  });
}

export const NETEASE_WORKER_MAX_IPC_BYTES = MAX_IPC_BYTES;
