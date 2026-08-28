import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { classifyTempoRelation } from './music-analysis-evaluation.mjs';

const require = createRequire(import.meta.url);
const contractValues = require('../shared/musicStructureContractValues.json');

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_CASES = 500;
const MAX_TAGS_PER_CASE = 16;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

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

function requireRate(value, label, { upperExclusive = false } = {}) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (upperExclusive ? value >= 1 : value > 1)
  ) {
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
  if (
    !Number.isFinite(value) ||
    value < contractValues.minBpm ||
    value > contractValues.maxBpm
  ) {
    throw new TypeError(`${label} is out of range`);
  }
}

function validateTags(tags, label) {
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > MAX_TAGS_PER_CASE
  ) {
    throw new TypeError(`${label} are invalid`);
  }
  const uniqueTags = new Set();
  for (const tag of tags) {
    requireComponent(tag, `${label} tag`);
    if (uniqueTags.has(tag)) throw new TypeError(`${label} must be unique`);
    uniqueTags.add(tag);
  }
}

function validateAcceptance(value) {
  assertExactKeys(
    value,
    [
      'minimumTracks',
      'requiredTags',
      'minimumDirectMatchRate',
      'minimumRequiredTagDirectMatchRate',
      'maximumTempoOctaveErrorRate',
      'maximumTempoUnrelatedErrorRate',
      'maximumTempoMissingRate',
      'maximumAnalysisFailureRate',
    ],
    'BPM benchmark acceptance',
  );
  requireBoundedInteger(value.minimumTracks, 1, MAX_CASES, 'minimum tracks');
  for (const key of [
    'minimumDirectMatchRate',
    'minimumRequiredTagDirectMatchRate',
    'maximumTempoOctaveErrorRate',
    'maximumTempoUnrelatedErrorRate',
    'maximumTempoMissingRate',
    'maximumAnalysisFailureRate',
  ]) {
    requireRate(value[key], key);
  }
  if (!Array.isArray(value.requiredTags)) {
    throw new TypeError('requiredTags must be an array');
  }
  const uniqueTags = new Set();
  for (const requirement of value.requiredTags) {
    assertExactKeys(requirement, ['tag', 'minimumTracks'], 'required tag');
    requireComponent(requirement.tag, 'required tag');
    requireBoundedInteger(
      requirement.minimumTracks,
      1,
      MAX_CASES,
      'required tag minimum tracks',
    );
    if (uniqueTags.has(requirement.tag)) {
      throw new TypeError('required tags must be unique');
    }
    uniqueTags.add(requirement.tag);
  }
}

function validateCorpusCase(value) {
  assertExactKeys(value, ['id', 'tags', 'referenceBpm'], 'BPM corpus case');
  requireComponent(value.id, 'case id');
  validateTags(value.tags, 'case tags');
  validateBpm(value.referenceBpm, 'reference BPM');
}

export function validateBpmCorpus(value) {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'benchmarkId',
      'tempoToleranceRatio',
      'acceptance',
      'cases',
    ],
    'BPM corpus',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported BPM corpus version');
  }
  requireComponent(value.benchmarkId, 'benchmark id');
  requireRate(value.tempoToleranceRatio, 'tempo tolerance ratio', {
    upperExclusive: true,
  });
  if (value.tempoToleranceRatio >= 0.5) {
    throw new TypeError('tempo tolerance ratio must be below 0.5');
  }
  validateAcceptance(value.acceptance);
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('BPM corpus cases are invalid');
  }
  const caseIds = new Set();
  for (const benchmarkCase of value.cases) {
    validateCorpusCase(benchmarkCase);
    if (caseIds.has(benchmarkCase.id)) {
      throw new TypeError('BPM corpus case ids must be unique');
    }
    caseIds.add(benchmarkCase.id);
  }
  return value;
}

export function fingerprintBpmCorpus(value) {
  const corpus = validateBpmCorpus(value);
  const identity = {
    schemaVersion: corpus.schemaVersion,
    benchmarkId: corpus.benchmarkId,
    tempoToleranceRatio: corpus.tempoToleranceRatio,
    cases: corpus.cases,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex');
}

function validateAnalyzer(value) {
  assertExactKeys(
    value,
    ['id', 'version', 'profileId', 'modelId'],
    'BPM prediction analyzer',
  );
  for (const [key, label] of [
    ['id', 'analyzer id'],
    ['version', 'analyzer version'],
    ['profileId', 'analyzer profile id'],
    ['modelId', 'analyzer model id'],
  ]) {
    requireComponent(value[key], label);
  }
}

function validateEstimate(value) {
  if (!isPlainObject(value)) throw new TypeError('estimate must be an object');
  if (value.status === 'failed') {
    assertExactKeys(value, ['status', 'errorCode'], 'failed estimate');
    requireComponent(value.errorCode, 'estimate error code');
    return;
  }
  if (value.status !== 'completed') {
    throw new TypeError('estimate status is invalid');
  }
  assertExactKeys(
    value,
    ['status', 'bpm', 'beatEvidenceConfidence'],
    'completed estimate',
  );
  validateBpm(value.bpm, 'estimated BPM', { nullable: true });
  if (value.beatEvidenceConfidence !== null) {
    requireRate(value.beatEvidenceConfidence, 'beat evidence confidence');
  }
}

function validatePredictionCase(value) {
  assertExactKeys(value, ['id', 'estimate'], 'BPM prediction case');
  requireComponent(value.id, 'prediction case id');
  validateEstimate(value.estimate);
}

export function validateBpmPredictions(value, rawCorpus) {
  const corpus = validateBpmCorpus(rawCorpus);
  assertExactKeys(
    value,
    ['schemaVersion', 'benchmarkId', 'corpusFingerprint', 'analyzer', 'cases'],
    'BPM predictions',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported BPM predictions version');
  }
  if (value.benchmarkId !== corpus.benchmarkId) {
    throw new TypeError('BPM prediction benchmark identity does not match');
  }
  if (
    !SHA256_RE.test(value.corpusFingerprint || '') ||
    value.corpusFingerprint !== fingerprintBpmCorpus(corpus)
  ) {
    throw new TypeError('BPM prediction corpus fingerprint does not match');
  }
  validateAnalyzer(value.analyzer);
  if (
    !Array.isArray(value.cases) ||
    value.cases.length !== corpus.cases.length
  ) {
    throw new TypeError('BPM prediction cases do not match the corpus');
  }
  const predictionIds = new Set();
  for (const prediction of value.cases) {
    validatePredictionCase(prediction);
    if (predictionIds.has(prediction.id)) {
      throw new TypeError('BPM prediction case ids must be unique');
    }
    predictionIds.add(prediction.id);
  }
  if (corpus.cases.some(({ id }) => !predictionIds.has(id))) {
    throw new TypeError('BPM prediction cases do not match the corpus');
  }
  return value;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / expected;
}

function scoreCase(corpusCase, prediction, toleranceRatio) {
  if (prediction.estimate.status === 'failed') {
    return {
      id: corpusCase.id,
      tags: corpusCase.tags,
      analysisStatus: 'failed',
      referenceBpm: corpusCase.referenceBpm,
      estimatedBpm: null,
      tempoRelation: 'missing',
      relativeError: null,
      beatEvidenceConfidence: null,
    };
  }
  const { bpm, beatEvidenceConfidence } = prediction.estimate;
  const tempoRelation =
    bpm === null
      ? 'missing'
      : classifyTempoRelation(corpusCase.referenceBpm, bpm, {
          toleranceRatio,
        });
  return {
    id: corpusCase.id,
    tags: corpusCase.tags,
    analysisStatus: 'completed',
    referenceBpm: corpusCase.referenceBpm,
    estimatedBpm: bpm,
    tempoRelation,
    relativeError:
      bpm === null ? null : round(relativeError(bpm, corpusCase.referenceBpm)),
    beatEvidenceConfidence,
  };
}

function mean(values) {
  return round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return round(
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
  );
}

function summarizeScores(scores) {
  const beatEvidence = scores
    .map((score) => score.beatEvidenceConfidence)
    .filter(Number.isFinite);
  return {
    trackCount: scores.length,
    directMatchRate: mean(
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
    tempoUnrelatedErrorRate: mean(
      scores.map((score) => Number(score.tempoRelation === 'unrelated')),
    ),
    tempoMissingRate: mean(
      scores.map((score) =>
        Number(
          score.analysisStatus === 'completed' &&
            score.tempoRelation === 'missing',
        ),
      ),
    ),
    analysisFailureRate: mean(
      scores.map((score) => Number(score.analysisStatus === 'failed')),
    ),
    medianDirectMatchRelativeError: median(
      scores
        .filter((score) => score.tempoRelation === 'match')
        .map((score) => score.relativeError),
    ),
    beatEvidence: {
      sampleCount: beatEvidence.length,
      meanConfidence: beatEvidence.length > 0 ? mean(beatEvidence) : null,
    },
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

export function evaluateBpmBenchmark(rawCorpus, rawPredictions) {
  const corpus = validateBpmCorpus(rawCorpus);
  const predictions = validateBpmPredictions(rawPredictions, corpus);
  const predictionsById = new Map(
    predictions.cases.map((prediction) => [prediction.id, prediction]),
  );
  const scores = corpus.cases.map((corpusCase) =>
    scoreCase(
      corpusCase,
      predictionsById.get(corpusCase.id),
      corpus.tempoToleranceRatio,
    ),
  );
  const summary = summarizeScores(scores);
  const groups = {};
  const tags = new Set(scores.flatMap((score) => score.tags));
  for (const tag of [...tags].sort()) {
    groups[tag] = summarizeScores(
      scores.filter((score) => score.tags.includes(tag)),
    );
  }

  const { acceptance } = corpus;
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
      'direct-match-rate',
      summary.directMatchRate,
      acceptance.minimumDirectMatchRate,
      'at-least',
    ),
    ...acceptance.requiredTags.map(({ tag }) =>
      createGate(
        `required-tag-direct-match-rate:${tag}`,
        groups[tag]?.directMatchRate ?? 0,
        acceptance.minimumRequiredTagDirectMatchRate,
        'at-least',
      ),
    ),
    createGate(
      'tempo-octave-error-rate',
      summary.tempoOctaveErrorRate,
      acceptance.maximumTempoOctaveErrorRate,
      'at-most',
    ),
    createGate(
      'tempo-unrelated-error-rate',
      summary.tempoUnrelatedErrorRate,
      acceptance.maximumTempoUnrelatedErrorRate,
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
    benchmarkId: corpus.benchmarkId,
    corpusFingerprint: predictions.corpusFingerprint,
    analyzer: predictions.analyzer,
    tempoToleranceRatio: corpus.tempoToleranceRatio,
    decision,
    summary,
    groups,
    gates,
    cases: scores,
  };
}

function loadBoundedJson(filePath, label) {
  const resolvedPath = path.resolve(filePath);
  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile() || stats.size > MAX_INPUT_BYTES) {
    throw new Error(`${label} exceeds the size limit`);
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function writeReport(filePath, report) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.renameSync(temporaryPath, resolvedPath);
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    } catch {
      // A failed cleanup cannot change the validated report decision.
    }
  }
}

function main() {
  const corpusPath = process.argv[2];
  const predictionsPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!corpusPath || !predictionsPath) {
    throw new Error(
      'usage: node scripts/music-analysis-bpm-evaluation.mjs <corpus.json> <predictions.json> [report.json]',
    );
  }
  if (
    outputPath &&
    [corpusPath, predictionsPath].some(
      (inputPath) => path.resolve(outputPath) === path.resolve(inputPath),
    )
  ) {
    throw new Error('BPM report must not overwrite its input');
  }
  const report = evaluateBpmBenchmark(
    loadBoundedJson(corpusPath, 'BPM corpus'),
    loadBoundedJson(predictionsPath, 'BPM predictions'),
  );
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
