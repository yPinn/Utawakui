import { createRequire } from 'node:module';
import {
  MAX_EDIT_DISTANCE_CELLS_PER_CASE,
  MAX_TOTAL_EDIT_DISTANCE_CELLS,
  assertComponent,
  assertExactKeys,
  isPlainObject,
  readingFromSegments,
  validateLyricsReadingBenchmark,
  validateSegments,
} from './contract.mjs';

const require = createRequire(import.meta.url);
const {
  resolveReadingCorrectionShadow,
} = require('../../../electron/lib/japaneseReading/corrections.js');

function levenshteinDistance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function roundMetric(value) {
  return Number(value.toFixed(6));
}

function validatePerformance(performanceValue) {
  if (performanceValue === undefined) return undefined;
  const fields = [
    'tokenizerLoadMs',
    'firstPassMs',
    'secondPassMs',
    'rssBeforeBytes',
    'rssAfterBytes',
    'maxRssBytes',
  ];
  assertExactKeys(
    performanceValue,
    [...fields, 'dependencyBytes'],
    fields,
    'lyrics reading performance',
  );
  for (const field of fields) {
    if (
      !Number.isFinite(performanceValue[field]) ||
      performanceValue[field] < 0
    ) {
      throw new TypeError(`lyrics reading performance ${field} is invalid`);
    }
  }
  if (performanceValue.dependencyBytes !== undefined) {
    assertExactKeys(
      performanceValue.dependencyBytes,
      ['kuromoji', 'wanakana'],
      ['kuromoji', 'wanakana'],
      'lyrics reading dependency bytes',
    );
    for (const value of Object.values(performanceValue.dependencyBytes)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('lyrics reading dependency size is invalid');
      }
    }
  }
  return performanceValue;
}

function summarizeCaseReports(caseReports) {
  const successful = caseReports.filter(({ status }) => status === 'ok');
  const addressable = caseReports.filter(({ analyzerAddressable }) =>
    Boolean(analyzerAddressable),
  );
  const expectedCharacterCount = successful.reduce(
    (total, result) => total + result.expectedCharacterCount,
    0,
  );
  const editDistance = successful.reduce(
    (total, result) => total + result.readingEditDistance,
    0,
  );
  const sum = (field) =>
    caseReports.reduce((total, result) => total + result[field], 0);
  const shadowMatchCount = sum('shadowMatchCount');
  const shadowFalsePositiveCount = sum('shadowFalsePositiveCount');

  return {
    caseCount: caseReports.length,
    analyzerAddressableCaseCount: addressable.length,
    exactReadingAccuracy: roundMetric(
      successful.filter(({ exactReading }) => exactReading).length /
        caseReports.length,
    ),
    analyzerAddressableExactReadingAccuracy: addressable.length
      ? roundMetric(
          addressable.filter(({ exactReading }) => exactReading === true)
            .length / addressable.length,
        )
      : null,
    rubySegmentAccuracy: roundMetric(
      successful.filter(({ exactSegments }) => exactSegments).length /
        caseReports.length,
    ),
    readingCharacterErrorRate: expectedCharacterCount
      ? roundMetric(editDistance / expectedCharacterCount)
      : null,
    canonicalIntegrityRate: successful.length
      ? roundMetric(
          successful.filter(({ canonicalIntegrity }) => canonicalIntegrity)
            .length / successful.length,
        )
      : null,
    analysisFailureRate: roundMetric(
      (caseReports.length - successful.length) / caseReports.length,
    ),
    totalOutOfVocabularyCount: sum('outOfVocabularyCount'),
    shadowMatchCount,
    shadowFalsePositiveCount,
    shadowMissCount: sum('shadowMissCount'),
    shadowPrecision: shadowMatchCount
      ? roundMetric(
          (shadowMatchCount - shadowFalsePositiveCount) / shadowMatchCount,
        )
      : shadowFalsePositiveCount === 0
        ? null
        : 0,
  };
}

function validateAnalyzer(benchmark, analyzer) {
  assertExactKeys(
    analyzer,
    ['id', 'version'],
    ['id', 'version'],
    'lyrics reading analyzer',
  );
  assertComponent(analyzer.id, 'lyrics reading analyzer id');
  assertComponent(analyzer.version, 'lyrics reading analyzer version');
  if (analyzer.id !== benchmark.baselineAnalyzerId) {
    throw new TypeError('lyrics reading baseline analyzer does not match');
  }
}

function indexObservations(benchmark, values) {
  if (!Array.isArray(values) || values.length !== benchmark.cases.length) {
    throw new TypeError('lyrics reading observations must cover every case');
  }
  const observations = new Map();
  for (const observation of values) {
    assertExactKeys(
      observation,
      [
        'caseId',
        'status',
        'durationMs',
        'line',
        'tokens',
        'errorCode',
        'shadowCorrectionIds',
      ],
      ['caseId', 'status', 'durationMs'],
      'lyrics reading observation',
    );
    assertComponent(observation.caseId, 'lyrics reading observation case id');
    if (observations.has(observation.caseId)) {
      throw new TypeError('lyrics reading observation ids must be unique');
    }
    if (!['ok', 'failed'].includes(observation.status)) {
      throw new TypeError('lyrics reading observation status is invalid');
    }
    if (
      !Number.isFinite(observation.durationMs) ||
      observation.durationMs < 0
    ) {
      throw new TypeError('lyrics reading observation duration is invalid');
    }
    observations.set(observation.caseId, observation);
  }
  return observations;
}

function getShadowMetrics(benchmark, benchmarkCase, observation) {
  const shadow = benchmark.shadowCorrectionPack
    ? resolveReadingCorrectionShadow(benchmark.shadowCorrectionPack, {
        recordingIdentity: benchmarkCase.recordingIdentity,
        lines: benchmarkCase.lines,
      })
    : { matches: [] };
  const shadowCorrectionIds =
    observation.shadowCorrectionIds ??
    shadow.matches.map(({ correctionId }) => correctionId);
  if (!Array.isArray(shadowCorrectionIds) || shadowCorrectionIds.length > 32) {
    throw new TypeError('shadow correction ids are invalid');
  }
  for (const correctionId of shadowCorrectionIds) {
    assertComponent(correctionId, 'shadow correction id');
  }
  const expectedIds = new Set(benchmarkCase.expectedShadowCorrectionIds);
  const actualIds = new Set(shadowCorrectionIds);
  return {
    shadowMatchCount: actualIds.size,
    shadowFalsePositiveCount: [...actualIds].filter(
      (id) => !expectedIds.has(id),
    ).length,
    shadowMissCount: [...expectedIds].filter((id) => !actualIds.has(id)).length,
  };
}

function buildSuccessfulCaseReport(benchmarkCase, observation, shared, budget) {
  if (!isPlainObject(observation.line)) {
    throw new TypeError(
      'successful lyrics reading observation line is invalid',
    );
  }
  if (typeof observation.line.text !== 'string') {
    throw new TypeError('lyrics reading observation text is invalid');
  }
  validateSegments(
    observation.line.segments,
    observation.line.text,
    'observed reading',
  );
  if (!Array.isArray(observation.tokens)) {
    throw new TypeError('lyrics reading observation tokens are invalid');
  }
  const predictedKana = readingFromSegments(observation.line.segments);
  const editDistanceCells =
    (Array.from(predictedKana).length + 1) *
    (Array.from(benchmarkCase.expectedKana).length + 1);
  budget.cells += editDistanceCells;
  if (
    editDistanceCells > MAX_EDIT_DISTANCE_CELLS_PER_CASE ||
    budget.cells > MAX_TOTAL_EDIT_DISTANCE_CELLS
  ) {
    throw new TypeError('lyrics reading edit-distance workload exceeds limit');
  }
  const expectedText = benchmarkCase.lines[benchmarkCase.targetLineIndex];
  return {
    ...shared,
    predictedKana,
    exactReading: predictedKana === benchmarkCase.expectedKana,
    exactSegments:
      JSON.stringify(observation.line.segments) ===
      JSON.stringify(benchmarkCase.expectedSegments),
    canonicalIntegrity:
      observation.line.text === expectedText &&
      observation.line.segments.map(({ t }) => t).join('') === expectedText,
    readingEditDistance: levenshteinDistance(
      predictedKana,
      benchmarkCase.expectedKana,
    ),
    expectedCharacterCount: Array.from(benchmarkCase.expectedKana).length,
    outOfVocabularyCount: observation.tokens.filter(
      ({ outOfVocabulary }) => outOfVocabulary === true,
    ).length,
  };
}

function buildCaseReport(benchmark, benchmarkCase, observation, budget) {
  const shared = {
    id: benchmarkCase.id,
    cohort: benchmarkCase.cohort,
    analyzerAddressable: benchmarkCase.analyzerAddressable,
    status: observation.status,
    durationMs: roundMetric(observation.durationMs),
    ...getShadowMetrics(benchmark, benchmarkCase, observation),
  };
  if (observation.status === 'ok') {
    return buildSuccessfulCaseReport(
      benchmarkCase,
      observation,
      shared,
      budget,
    );
  }
  assertComponent(observation.errorCode, 'lyrics reading error code');
  return {
    ...shared,
    errorCode: observation.errorCode,
    exactReading: null,
    exactSegments: null,
    canonicalIntegrity: null,
    readingEditDistance: 0,
    expectedCharacterCount: 0,
    outOfVocabularyCount: 0,
  };
}

function buildGates(summary, acceptance) {
  return [
    {
      id: 'canonical-integrity',
      actual: summary.canonicalIntegrityRate,
      required: acceptance.minimumCanonicalIntegrityRate,
      passed:
        summary.canonicalIntegrityRate !== null &&
        summary.canonicalIntegrityRate >=
          acceptance.minimumCanonicalIntegrityRate,
    },
    {
      id: 'analysis-failure-rate',
      actual: summary.analysisFailureRate,
      required: acceptance.maximumAnalysisFailureRate,
      passed:
        summary.analysisFailureRate <= acceptance.maximumAnalysisFailureRate,
    },
    {
      id: 'shadow-false-positives',
      actual: summary.shadowFalsePositiveCount,
      required: acceptance.maximumShadowFalsePositiveCount,
      passed:
        summary.shadowFalsePositiveCount <=
        acceptance.maximumShadowFalsePositiveCount,
    },
  ];
}

export function scoreLyricsReadingBenchmark(benchmark, input) {
  validateLyricsReadingBenchmark(benchmark);
  assertExactKeys(
    input,
    ['analyzer', 'observations', 'performance'],
    ['analyzer', 'observations'],
    'lyrics reading benchmark result input',
  );
  validateAnalyzer(benchmark, input.analyzer);
  const performanceValue = validatePerformance(input.performance);
  const observations = indexObservations(benchmark, input.observations);
  const budget = { cells: 0 };
  const caseReports = benchmark.cases.map((benchmarkCase) => {
    const observation = observations.get(benchmarkCase.id);
    if (!observation) {
      throw new TypeError(`missing observation for case: ${benchmarkCase.id}`);
    }
    return buildCaseReport(benchmark, benchmarkCase, observation, budget);
  });
  const summary = summarizeCaseReports(caseReports);
  const groups = Object.fromEntries(
    benchmark.acceptance.requiredCohorts.map((cohort) => [
      cohort,
      summarizeCaseReports(
        caseReports.filter((result) => result.cohort === cohort),
      ),
    ]),
  );
  const gates = buildGates(summary, benchmark.acceptance);
  return {
    schemaVersion: 1,
    benchmarkId: benchmark.benchmarkId,
    decision: gates.every(({ passed }) => passed)
      ? 'baseline-ready'
      : 'invalid-baseline',
    analyzer: input.analyzer,
    summary,
    groups,
    gates,
    cases: caseReports,
    ...(performanceValue ? { performance: performanceValue } : {}),
  };
}
