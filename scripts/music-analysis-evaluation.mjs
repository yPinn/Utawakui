import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const contractValues = require('../shared/musicStructureContractValues.json');
const {
  evaluateM2Sections,
} = require('../electron/lib/musicStructureContract.js');

const MAX_BENCHMARK_BYTES = 8 * 1024 * 1024;
const MAX_CASES = 500;
const MAX_TAGS_PER_CASE = 16;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const CANONICAL_ROLES = new Set(contractValues.canonicalSectionRoles);

function requirePositiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / expected;
}

export function classifyTempoRelation(
  referenceBpm,
  estimatedBpm,
  { toleranceRatio = 0.04 } = {},
) {
  requirePositiveFinite(referenceBpm, 'reference BPM');
  requirePositiveFinite(estimatedBpm, 'estimated BPM');
  if (
    !Number.isFinite(toleranceRatio) ||
    toleranceRatio < 0 ||
    toleranceRatio >= 0.5
  ) {
    throw new TypeError('tolerance ratio must be between 0 and 0.5');
  }

  const candidates = [
    ['match', referenceBpm],
    ['half-time', referenceBpm / 2],
    ['double-time', referenceBpm * 2],
  ];
  const relation = candidates.find(
    ([, candidateBpm]) =>
      relativeError(estimatedBpm, candidateBpm) <= toleranceRatio,
  );
  return relation?.[0] ?? 'unrelated';
}

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

function requireRate(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
}

function requireBoundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} is out of range`);
  }
}

function validateBpm(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  requirePositiveFinite(value, label);
  if (value < contractValues.minBpm || value > contractValues.maxBpm) {
    throw new TypeError(`${label} is out of range`);
  }
}

function validateSections(sections, durationMs, { reference = false } = {}) {
  if (
    !Array.isArray(sections) ||
    sections.length > contractValues.maxSections ||
    (reference && sections.length < 2)
  ) {
    throw new TypeError('invalid benchmark sections');
  }

  for (const [index, section] of sections.entries()) {
    assertExactKeys(
      section,
      reference
        ? ['startMs', 'endMs', 'role']
        : ['startMs', 'endMs', 'role', 'confidence'],
      `section ${index}`,
    );
    requireBoundedInteger(
      section.startMs,
      0,
      durationMs,
      `section ${index} start`,
    );
    requireBoundedInteger(section.endMs, 1, durationMs, `section ${index} end`);
    if (section.endMs <= section.startMs) {
      throw new TypeError(`section ${index} must have positive duration`);
    }
    if (!CANONICAL_ROLES.has(section.role)) {
      throw new TypeError(`section ${index} has an invalid role`);
    }
    if (reference && section.role === 'unknown') {
      throw new TypeError('reference sections cannot use unknown roles');
    }
    if (
      !reference &&
      section.confidence !== null &&
      (!Number.isFinite(section.confidence) ||
        section.confidence < contractValues.minConfidence ||
        section.confidence > contractValues.maxConfidence)
    ) {
      throw new TypeError(`section ${index} has invalid confidence`);
    }
    if (index > 0 && section.startMs < sections[index - 1].endMs) {
      throw new TypeError(
        'benchmark sections must be ordered and nonoverlapping',
      );
    }
    if (
      reference &&
      index > 0 &&
      section.startMs !== sections[index - 1].endMs
    ) {
      throw new TypeError('reference sections must be contiguous');
    }
  }

  if (
    reference &&
    (sections[0].startMs !== 0 || sections.at(-1).endMs !== durationMs)
  ) {
    throw new TypeError('reference sections must cover the full duration');
  }
}

function validateEstimate(estimate, durationMs) {
  if (!isPlainObject(estimate)) {
    throw new TypeError('estimate must be an object');
  }
  if (estimate.status === 'failed') {
    assertExactKeys(estimate, ['status', 'errorCode'], 'failed estimate');
    requireComponent(estimate.errorCode, 'estimate error code');
    return;
  }
  if (estimate.status !== 'completed') {
    throw new TypeError('estimate status is invalid');
  }
  assertExactKeys(
    estimate,
    ['status', 'bpm', 'sections'],
    'completed estimate',
  );
  validateBpm(estimate.bpm, 'estimated BPM', { nullable: true });
  validateSections(estimate.sections, durationMs);
}

function validateBenchmarkCase(value) {
  assertExactKeys(
    value,
    [
      'id',
      'tags',
      'durationMs',
      'referenceBpm',
      'referenceSections',
      'estimate',
    ],
    'benchmark case',
  );
  requireComponent(value.id, 'case id');
  requireBoundedInteger(
    value.durationMs,
    1,
    contractValues.maxDurationMs,
    'case duration',
  );
  if (
    !Array.isArray(value.tags) ||
    value.tags.length === 0 ||
    value.tags.length > MAX_TAGS_PER_CASE
  ) {
    throw new TypeError('case tags are invalid');
  }
  const tags = new Set();
  for (const tag of value.tags) {
    requireComponent(tag, 'case tag');
    if (tags.has(tag)) throw new TypeError('case tags must be unique');
    tags.add(tag);
  }
  validateBpm(value.referenceBpm, 'reference BPM');
  validateSections(value.referenceSections, value.durationMs, {
    reference: true,
  });
  validateEstimate(value.estimate, value.durationMs);
}

function validateAcceptance(value) {
  assertExactKeys(
    value,
    [
      'minimumTracks',
      'requiredTags',
      'minimumBoundaryF1At500Ms',
      'minimumBoundaryF1At3000Ms',
      'minimumRoleDurationAccuracy',
      'minimumM2EligibleRate',
      'minimumRequiredTagRoleDurationAccuracy',
      'minimumRequiredTagM2EligibleRate',
      'maximumTempoOctaveErrorRate',
      'maximumTempoMissingRate',
      'maximumAnalysisFailureRate',
    ],
    'benchmark acceptance',
  );
  requireBoundedInteger(value.minimumTracks, 1, MAX_CASES, 'minimum tracks');
  for (const key of [
    'minimumBoundaryF1At500Ms',
    'minimumBoundaryF1At3000Ms',
    'minimumRoleDurationAccuracy',
    'minimumM2EligibleRate',
    'minimumRequiredTagRoleDurationAccuracy',
    'minimumRequiredTagM2EligibleRate',
    'maximumTempoOctaveErrorRate',
    'maximumTempoMissingRate',
    'maximumAnalysisFailureRate',
  ]) {
    requireRate(value[key], key);
  }
  if (!Array.isArray(value.requiredTags)) {
    throw new TypeError('requiredTags must be an array');
  }
  const requiredTags = new Set();
  for (const requirement of value.requiredTags) {
    assertExactKeys(requirement, ['tag', 'minimumTracks'], 'required tag');
    requireComponent(requirement.tag, 'required tag');
    requireBoundedInteger(
      requirement.minimumTracks,
      1,
      MAX_CASES,
      'required tag minimum tracks',
    );
    if (requiredTags.has(requirement.tag)) {
      throw new TypeError('required tags must be unique');
    }
    requiredTags.add(requirement.tag);
  }
}

export function validateMusicStructureBenchmark(value) {
  assertExactKeys(
    value,
    ['schemaVersion', 'benchmarkId', 'analyzer', 'acceptance', 'cases'],
    'music structure benchmark',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported music structure benchmark version');
  }
  requireComponent(value.benchmarkId, 'benchmark id');
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
  validateAcceptance(value.acceptance);
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('benchmark cases are invalid');
  }
  const caseIds = new Set();
  for (const benchmarkCase of value.cases) {
    validateBenchmarkCase(benchmarkCase);
    if (caseIds.has(benchmarkCase.id)) {
      throw new TypeError('benchmark case ids must be unique');
    }
    caseIds.add(benchmarkCase.id);
  }
  return value;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function boundaryScore(referenceSections, estimatedSections, toleranceMs) {
  const reference = referenceSections.slice(0, -1).map(({ endMs }) => endMs);
  const estimated = estimatedSections.slice(0, -1).map(({ endMs }) => endMs);
  if (reference.length === 0 || estimated.length === 0) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  let referenceIndex = 0;
  let estimatedIndex = 0;
  let matches = 0;
  while (
    referenceIndex < reference.length &&
    estimatedIndex < estimated.length
  ) {
    const difference = estimated[estimatedIndex] - reference[referenceIndex];
    if (Math.abs(difference) <= toleranceMs) {
      matches += 1;
      referenceIndex += 1;
      estimatedIndex += 1;
    } else if (difference < 0) {
      estimatedIndex += 1;
    } else {
      referenceIndex += 1;
    }
  }
  const precision = matches / estimated.length;
  const recall = matches / reference.length;
  return {
    precision: round(precision),
    recall: round(recall),
    f1: round(
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall),
    ),
  };
}

function roleDurationAccuracy(
  referenceSections,
  estimatedSections,
  durationMs,
) {
  let matchingDurationMs = 0;
  for (const reference of referenceSections) {
    for (const estimate of estimatedSections) {
      if (reference.role !== estimate.role) continue;
      matchingDurationMs += Math.max(
        0,
        Math.min(reference.endMs, estimate.endMs) -
          Math.max(reference.startMs, estimate.startMs),
      );
    }
  }
  return round(matchingDurationMs / durationMs);
}

const EMPTY_BOUNDARY_SCORE = Object.freeze({
  precision: 0,
  recall: 0,
  f1: 0,
});

export function scoreSectionPrediction(benchmarkCase) {
  validateBenchmarkCase(benchmarkCase);
  if (benchmarkCase.estimate.status === 'failed') {
    return {
      id: benchmarkCase.id,
      tags: benchmarkCase.tags,
      analysisStatus: 'failed',
      boundaryAt500Ms: EMPTY_BOUNDARY_SCORE,
      boundaryAt3000Ms: EMPTY_BOUNDARY_SCORE,
      roleDurationAccuracy: 0,
      tempoRelation: 'missing',
      m2Eligible: false,
      m2Status: 'analysis-failed',
    };
  }

  const { estimate } = benchmarkCase;
  const m2Status = evaluateM2Sections(
    estimate.sections,
    benchmarkCase.durationMs,
  );
  const tempoRelation =
    benchmarkCase.referenceBpm === null || estimate.bpm === null
      ? 'missing'
      : classifyTempoRelation(benchmarkCase.referenceBpm, estimate.bpm);
  return {
    id: benchmarkCase.id,
    tags: benchmarkCase.tags,
    analysisStatus: 'completed',
    boundaryAt500Ms: boundaryScore(
      benchmarkCase.referenceSections,
      estimate.sections,
      500,
    ),
    boundaryAt3000Ms: boundaryScore(
      benchmarkCase.referenceSections,
      estimate.sections,
      3000,
    ),
    roleDurationAccuracy: roleDurationAccuracy(
      benchmarkCase.referenceSections,
      estimate.sections,
      benchmarkCase.durationMs,
    ),
    tempoRelation,
    m2Eligible: m2Status === 'current',
    m2Status,
  };
}

function mean(values) {
  return round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function summarizeScores(scores) {
  return {
    trackCount: scores.length,
    boundaryF1At500Ms: mean(scores.map((score) => score.boundaryAt500Ms.f1)),
    boundaryF1At3000Ms: mean(scores.map((score) => score.boundaryAt3000Ms.f1)),
    roleDurationAccuracy: mean(
      scores.map((score) => score.roleDurationAccuracy),
    ),
    m2EligibleRate: mean(scores.map((score) => Number(score.m2Eligible))),
    tempoMatchRate: mean(
      scores.map((score) => Number(score.tempoRelation === 'match')),
    ),
    tempoOctaveErrorRate: mean(
      scores.map((score) =>
        Number(
          score.tempoRelation === 'half-time' ||
            score.tempoRelation === 'double-time',
        ),
      ),
    ),
    tempoMissingRate: mean(
      scores.map((score) => Number(score.tempoRelation === 'missing')),
    ),
    analysisFailureRate: mean(
      scores.map((score) => Number(score.analysisStatus === 'failed')),
    ),
  };
}

function createGate(id, actual, required, comparison) {
  return {
    id,
    actual,
    required,
    comparison,
    passed: comparison === 'at-least' ? actual >= required : actual <= required,
  };
}

export function evaluateMusicStructureBenchmark(value) {
  const benchmark = validateMusicStructureBenchmark(value);
  const scores = benchmark.cases.map(scoreSectionPrediction);
  const summary = summarizeScores(scores);
  const groups = {};
  const tags = new Set(scores.flatMap((score) => score.tags));
  for (const tag of [...tags].sort()) {
    groups[tag] = summarizeScores(
      scores.filter((score) => score.tags.includes(tag)),
    );
  }

  const { acceptance } = benchmark;
  const coverageGates = [
    createGate(
      'minimum-tracks',
      summary.trackCount,
      acceptance.minimumTracks,
      'at-least',
    ),
    ...acceptance.requiredTags.map(({ tag, minimumTracks }) =>
      createGate(
        `required-tag:${tag}`,
        groups[tag]?.trackCount ?? 0,
        minimumTracks,
        'at-least',
      ),
    ),
  ];
  const qualityGates = [
    createGate(
      'boundary-f1-500ms',
      summary.boundaryF1At500Ms,
      acceptance.minimumBoundaryF1At500Ms,
      'at-least',
    ),
    createGate(
      'boundary-f1-3000ms',
      summary.boundaryF1At3000Ms,
      acceptance.minimumBoundaryF1At3000Ms,
      'at-least',
    ),
    createGate(
      'role-duration-accuracy',
      summary.roleDurationAccuracy,
      acceptance.minimumRoleDurationAccuracy,
      'at-least',
    ),
    createGate(
      'm2-eligible-rate',
      summary.m2EligibleRate,
      acceptance.minimumM2EligibleRate,
      'at-least',
    ),
    ...acceptance.requiredTags.flatMap(({ tag }) => [
      createGate(
        `required-tag-role-accuracy:${tag}`,
        groups[tag]?.roleDurationAccuracy ?? 0,
        acceptance.minimumRequiredTagRoleDurationAccuracy,
        'at-least',
      ),
      createGate(
        `required-tag-m2-eligible-rate:${tag}`,
        groups[tag]?.m2EligibleRate ?? 0,
        acceptance.minimumRequiredTagM2EligibleRate,
        'at-least',
      ),
    ]),
    createGate(
      'tempo-octave-error-rate',
      summary.tempoOctaveErrorRate,
      acceptance.maximumTempoOctaveErrorRate,
      'at-most',
    ),
    createGate(
      'tempo-missing-rate',
      summary.tempoMissingRate,
      acceptance.maximumTempoMissingRate,
      'at-most',
    ),
    createGate(
      'analysis-failure-rate',
      summary.analysisFailureRate,
      acceptance.maximumAnalysisFailureRate,
      'at-most',
    ),
  ];
  const gates = [...coverageGates, ...qualityGates];
  const decision = coverageGates.some((gate) => !gate.passed)
    ? 'insufficient-data'
    : qualityGates.every((gate) => gate.passed)
      ? 'pass'
      : 'fail';

  return {
    schemaVersion: 1,
    benchmarkId: benchmark.benchmarkId,
    analyzer: benchmark.analyzer,
    decision,
    summary,
    groups,
    gates,
    cases: scores,
  };
}

function loadBenchmark(filePath) {
  const resolvedPath = path.resolve(filePath);
  const stats = fs.statSync(resolvedPath);
  if (stats.size > MAX_BENCHMARK_BYTES) {
    throw new Error('music structure benchmark exceeds the size limit');
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function writeReport(filePath, report) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temporaryPath, resolvedPath);
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    throw new Error(
      'usage: node scripts/music-analysis-evaluation.mjs <benchmark.json> [report.json]',
    );
  }
  if (outputPath && path.resolve(outputPath) === path.resolve(inputPath)) {
    throw new Error('benchmark report must not overwrite its input');
  }
  const report = evaluateMusicStructureBenchmark(loadBenchmark(inputPath));
  if (outputPath) {
    writeReport(outputPath, report);
    process.stdout.write(`${path.resolve(outputPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
