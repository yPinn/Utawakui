import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  katakanaToHiragana,
} = require('../../../electron/lib/lyricsReading.js');
const {
  validateReadingCorrectionPack,
} = require('../../../electron/lib/japaneseReading/corrections.js');

const MAX_CASES = 500;
const MAX_LINES_PER_CASE = 100;
const MAX_LINE_LENGTH = 10_000;
const MAX_TOTAL_TEXT_CHARACTERS = 250_000;
const MAX_COMPONENT_LENGTH = 128;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const FORBIDDEN_COMPONENTS = new Set(['__proto__', 'constructor', 'prototype']);

export const MAX_EDIT_DISTANCE_CELLS_PER_CASE = 1_000_000;
export const MAX_TOTAL_EDIT_DISTANCE_CELLS = 20_000_000;

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertExactKeys(value, allowed, required, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError(`${label} has invalid fields`);
  }
  if (required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} is missing required fields`);
  }
}

export function assertComponent(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_COMPONENT_LENGTH ||
    !COMPONENT_RE.test(value) ||
    FORBIDDEN_COMPONENTS.has(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertRate(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
}

export function readingFromSegments(segments) {
  return katakanaToHiragana(
    segments.map((segment) => segment.r ?? segment.t).join(''),
  );
}

export function validateSegments(segments, expectedText, label) {
  if (
    !Array.isArray(segments) ||
    segments.length > MAX_LINE_LENGTH ||
    segments.some((segment) => {
      if (!isPlainObject(segment)) return true;
      const keys = Object.keys(segment);
      if (
        keys.some((key) => !['t', 'r'].includes(key)) ||
        !Object.hasOwn(segment, 't') ||
        typeof segment.t !== 'string' ||
        segment.t.length > MAX_LINE_LENGTH
      ) {
        return true;
      }
      return (
        Object.hasOwn(segment, 'r') &&
        (typeof segment.r !== 'string' || segment.r.length > MAX_LINE_LENGTH)
      );
    })
  ) {
    throw new TypeError(`${label} segments are invalid`);
  }
  if (segments.map((segment) => segment.t).join('') !== expectedText) {
    throw new TypeError(`${label} segments do not preserve canonical text`);
  }
}

function validateAcceptance(acceptance) {
  assertExactKeys(
    acceptance,
    [
      'minimumCases',
      'requiredCohorts',
      'minimumCanonicalIntegrityRate',
      'maximumAnalysisFailureRate',
      'maximumShadowFalsePositiveCount',
    ],
    [
      'minimumCases',
      'requiredCohorts',
      'minimumCanonicalIntegrityRate',
      'maximumAnalysisFailureRate',
      'maximumShadowFalsePositiveCount',
    ],
    'lyrics reading acceptance',
  );
  if (
    !Number.isSafeInteger(acceptance.minimumCases) ||
    acceptance.minimumCases < 1 ||
    acceptance.minimumCases > MAX_CASES
  ) {
    throw new TypeError('minimum benchmark cases are invalid');
  }
  assertRate(
    acceptance.minimumCanonicalIntegrityRate,
    'minimum canonical integrity rate',
  );
  assertRate(
    acceptance.maximumAnalysisFailureRate,
    'maximum analysis failure rate',
  );
  if (
    !Number.isSafeInteger(acceptance.maximumShadowFalsePositiveCount) ||
    acceptance.maximumShadowFalsePositiveCount < 0
  ) {
    throw new TypeError('maximum shadow false-positive count is invalid');
  }
  if (
    !Array.isArray(acceptance.requiredCohorts) ||
    acceptance.requiredCohorts.length === 0 ||
    acceptance.requiredCohorts.length > 32
  ) {
    throw new TypeError('required cohorts are invalid');
  }
  const requiredCohorts = new Set();
  for (const cohort of acceptance.requiredCohorts) {
    assertComponent(cohort, 'required cohort');
    if (requiredCohorts.has(cohort)) {
      throw new TypeError('required cohorts must be unique');
    }
    requiredCohorts.add(cohort);
  }
  return requiredCohorts;
}

function validateCaseLines(benchmarkCase) {
  if (
    !Array.isArray(benchmarkCase.lines) ||
    benchmarkCase.lines.length === 0 ||
    benchmarkCase.lines.length > MAX_LINES_PER_CASE ||
    benchmarkCase.lines.some(
      (line) =>
        typeof line !== 'string' ||
        line.length === 0 ||
        line.length > MAX_LINE_LENGTH,
    )
  ) {
    throw new TypeError('lyrics reading case lines are invalid');
  }
  if (
    !Number.isSafeInteger(benchmarkCase.targetLineIndex) ||
    benchmarkCase.targetLineIndex < 0 ||
    benchmarkCase.targetLineIndex >= benchmarkCase.lines.length
  ) {
    throw new TypeError('lyrics reading target line index is invalid');
  }
  return benchmarkCase.lines.reduce((total, line) => total + line.length, 0);
}

function validateExpectedReading(benchmarkCase) {
  if (
    typeof benchmarkCase.expectedKana !== 'string' ||
    benchmarkCase.expectedKana.length === 0 ||
    benchmarkCase.expectedKana.length > MAX_LINE_LENGTH
  ) {
    throw new TypeError('expected reading kana is invalid');
  }
  const targetText = benchmarkCase.lines[benchmarkCase.targetLineIndex];
  validateSegments(
    benchmarkCase.expectedSegments,
    targetText,
    'expected reading',
  );
  if (
    readingFromSegments(benchmarkCase.expectedSegments) !==
    benchmarkCase.expectedKana
  ) {
    throw new TypeError('expected reading kana does not match segments');
  }
}

function validateExpectedShadowIds(expectedIds) {
  if (!Array.isArray(expectedIds) || expectedIds.length > 32) {
    throw new TypeError('expected shadow correction ids are invalid');
  }
  const uniqueIds = new Set();
  for (const correctionId of expectedIds) {
    assertComponent(correctionId, 'expected shadow correction id');
    if (uniqueIds.has(correctionId)) {
      throw new TypeError('expected shadow correction ids must be unique');
    }
    uniqueIds.add(correctionId);
  }
}

function validateBenchmarkCase(benchmarkCase, caseIds, observedCohorts) {
  const fields = [
    'id',
    'cohort',
    'analyzerAddressable',
    'recordingIdentity',
    'lines',
    'targetLineIndex',
    'expectedKana',
    'expectedSegments',
    'expectedShadowCorrectionIds',
  ];
  assertExactKeys(
    benchmarkCase,
    fields,
    fields,
    'lyrics reading benchmark case',
  );
  assertComponent(benchmarkCase.id, 'lyrics reading case id');
  assertComponent(benchmarkCase.cohort, 'lyrics reading cohort');
  assertComponent(
    benchmarkCase.recordingIdentity,
    'lyrics reading recording identity',
  );
  if (caseIds.has(benchmarkCase.id)) {
    throw new TypeError('lyrics reading case ids must be unique');
  }
  caseIds.add(benchmarkCase.id);
  observedCohorts.add(benchmarkCase.cohort);
  if (typeof benchmarkCase.analyzerAddressable !== 'boolean') {
    throw new TypeError('analyzer-addressable flag is invalid');
  }
  const textCharacters = validateCaseLines(benchmarkCase);
  validateExpectedReading(benchmarkCase);
  validateExpectedShadowIds(benchmarkCase.expectedShadowCorrectionIds);
  return textCharacters;
}

export function validateLyricsReadingBenchmark(benchmark) {
  assertExactKeys(
    benchmark,
    [
      'schemaVersion',
      'benchmarkId',
      'baselineAnalyzerId',
      'acceptance',
      'shadowCorrectionPack',
      'cases',
    ],
    [
      'schemaVersion',
      'benchmarkId',
      'baselineAnalyzerId',
      'acceptance',
      'cases',
    ],
    'lyrics reading benchmark',
  );
  if (benchmark.schemaVersion !== 1) {
    throw new TypeError('unsupported lyrics reading benchmark schema');
  }
  assertComponent(benchmark.benchmarkId, 'lyrics reading benchmark id');
  assertComponent(benchmark.baselineAnalyzerId, 'baseline analyzer id');
  const requiredCohorts = validateAcceptance(benchmark.acceptance);
  if (benchmark.shadowCorrectionPack !== undefined) {
    validateReadingCorrectionPack(benchmark.shadowCorrectionPack);
  }
  if (
    !Array.isArray(benchmark.cases) ||
    benchmark.cases.length === 0 ||
    benchmark.cases.length > MAX_CASES
  ) {
    throw new TypeError('lyrics reading benchmark cases are invalid');
  }

  const caseIds = new Set();
  const observedCohorts = new Set();
  let totalTextCharacters = 0;
  for (const benchmarkCase of benchmark.cases) {
    totalTextCharacters += validateBenchmarkCase(
      benchmarkCase,
      caseIds,
      observedCohorts,
    );
    if (totalTextCharacters > MAX_TOTAL_TEXT_CHARACTERS) {
      throw new TypeError('lyrics reading benchmark text exceeds the limit');
    }
  }
  if (benchmark.cases.length < benchmark.acceptance.minimumCases) {
    throw new TypeError('benchmark does not meet the minimum case count');
  }
  for (const cohort of requiredCohorts) {
    if (!observedCohorts.has(cohort)) {
      throw new TypeError(`benchmark is missing required cohort: ${cohort}`);
    }
  }
  return benchmark;
}
