'use strict';

const fs = require('node:fs');
const path = require('node:path');
const contractValues = require('../../../shared/musicStructureContractValues.json');
const { isSafeTrackId } = require('../library/paths');
const { evaluateM2Sections } = require('../musicStructureContract');

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_CASES = 500;
const MAX_TAGS = 16;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const CANONICAL_ROLES = new Set(contractValues.canonicalSectionRoles);

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

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function readBoundedJson(filePath, maximumBytes, label) {
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');
    const stats = fs.fstatSync(fileDescriptor);
    if (!stats.isFile()) throw new Error(`${label} is missing`);
    if (stats.size > maximumBytes) throw new Error(`${label} is too large`);
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    const bytesRead = fs.readSync(
      fileDescriptor,
      buffer,
      0,
      maximumBytes + 1,
      0,
    );
    if (bytesRead > maximumBytes) throw new Error(`${label} is too large`);
    return JSON.parse(buffer.toString('utf8', 0, bytesRead));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${label} is missing`, { cause: error });
    }
    throw error;
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

function validateTags(tags, label) {
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAGS) {
    throw new TypeError(`${label} tags are invalid`);
  }
  const unique = new Set();
  for (const tag of tags) {
    requireComponent(tag, `${label} tag`);
    if (unique.has(tag)) throw new TypeError(`${label} tags must be unique`);
    unique.add(tag);
  }
}

function validateDuration(value, label) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > contractValues.maxDurationMs
  ) {
    throw new TypeError(`${label} duration is invalid`);
  }
}

function validateRunConfig(value, expectedLibraryRoot) {
  assertExactKeys(
    value,
    [
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
    'benchmark run config',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported benchmark run config version');
  }
  requireComponent(value.benchmarkId, 'benchmark id');
  for (const key of [
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
  if (pathKey(value.libraryRoot) !== pathKey(expectedLibraryRoot)) {
    throw new Error('benchmark run config does not match the current library');
  }
  if (isWithin(value.libraryRoot, value.outputRoot)) {
    throw new Error('benchmark output must stay outside the library');
  }
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('benchmark run cases are invalid');
  }
  const caseIds = new Set();
  const trackIds = new Set();
  for (const benchmarkCase of value.cases) {
    assertExactKeys(
      benchmarkCase,
      ['benchmarkCaseId', 'trackId', 'durationMs', 'tags'],
      'benchmark run case',
    );
    requireComponent(benchmarkCase.benchmarkCaseId, 'benchmark case id');
    if (!isSafeTrackId(benchmarkCase.trackId)) {
      throw new TypeError('benchmark track id is unsafe');
    }
    validateDuration(benchmarkCase.durationMs, 'benchmark case');
    validateTags(benchmarkCase.tags, 'benchmark case');
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

function validateSections(sections, durationMs) {
  if (
    !Array.isArray(sections) ||
    sections.length > contractValues.maxSections
  ) {
    throw new TypeError('benchmark prediction sections are invalid');
  }
  for (const [index, section] of sections.entries()) {
    assertExactKeys(
      section,
      ['startMs', 'endMs', 'role', 'confidence'],
      `benchmark prediction section ${index}`,
    );
    if (
      !Number.isSafeInteger(section.startMs) ||
      !Number.isSafeInteger(section.endMs) ||
      section.startMs < 0 ||
      section.endMs <= section.startMs ||
      section.endMs > durationMs + contractValues.durationToleranceMs ||
      !CANONICAL_ROLES.has(section.role) ||
      !Number.isFinite(section.confidence) ||
      section.confidence < contractValues.minConfidence ||
      section.confidence > contractValues.maxConfidence ||
      (index > 0 && section.startMs < sections[index - 1].endMs)
    ) {
      throw new TypeError(`benchmark prediction section ${index} is invalid`);
    }
  }
}

function validateEstimate(estimate, durationMs) {
  if (estimate?.status === 'failed') {
    assertExactKeys(
      estimate,
      ['status', 'errorCode'],
      'benchmark failed estimate',
    );
    if (!ERROR_CODE_RE.test(estimate.errorCode || '')) {
      throw new TypeError('benchmark failure code is invalid');
    }
    return;
  }
  assertExactKeys(
    estimate,
    ['status', 'bpm', 'sections'],
    'benchmark completed estimate',
  );
  if (
    estimate.status !== 'completed' ||
    (estimate.bpm !== null &&
      (!Number.isFinite(estimate.bpm) ||
        estimate.bpm < contractValues.minBpm ||
        estimate.bpm > contractValues.maxBpm))
  ) {
    throw new TypeError('benchmark estimate is invalid');
  }
  validateSections(estimate.sections, durationMs);
}

function validatePredictions(value, runConfig) {
  assertExactKeys(
    value,
    ['schemaVersion', 'benchmarkId', 'analyzer', 'cases'],
    'benchmark predictions',
  );
  if (
    value.schemaVersion !== 1 ||
    value.benchmarkId !== runConfig.benchmarkId
  ) {
    throw new TypeError('benchmark predictions identity is invalid');
  }
  assertExactKeys(
    value.analyzer,
    ['id', 'version', 'profileId', 'modelId'],
    'benchmark analyzer',
  );
  for (const [key, label] of [
    ['id', 'analyzer id'],
    ['version', 'analyzer version'],
    ['profileId', 'analyzer profile id'],
    ['modelId', 'analyzer model id'],
  ]) {
    requireComponent(value.analyzer[key], label);
  }
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > runConfig.cases.length
  ) {
    throw new TypeError('benchmark prediction cases are invalid');
  }
  const runCases = new Map(
    runConfig.cases.map((benchmarkCase) => [
      benchmarkCase.benchmarkCaseId,
      benchmarkCase,
    ]),
  );
  const seen = new Set();
  return value.cases.map((predictionCase) => {
    assertExactKeys(
      predictionCase,
      ['id', 'tags', 'durationMs', 'wallMs', 'estimate'],
      'benchmark prediction case',
    );
    requireComponent(predictionCase.id, 'benchmark prediction case id');
    const runCase = runCases.get(predictionCase.id);
    if (!runCase) {
      throw new TypeError(
        'benchmark prediction case is absent from run config',
      );
    }
    if (seen.has(predictionCase.id)) {
      throw new TypeError('benchmark prediction case ids must be unique');
    }
    seen.add(predictionCase.id);
    validateTags(predictionCase.tags, 'benchmark prediction case');
    validateDuration(predictionCase.durationMs, 'benchmark prediction case');
    if (
      JSON.stringify(predictionCase.tags) !== JSON.stringify(runCase.tags) ||
      Math.abs(predictionCase.durationMs - runCase.durationMs) >
        contractValues.durationToleranceMs ||
      !Number.isSafeInteger(predictionCase.wallMs) ||
      predictionCase.wallMs < 0
    ) {
      throw new TypeError(
        'benchmark prediction case does not match run config',
      );
    }
    validateEstimate(predictionCase.estimate, predictionCase.durationMs);
    const m2Status =
      predictionCase.estimate.status === 'completed'
        ? evaluateM2Sections(
            predictionCase.estimate.sections,
            predictionCase.durationMs,
          )
        : 'analysis-failed';
    return {
      id: predictionCase.id,
      trackId: runCase.trackId,
      tags: [...predictionCase.tags],
      durationMs: predictionCase.durationMs,
      wallMs: predictionCase.wallMs,
      m2Status,
      estimate:
        predictionCase.estimate.status === 'completed'
          ? {
              status: 'completed',
              bpm: predictionCase.estimate.bpm,
              sections: predictionCase.estimate.sections.map((section) => ({
                ...section,
              })),
            }
          : { ...predictionCase.estimate },
    };
  });
}

function loadMusicAnalysisBenchmarkReview(configPath, options = {}) {
  if (
    typeof configPath !== 'string' ||
    !path.isAbsolute(configPath) ||
    typeof options.expectedLibraryRoot !== 'string' ||
    !path.isAbsolute(options.expectedLibraryRoot)
  ) {
    throw new TypeError('benchmark review paths are invalid');
  }
  const runConfig = validateRunConfig(
    readBoundedJson(configPath, MAX_CONFIG_BYTES, 'benchmark run config'),
    options.expectedLibraryRoot,
  );
  const evidencePath = path.join(runConfig.outputRoot, 'predictions.json');
  if (!isWithin(runConfig.outputRoot, evidencePath)) {
    throw new Error('benchmark evidence path is invalid');
  }
  const predictions = readBoundedJson(
    evidencePath,
    MAX_EVIDENCE_BYTES,
    'benchmark predictions',
  );
  return {
    schemaVersion: 1,
    benchmarkId: runConfig.benchmarkId,
    analyzer: { ...predictions.analyzer },
    cases: validatePredictions(predictions, runConfig),
  };
}

module.exports = { loadMusicAnalysisBenchmarkReview };
