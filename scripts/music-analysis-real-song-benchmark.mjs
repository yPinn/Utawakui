import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  fingerprintBpmCorpus,
  validateBpmCorpus,
} from './music-analysis-bpm-evaluation.mjs';

const require = createRequire(import.meta.url);
const contractValues = require('../shared/musicStructureContractValues.json');
const {
  isSafeTrackId,
  resolveTrackAudioPath,
} = require('../electron/lib/library/paths.js');
const {
  validateAudioPythonModelManifest,
} = require('../electron/lib/audioProcessing/audioPythonManifest.js');

const MAX_CASES = 500;
const MAX_TAGS = 16;
const MAX_PROCESS_OUTPUT_BYTES = 16 * 1024 * 1024;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CANONICAL_ROLES = new Set(contractValues.canonicalSectionRoles);
const DEFAULT_MODEL_ID = 'all-in-one-harmonix-fold0';
const BENCHMARK_PROFILES = Object.freeze({
  'all-in-one-harmonix-fold0': Object.freeze({
    benchmarkKind: 'music-structure',
    analyzerId: 'all-in-one-structure',
    profileId: 'all-in-one-cpu-v1',
    manifestVersion: 'harmonix-fold0-htdemucs-v1',
    architecture: 'all-in-one-with-htdemucs',
    package: 'all-in-one-infer',
    packageVersion: '3.1.0',
    modelName: 'harmonix-fold0',
    signals: ['tempo', 'beats', 'downbeats', 'sections'],
    distributionStatus: 'benchmark-only',
    artifacts: [
      {
        role: 'structure-checkpoint',
        filename: 'harmonix-fold0-0vra4ys2.pth',
        sizeBytes: 1400571,
        sha256:
          '0db596dfb0995f41d62f6267d76a9d54c046f1649bd35e1dbeca0c5f9a7b8acd',
      },
      {
        role: 'separation-checkpoint',
        filename: '955717e8-8726e21a.th',
        sizeBytes: 84141911,
        sha256:
          '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4',
      },
      {
        role: 'separation-config',
        filename: 'htdemucs.yaml',
        sizeBytes: 21,
        sha256:
          '239c445d0b14454d541ad8bd9bb271c9e536d267e8a4625208744cbb2e7bb66c',
      },
    ],
  }),
  'beat-this-small0': Object.freeze({
    benchmarkKind: 'bpm',
    analyzerId: 'beat-this',
    profileId: 'beat-this-small0-cpu-v3',
    manifestVersion: '1.1.0-small0',
    architecture: 'beat-this',
    package: 'beat-this',
    packageVersion: '1.1.0',
    modelName: 'small0',
    signals: ['tempo', 'beats', 'downbeats'],
    distributionStatus: 'product-downloadable',
    artifacts: [
      {
        role: 'weights',
        filename: 'small0.ckpt',
        sizeBytes: 8451101,
        sha256:
          '6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b',
      },
    ],
  }),
  'beat-this-final0': Object.freeze({
    benchmarkKind: 'bpm',
    analyzerId: 'beat-this',
    profileId: 'beat-this-final0-cpu-v3',
    manifestVersion: '1.1.0-final0',
    architecture: 'beat-this',
    package: 'beat-this',
    packageVersion: '1.1.0',
    modelName: 'final0',
    signals: ['tempo', 'beats', 'downbeats'],
    distributionStatus: 'product-downloadable',
    artifacts: [
      {
        role: 'weights',
        filename: 'final0.ckpt',
        sizeBytes: 81058141,
        sha256:
          '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331',
      },
    ],
  }),
});

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function requireComponent(value, label) {
  if (!COMPONENT_RE.test(value || '') || value === '.' || value === '..') {
    throw new TypeError(`${label} is invalid`);
  }
}

function requireAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`);
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function validateCase(value, benchmarkKind = 'music-structure') {
  assertExactKeys(
    value,
    benchmarkKind === 'bpm'
      ? ['benchmarkCaseId', 'trackId', 'durationMs']
      : ['benchmarkCaseId', 'trackId', 'durationMs', 'tags'],
    'real-song benchmark case',
  );
  requireComponent(value.benchmarkCaseId, 'benchmark case id');
  if (!isSafeTrackId(value.trackId)) {
    throw new TypeError('benchmark track id is unsafe');
  }
  if (
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs <= 0 ||
    value.durationMs > contractValues.maxDurationMs
  ) {
    throw new TypeError('benchmark case duration is invalid');
  }
  if (benchmarkKind !== 'bpm') {
    if (
      !Array.isArray(value.tags) ||
      value.tags.length === 0 ||
      value.tags.length > MAX_TAGS
    ) {
      throw new TypeError('benchmark case tags are invalid');
    }
    const tags = new Set();
    for (const tag of value.tags) {
      requireComponent(tag, 'benchmark case tag');
      if (tags.has(tag))
        throw new TypeError('benchmark case tags must be unique');
      tags.add(tag);
    }
  }
}

export function validateRealSongBenchmarkConfig(value) {
  if (!isPlainObject(value)) {
    throw new TypeError('real-song benchmark config must be an object');
  }
  const benchmarkKind =
    value.schemaVersion === 1
      ? 'music-structure'
      : value.schemaVersion === 2 && value.benchmarkKind === 'bpm'
        ? 'bpm'
        : value.schemaVersion === 3 &&
            value.benchmarkKind === 'bpm-runtime-smoke'
          ? 'bpm-runtime-smoke'
          : null;
  if (!benchmarkKind) {
    throw new TypeError('unsupported real-song benchmark config version');
  }
  assertExactKeys(
    value,
    benchmarkKind !== 'music-structure'
      ? [
          'schemaVersion',
          'benchmarkKind',
          'benchmarkId',
          ...(benchmarkKind === 'bpm' ? ['corpusPath'] : []),
          'libraryRoot',
          'outputRoot',
          'ffmpegPath',
          'pythonPath',
          'environmentPath',
          'workerPath',
          'modelManifestPath',
          'modelPath',
          'cases',
        ]
      : [
          'schemaVersion',
          'benchmarkId',
          'libraryRoot',
          'outputRoot',
          'ffmpegPath',
          'pythonPath',
          'environmentPath',
          'workerPath',
          'modelManifestPath',
          'modelPath',
          'cases',
        ],
    'real-song benchmark config',
  );
  requireComponent(value.benchmarkId, 'benchmark id');
  for (const key of [
    ...(benchmarkKind === 'bpm' ? ['corpusPath'] : []),
    'libraryRoot',
    'outputRoot',
    'ffmpegPath',
    'pythonPath',
    'environmentPath',
    'workerPath',
    'modelManifestPath',
    'modelPath',
  ]) {
    requireAbsolutePath(value[key], key);
  }
  if (isWithin(value.libraryRoot, value.outputRoot)) {
    throw new TypeError('benchmark output must stay outside the library');
  }
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('real-song benchmark cases are invalid');
  }
  const caseIds = new Set();
  const trackIds = new Set();
  for (const benchmarkCase of value.cases) {
    validateCase(
      benchmarkCase,
      benchmarkKind === 'music-structure' ? benchmarkKind : 'bpm',
    );
    if (caseIds.has(benchmarkCase.benchmarkCaseId)) {
      throw new TypeError('benchmark case ids must be unique');
    }
    if (trackIds.has(benchmarkCase.trackId)) {
      throw new TypeError('benchmark track ids must be unique');
    }
    caseIds.add(benchmarkCase.benchmarkCaseId);
    trackIds.add(benchmarkCase.trackId);
  }
  return value;
}

function getBenchmarkProfile(manifest) {
  const profile = BENCHMARK_PROFILES[manifest?.id];
  if (!profile) throw new Error('unsupported real-song benchmark model');
  return profile;
}

export function validateBenchmarkModelManifest(manifest) {
  validateAudioPythonModelManifest(manifest);
  const profile = getBenchmarkProfile(manifest);
  const artifacts = manifest.files.map(
    ({ role, filename, sizeBytes, sha256 }) => ({
      role,
      filename,
      sizeBytes,
      sha256,
    }),
  );
  if (
    manifest.version !== profile.manifestVersion ||
    manifest.architecture !== profile.architecture ||
    manifest.wrapper.package !== profile.package ||
    manifest.wrapper.version !== profile.packageVersion ||
    manifest.wrapper.model !== profile.modelName ||
    JSON.stringify(manifest.signals) !== JSON.stringify(profile.signals) ||
    manifest.distribution.status !== profile.distributionStatus ||
    JSON.stringify(artifacts) !== JSON.stringify(profile.artifacts)
  ) {
    throw new Error('unsupported real-song benchmark model');
  }
  return profile;
}

export function validateBpmBenchmarkMapping(config, rawCorpus) {
  validateRealSongBenchmarkConfig(config);
  const corpus = validateBpmCorpus(rawCorpus);
  if (
    config.schemaVersion !== 2 ||
    config.benchmarkKind !== 'bpm' ||
    config.benchmarkId !== corpus.benchmarkId ||
    config.cases.length !== corpus.cases.length
  ) {
    throw new TypeError('BPM benchmark corpus mapping does not match');
  }
  const configIds = new Set(
    config.cases.map(({ benchmarkCaseId }) => benchmarkCaseId),
  );
  if (corpus.cases.some(({ id }) => !configIds.has(id))) {
    throw new TypeError('BPM benchmark corpus mapping does not match');
  }
  return corpus;
}

export function buildRuntimeBenchmarkConfig(config, runtimeInputs) {
  validateRealSongBenchmarkConfig(config);
  if (!SHA256_RE.test(runtimeInputs?.workerSha256 || '')) {
    throw new TypeError('benchmark runtime worker hash is invalid');
  }
  return { ...config, workerSha256: runtimeInputs.workerSha256 };
}

export function deriveBenchmarkRuntimeRequirements(config, manifest) {
  validateRealSongBenchmarkConfig(config);
  const profile = validateBenchmarkModelManifest(manifest);
  const benchmarkKind =
    config.schemaVersion === 1
      ? 'music-structure'
      : config.schemaVersion === 2
        ? 'bpm'
        : 'bpm-runtime-smoke';
  if (
    benchmarkKind !== profile.benchmarkKind &&
    !(benchmarkKind === 'bpm-runtime-smoke' && profile.benchmarkKind === 'bpm')
  ) {
    throw new Error('benchmark config and model kind do not match');
  }
  return {
    benchmarkKind,
    requiresCorpus: benchmarkKind === 'bpm',
    profile,
  };
}

export function buildWorkerRequest({ config, manifest, inputPath, jobPath }) {
  const profile = getBenchmarkProfile(manifest);
  return {
    protocolVersion: 1,
    operation: 'analyze-structure',
    analyzerId: profile.analyzerId,
    profileId: profile.profileId,
    modelId: manifest.id,
    modelName: manifest.wrapper.model,
    environmentPath: config.environmentPath,
    inputPath,
    jobPath,
    modelPath: config.modelPath,
    modelFiles: manifest.files.map(({ role, filename, sha256 }) => ({
      role,
      path: path.join(config.modelPath, filename),
      sha256,
    })),
  };
}

export function buildRunFingerprint({
  benchmarkCase,
  manifest,
  sourceSha256,
  workerSha256,
}) {
  const profile = getBenchmarkProfile(manifest);
  validateCase(benchmarkCase, profile.benchmarkKind);
  if (!SHA256_RE.test(sourceSha256) || !SHA256_RE.test(workerSha256)) {
    throw new TypeError('benchmark fingerprint hashes are invalid');
  }
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        analyzerId: profile.analyzerId,
        profileId: profile.profileId,
        benchmarkCase,
        sourceSha256,
        workerSha256,
        model: {
          id: manifest.id,
          version: manifest.version,
          wrapper: manifest.wrapper,
          files: manifest.files.map(({ role, sizeBytes, sha256 }) => ({
            role,
            sizeBytes,
            sha256,
          })),
        },
      }),
    )
    .digest('hex');
}

function validateWorkerSection(section, durationMs, index) {
  if (
    !isPlainObject(section) ||
    !Number.isSafeInteger(section.startMs) ||
    !Number.isSafeInteger(section.endMs) ||
    section.startMs < 0 ||
    section.endMs <= section.startMs ||
    section.endMs > durationMs + contractValues.durationToleranceMs ||
    !CANONICAL_ROLES.has(section.role) ||
    !Number.isFinite(section.confidence) ||
    section.confidence < contractValues.minConfidence ||
    section.confidence > contractValues.maxConfidence
  ) {
    throw new TypeError(`worker section ${index} is invalid`);
  }
}

function validateWorkerResult(benchmarkCase, result, manifest) {
  const profile = getBenchmarkProfile(manifest);
  if (
    !isPlainObject(result) ||
    result.protocolVersion !== 1 ||
    result.analyzerId !== profile.analyzerId ||
    result.profileId !== profile.profileId ||
    result.modelId !== manifest.id ||
    result.offlineEnforced !== true ||
    result.noUserCache !== true ||
    !Number.isSafeInteger(result.durationMs) ||
    result.durationMs <= 0 ||
    Math.abs(result.durationMs - benchmarkCase.durationMs) >
      contractValues.durationToleranceMs ||
    !Array.isArray(result.sections) ||
    result.sections.length > contractValues.maxSections
  ) {
    throw new TypeError('worker result is invalid');
  }
  if (
    result.tempo !== null &&
    (!isPlainObject(result.tempo) ||
      !Number.isFinite(result.tempo.bpm) ||
      result.tempo.bpm < contractValues.minBpm ||
      result.tempo.bpm > contractValues.maxBpm ||
      !Number.isFinite(result.tempo.confidence) ||
      result.tempo.confidence < contractValues.minConfidence ||
      result.tempo.confidence > contractValues.maxConfidence)
  ) {
    throw new TypeError('worker tempo is invalid');
  }
  for (const [index, section] of result.sections.entries()) {
    validateWorkerSection(section, result.durationMs, index);
    if (index > 0 && section.startMs < result.sections[index - 1].endMs) {
      throw new TypeError('worker sections overlap');
    }
  }
}

function validateStoredResult(benchmarkCase, result, manifest) {
  const profile = getBenchmarkProfile(manifest);
  assertExactKeys(
    result,
    profile.benchmarkKind === 'bpm'
      ? ['id', 'durationMs', 'wallMs', 'estimate']
      : ['id', 'tags', 'durationMs', 'wallMs', 'estimate'],
    'stored benchmark result',
  );
  if (
    result.id !== benchmarkCase.benchmarkCaseId ||
    (profile.benchmarkKind !== 'bpm' &&
      JSON.stringify(result.tags) !== JSON.stringify(benchmarkCase.tags)) ||
    !Number.isSafeInteger(result.durationMs) ||
    Math.abs(result.durationMs - benchmarkCase.durationMs) >
      contractValues.durationToleranceMs ||
    !Number.isSafeInteger(result.wallMs) ||
    result.wallMs < 0
  ) {
    throw new TypeError('stored benchmark result does not match its case');
  }
  if (result.estimate?.status === 'failed') {
    assertExactKeys(
      result.estimate,
      ['status', 'errorCode'],
      'stored benchmark failure',
    );
    if (!SAFE_ERROR_CODE_RE.test(result.estimate.errorCode || '')) {
      throw new TypeError('stored benchmark failure code is invalid');
    }
    return result;
  }
  assertExactKeys(
    result.estimate,
    profile.benchmarkKind === 'bpm'
      ? ['status', 'bpm', 'beatEvidenceConfidence']
      : ['status', 'bpm', 'sections'],
    'stored benchmark estimate',
  );
  if (
    result.estimate.status !== 'completed' ||
    (result.estimate.bpm !== null &&
      (!Number.isFinite(result.estimate.bpm) ||
        result.estimate.bpm < contractValues.minBpm ||
        result.estimate.bpm > contractValues.maxBpm)) ||
    (profile.benchmarkKind === 'bpm'
      ? result.estimate.beatEvidenceConfidence !== null &&
        (!Number.isFinite(result.estimate.beatEvidenceConfidence) ||
          result.estimate.beatEvidenceConfidence <
            contractValues.minConfidence ||
          result.estimate.beatEvidenceConfidence > contractValues.maxConfidence)
      : !Array.isArray(result.estimate.sections) ||
        result.estimate.sections.length > contractValues.maxSections)
  ) {
    throw new TypeError('stored benchmark estimate is invalid');
  }
  for (const [index, section] of (result.estimate.sections || []).entries()) {
    assertExactKeys(
      section,
      ['startMs', 'endMs', 'role', 'confidence'],
      `stored benchmark section ${index}`,
    );
    validateWorkerSection(section, result.durationMs, index);
    if (
      index > 0 &&
      section.startMs < result.estimate.sections[index - 1].endMs
    ) {
      throw new TypeError('stored benchmark sections overlap');
    }
  }
  return result;
}

export function projectWorkerResult(
  benchmarkCase,
  result,
  wallMs,
  manifest = { id: DEFAULT_MODEL_ID },
) {
  const profile = getBenchmarkProfile(manifest);
  validateCase(benchmarkCase, profile.benchmarkKind);
  validateWorkerResult(benchmarkCase, result, manifest);
  if (!Number.isSafeInteger(wallMs) || wallMs < 0) {
    throw new TypeError('benchmark wall time is invalid');
  }
  const projected = {
    id: benchmarkCase.benchmarkCaseId,
    durationMs: result.durationMs,
    wallMs,
  };
  if (profile.benchmarkKind === 'bpm') {
    projected.estimate = {
      status: 'completed',
      bpm: result.tempo?.bpm ?? null,
      beatEvidenceConfidence: result.tempo?.confidence ?? null,
    };
    return projected;
  }
  projected.tags = benchmarkCase.tags;
  projected.estimate = {
    status: 'completed',
    bpm: result.tempo?.bpm ?? null,
    sections: result.sections.map(({ startMs, endMs, role, confidence }) => ({
      startMs,
      endMs,
      role,
      confidence,
    })),
  };
  return projected;
}

function projectFailure(benchmarkCase, errorCode, wallMs, manifest) {
  const profile = getBenchmarkProfile(manifest);
  const safeCode = SAFE_ERROR_CODE_RE.test(errorCode || '')
    ? errorCode
    : 'BENCHMARK_FAILED';
  const projected = {
    id: benchmarkCase.benchmarkCaseId,
    durationMs: benchmarkCase.durationMs,
    wallMs: Math.max(0, Math.round(wallMs)),
    estimate: { status: 'failed', errorCode: safeCode },
  };
  if (profile.benchmarkKind !== 'bpm') projected.tags = benchmarkCase.tags;
  return projected;
}

export function buildPredictionEvidence(config, manifest, cases, rawCorpus) {
  const profile = getBenchmarkProfile(manifest);
  if (profile.benchmarkKind === 'bpm') {
    if (
      config.schemaVersion === 3 &&
      config.benchmarkKind === 'bpm-runtime-smoke'
    ) {
      validateRealSongBenchmarkConfig(config);
      if (cases.length === 0 || cases.length > config.cases.length) {
        throw new TypeError('BPM runtime smoke cases do not match');
      }
      const configIds = new Set(
        config.cases.map(({ benchmarkCaseId }) => benchmarkCaseId),
      );
      const resultIds = new Set(cases.map(({ id }) => id));
      if (
        resultIds.size !== cases.length ||
        cases.some(({ id }) => !configIds.has(id))
      ) {
        throw new TypeError('BPM runtime smoke cases do not match');
      }
      return {
        schemaVersion: 1,
        evidenceKind: 'bpm-runtime-smoke',
        benchmarkId: config.benchmarkId,
        analyzer: {
          id: profile.analyzerId,
          version: manifest.wrapper.version,
          profileId: profile.profileId,
          modelId: manifest.id,
        },
        cases: cases.map(({ id, durationMs, wallMs, estimate }) => ({
          id,
          durationMs,
          wallMs,
          estimate,
        })),
      };
    }
    const corpus = validateBpmBenchmarkMapping(config, rawCorpus);
    if (cases.length !== corpus.cases.length) {
      throw new TypeError('BPM benchmark corpus mapping does not match');
    }
    const resultIds = new Set(cases.map(({ id }) => id));
    if (corpus.cases.some(({ id }) => !resultIds.has(id))) {
      throw new TypeError('BPM benchmark corpus mapping does not match');
    }
    return {
      schemaVersion: 1,
      benchmarkId: config.benchmarkId,
      corpusFingerprint: fingerprintBpmCorpus(corpus),
      analyzer: {
        id: profile.analyzerId,
        version: manifest.wrapper.version,
        profileId: profile.profileId,
        modelId: manifest.id,
      },
      cases: cases.map(({ id, estimate }) => ({ id, estimate })),
    };
  }
  return {
    schemaVersion: 1,
    benchmarkId: config.benchmarkId,
    analyzer: {
      id: profile.analyzerId,
      version: manifest.wrapper.version,
      profileId: profile.profileId,
      modelId: manifest.id,
    },
    cases,
  };
}

function requireFile(filePath, label) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} is missing`);
  }
}

function requireDirectory(directoryPath, label) {
  if (!fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} is missing`);
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function hashFileSync(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

async function validateRuntimeInputs(config, manifest) {
  requireDirectory(config.libraryRoot, 'benchmark library root');
  requireFile(config.ffmpegPath, 'benchmark FFmpeg');
  requireFile(config.pythonPath, 'benchmark Python');
  requireDirectory(config.environmentPath, 'benchmark environment');
  requireFile(config.workerPath, 'benchmark worker');
  requireFile(config.modelManifestPath, 'benchmark model manifest');
  requireDirectory(config.modelPath, 'benchmark model directory');
  const requirements = deriveBenchmarkRuntimeRequirements(config, manifest);
  if (requirements.requiresCorpus) {
    requireFile(config.corpusPath, 'benchmark BPM corpus');
  }
  for (const artifact of manifest.files) {
    const filePath = path.join(config.modelPath, artifact.filename);
    requireFile(filePath, `benchmark model ${artifact.role}`);
    const stats = fs.statSync(filePath);
    if (
      stats.size !== artifact.sizeBytes ||
      (await hashFile(filePath)) !== artifact.sha256
    ) {
      throw new Error(`benchmark model ${artifact.role} verification failed`);
    }
  }
  return { workerSha256: await hashFile(config.workerPath) };
}

function boundedAppend(current, chunk, label) {
  const next = current + chunk;
  if (Buffer.byteLength(next) > MAX_PROCESS_OUTPUT_BYTES) {
    throw new Error(`${label} exceeded the output limit`);
  }
  return next;
}

function runProcess(command, args, { input, onStdoutLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let pendingLine = '';
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    child.on('error', (error) => settle(reject, error));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      try {
        stdout = boundedAppend(stdout, chunk, 'benchmark stdout');
        pendingLine += chunk;
        const lines = pendingLine.split(/\r?\n/);
        pendingLine = lines.pop() ?? '';
        for (const line of lines) onStdoutLine?.(line);
      } catch (error) {
        child.kill();
        settle(reject, error);
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        stderr = boundedAppend(stderr, chunk, 'benchmark stderr');
      } catch (error) {
        child.kill();
        settle(reject, error);
      }
    });
    child.on('close', (code) => {
      if (pendingLine) onStdoutLine?.(pendingLine);
      settle(resolve, { code, stdout, stderr });
    });
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadCachedResult(
  resultPath,
  cachePath,
  cacheKey,
  benchmarkCase,
  manifest = { id: DEFAULT_MODEL_ID },
) {
  try {
    const cache = loadJson(cachePath);
    assertExactKeys(
      cache,
      ['schemaVersion', 'cacheKey', 'resultSha256'],
      'benchmark cache',
    );
    if (
      cache.schemaVersion !== 1 ||
      cache.cacheKey !== cacheKey ||
      !SHA256_RE.test(cache.resultSha256) ||
      hashFileSync(resultPath) !== cache.resultSha256
    ) {
      return null;
    }
    return validateStoredResult(benchmarkCase, loadJson(resultPath), manifest);
  } catch {
    return null;
  }
}

function parseWorkerTerminal(stdout) {
  const messages = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const terminal = messages.at(-1);
  if (terminal?.type === 'done') return terminal.result;
  const error = new Error('benchmark worker failed');
  error.code = SAFE_ERROR_CODE_RE.test(terminal?.code || '')
    ? terminal.code
    : 'WORKER_FAILED';
  throw error;
}

async function runCase(
  config,
  manifest,
  benchmarkCase,
  { force = false } = {},
) {
  const jobDirectory = path.resolve(
    config.outputRoot,
    benchmarkCase.benchmarkCaseId,
  );
  if (!isWithin(config.outputRoot, jobDirectory)) {
    throw new Error('benchmark job path escaped the output root');
  }
  const resultPath = path.join(jobDirectory, 'result.json');
  const cachePath = path.join(jobDirectory, 'cache.json');

  const startedAt = performance.now();
  const workDirectory = path.join(jobDirectory, 'work');
  if (!isWithin(jobDirectory, workDirectory)) {
    throw new Error('benchmark work path escaped the job directory');
  }
  fs.rmSync(workDirectory, { recursive: true, force: true });
  fs.mkdirSync(workDirectory, { recursive: true });
  try {
    const audioPath = resolveTrackAudioPath(
      config.libraryRoot,
      benchmarkCase.trackId,
    );
    if (!audioPath) {
      const error = new Error('benchmark source is missing');
      error.code = 'SOURCE_MISSING';
      throw error;
    }
    const cacheKey = buildRunFingerprint({
      benchmarkCase,
      manifest,
      sourceSha256: await hashFile(audioPath),
      workerSha256: config.workerSha256,
    });
    if (!force) {
      const cached = loadCachedResult(
        resultPath,
        cachePath,
        cacheKey,
        benchmarkCase,
        manifest,
      );
      if (cached) {
        process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] cached\n`);
        return cached;
      }
    }
    fs.rmSync(cachePath, { force: true });
    const decodedPath = path.join(workDirectory, 'input.wav');
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] decoding\n`);
    const decode = await runProcess(config.ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      audioPath,
      '-vn',
      '-sn',
      '-dn',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      decodedPath,
    ]);
    if (decode.code !== 0) {
      const error = new Error('benchmark decode failed');
      error.code = 'DECODE_FAILED';
      throw error;
    }
    const request = buildWorkerRequest({
      config,
      manifest,
      inputPath: decodedPath,
      jobPath: workDirectory,
    });
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] analyzing\n`);
    const worker = await runProcess(
      config.pythonPath,
      ['-I', config.workerPath],
      {
        input: `${JSON.stringify(request)}\n`,
        onStdoutLine: (line) => {
          try {
            const message = JSON.parse(line);
            if (message.type === 'progress') {
              process.stderr.write(
                `[${benchmarkCase.benchmarkCaseId}] ${message.stage} ${message.percent}%\n`,
              );
            }
          } catch {
            // The bounded terminal parser reports malformed worker output.
          }
        },
      },
    );
    if (worker.code !== 0) {
      const error = new Error('benchmark worker exited unsuccessfully');
      error.code = 'WORKER_FAILED';
      throw error;
    }
    const result = projectWorkerResult(
      benchmarkCase,
      parseWorkerTerminal(worker.stdout),
      Math.round(performance.now() - startedAt),
      manifest,
    );
    atomicWriteJson(resultPath, result);
    atomicWriteJson(cachePath, {
      schemaVersion: 1,
      cacheKey,
      resultSha256: hashFileSync(resultPath),
    });
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] completed\n`);
    return result;
  } catch (error) {
    const failure = projectFailure(
      benchmarkCase,
      error.code,
      performance.now() - startedAt,
      manifest,
    );
    fs.rmSync(cachePath, { force: true });
    atomicWriteJson(resultPath, failure);
    process.stderr.write(
      `[${benchmarkCase.benchmarkCaseId}] failed ${failure.estimate.errorCode}\n`,
    );
    return failure;
  } finally {
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  if (!argv[0]) {
    throw new Error(
      'usage: node scripts/music-analysis-real-song-benchmark.mjs <config.json> [--case <id>] [--force]',
    );
  }
  const options = {
    configPath: path.resolve(argv[0]),
    caseId: null,
    force: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--force') {
      options.force = true;
    } else if (argv[index] === '--case' && argv[index + 1]) {
      options.caseId = argv[index + 1];
      index += 1;
    } else {
      throw new Error('invalid real-song benchmark arguments');
    }
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const config = validateRealSongBenchmarkConfig(loadJson(options.configPath));
  const corpus =
    config.schemaVersion === 2
      ? validateBpmBenchmarkMapping(config, loadJson(config.corpusPath))
      : null;
  const manifest = validateAudioPythonModelManifest(
    loadJson(config.modelManifestPath),
  );
  const runtimeConfig = buildRuntimeBenchmarkConfig(
    config,
    await validateRuntimeInputs(config, manifest),
  );
  fs.mkdirSync(config.outputRoot, { recursive: true });
  if (corpus && options.caseId) {
    throw new Error(
      'BPM benchmark evidence requires the complete corpus; --case is unavailable',
    );
  }
  const selectedCases = options.caseId
    ? config.cases.filter(
        (benchmarkCase) => benchmarkCase.benchmarkCaseId === options.caseId,
      )
    : config.cases;
  if (selectedCases.length === 0) {
    throw new Error('requested benchmark case does not exist');
  }
  const results = [];
  for (const benchmarkCase of selectedCases) {
    results.push(
      await runCase(runtimeConfig, manifest, benchmarkCase, {
        force: options.force,
      }),
    );
  }
  const evidence = buildPredictionEvidence(config, manifest, results, corpus);
  const evidencePath = path.join(
    config.outputRoot,
    corpus
      ? 'bpm-predictions.json'
      : config.schemaVersion === 3
        ? 'bpm-smoke-predictions.json'
        : 'predictions.json',
  );
  atomicWriteJson(evidencePath, evidence);
  process.stdout.write(`${evidencePath}\n`);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
