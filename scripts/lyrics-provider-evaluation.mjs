import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_BENCHMARK_BYTES = 8 * 1024 * 1024;
const MAX_CASES = 500;
const MAX_PROVIDERS = 8;
const MAX_REQUIRED_TAGS = 32;
const MAX_DISTINCT_TAGS = 64;
const MAX_TEXT_LENGTH = 256;
const MAX_TAGS_PER_CASE = 16;
const MAX_REQUEST_DURATION_MS = 120_000;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const REQUEST_STATUSES = new Set(['ok', 'failed']);
const CATALOG_STATUSES = new Set(['match', 'miss', 'not-evaluated']);
const MATCH_BANDS = new Set(['exact', 'strong', 'related']);
const REVIEW_VERDICTS = new Set(['correct', 'incorrect', 'unreviewed']);
const CAPABILITIES = new Set(['T0', 'T1', 'T2', 'partial-T2']);
const ACCESS_MODES = new Set([
  'none',
  'automatic-token',
  'manual-cookie',
  'account',
]);
const TOKEN_REFRESH_STATES = new Set([
  'not-required',
  'verified',
  'unverified',
  'failed',
]);
const TIMING_VALIDATIONS = new Set([
  'valid',
  'partial',
  'invalid',
  'not-applicable',
]);

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
  if (
    !COMPONENT_RE.test(value || '') ||
    value === '.' ||
    value === '..' ||
    RESERVED_OBJECT_KEYS.has(value.toLowerCase())
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function containsControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function requireNullableText(value, label, { required = false } = {}) {
  if (value === null && !required) return;
  if (
    typeof value !== 'string' ||
    (required && value.trim().length === 0) ||
    value.length > MAX_TEXT_LENGTH ||
    containsControlCharacter(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function requireBoundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} is out of range`);
  }
}

function requireRate(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
}

function requireNullableEnum(value, allowed, label) {
  if (value !== null && !allowed.has(value)) {
    throw new TypeError(`${label} is invalid`);
  }
}

export function normalizeProbeOutcome(value) {
  assertExactKeys(
    value,
    [
      'providerId',
      'request',
      'catalogStatus',
      'matchBand',
      'reviewVerdict',
      'capability',
      'timingValidation',
    ],
    'provider observation',
  );
  requireComponent(value.providerId, 'provider id');
  assertExactKeys(
    value.request,
    ['status', 'durationMs', 'failureCode'],
    'provider request',
  );
  if (!REQUEST_STATUSES.has(value.request.status)) {
    throw new TypeError('provider request status is invalid');
  }
  requireBoundedInteger(
    value.request.durationMs,
    0,
    MAX_REQUEST_DURATION_MS,
    'provider request duration',
  );
  requireNullableEnum(
    value.request.failureCode,
    value.request.failureCode === null
      ? new Set()
      : new Set([value.request.failureCode]),
    'provider request failure code',
  );
  if (value.request.failureCode !== null) {
    requireComponent(
      value.request.failureCode,
      'provider request failure code',
    );
  }
  if (!CATALOG_STATUSES.has(value.catalogStatus)) {
    throw new TypeError('provider catalog status is invalid');
  }
  requireNullableEnum(value.matchBand, MATCH_BANDS, 'provider match band');
  requireNullableEnum(
    value.reviewVerdict,
    REVIEW_VERDICTS,
    'provider review verdict',
  );
  requireNullableEnum(value.capability, CAPABILITIES, 'provider capability');
  if (!TIMING_VALIDATIONS.has(value.timingValidation)) {
    throw new TypeError('provider timing validation is invalid');
  }

  const resultFields = [value.matchBand, value.reviewVerdict, value.capability];
  if (value.request.status === 'failed') {
    if (
      value.request.failureCode === null ||
      value.catalogStatus !== 'not-evaluated' ||
      resultFields.some((field) => field !== null) ||
      value.timingValidation !== 'not-applicable'
    ) {
      throw new TypeError('failed request cannot contain provider result data');
    }
  } else {
    if (value.request.failureCode !== null) {
      throw new TypeError('successful request cannot contain a failure code');
    }
    if (value.catalogStatus === 'not-evaluated') {
      throw new TypeError('successful request must evaluate the catalog');
    }
  }

  if (value.catalogStatus === 'miss') {
    if (
      resultFields.some((field) => field !== null) ||
      value.timingValidation !== 'not-applicable'
    ) {
      throw new TypeError('catalog miss cannot contain match result data');
    }
  }
  if (
    value.catalogStatus === 'match' &&
    resultFields.some((field) => field === null)
  ) {
    throw new TypeError('catalog match must contain reviewed result data');
  }

  if (
    value.capability === 'T2' &&
    !new Set(['valid', 'invalid']).has(value.timingValidation)
  ) {
    throw new TypeError('T2 timing validation must be valid or invalid');
  }
  if (
    value.capability === 'partial-T2' &&
    value.timingValidation !== 'partial'
  ) {
    throw new TypeError('partial T2 timing validation must remain partial');
  }
  if (
    new Set(['T0', 'T1']).has(value.capability) &&
    value.timingValidation !== 'not-applicable'
  ) {
    throw new TypeError('T0/T1 timing validation must be not-applicable');
  }
  return structuredClone(value);
}

function validateProvider(value) {
  assertExactKeys(
    value,
    ['id', 'mode', 'profileId', 'accessMode', 'tokenRefresh', 'boundedPayload'],
    'benchmark provider',
  );
  requireComponent(value.id, 'benchmark provider id');
  if (!new Set(['baseline', 'candidate']).has(value.mode)) {
    throw new TypeError('benchmark provider mode is invalid');
  }
  requireComponent(value.profileId, 'benchmark provider profile id');
  if (!ACCESS_MODES.has(value.accessMode)) {
    throw new TypeError('benchmark provider access mode is invalid');
  }
  if (!TOKEN_REFRESH_STATES.has(value.tokenRefresh)) {
    throw new TypeError('benchmark provider token refresh state is invalid');
  }
  if (typeof value.boundedPayload !== 'boolean') {
    throw new TypeError('benchmark provider payload bound is invalid');
  }
}

function validateAcceptance(value) {
  assertExactKeys(
    value,
    [
      'minimumCases',
      'requiredTags',
      'minimumReviewedMatches',
      'minimumRequestSuccessRate',
      'maximumFalseMatchRate',
      'minimumIncrementalCoverageRate',
      'minimumUniqueValidT2Count',
    ],
    'benchmark acceptance',
  );
  requireBoundedInteger(value.minimumCases, 1, MAX_CASES, 'minimum cases');
  requireBoundedInteger(
    value.minimumReviewedMatches,
    1,
    MAX_CASES,
    'minimum reviewed matches',
  );
  requireBoundedInteger(
    value.minimumUniqueValidT2Count,
    0,
    MAX_CASES,
    'minimum unique valid T2 count',
  );
  requireRate(value.minimumRequestSuccessRate, 'minimum request success rate');
  requireRate(value.maximumFalseMatchRate, 'maximum false match rate');
  requireRate(
    value.minimumIncrementalCoverageRate,
    'minimum incremental coverage rate',
  );
  if (!Array.isArray(value.requiredTags)) {
    throw new TypeError('required tags must be an array');
  }
  if (value.requiredTags.length > MAX_REQUIRED_TAGS) {
    throw new TypeError('required tags are invalid');
  }
  const tags = new Set();
  for (const requirement of value.requiredTags) {
    assertExactKeys(requirement, ['tag', 'minimumCases'], 'required tag');
    requireComponent(requirement.tag, 'required tag');
    requireBoundedInteger(
      requirement.minimumCases,
      1,
      MAX_CASES,
      'required tag minimum cases',
    );
    if (tags.has(requirement.tag)) {
      throw new TypeError('required tags must be unique');
    }
    tags.add(requirement.tag);
  }
}

function validateReference(value) {
  assertExactKeys(
    value,
    ['title', 'artist', 'album', 'durationSeconds', 'version'],
    'benchmark reference',
  );
  requireNullableText(value.title, 'reference title', { required: true });
  requireNullableText(value.artist, 'reference artist', { required: true });
  requireNullableText(value.album, 'reference album');
  if (
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds <= 0 ||
    value.durationSeconds > 86_400
  ) {
    throw new TypeError('reference duration is invalid');
  }
  requireComponent(value.version, 'reference version');
}

function validateCase(value, providerIds) {
  assertExactKeys(
    value,
    ['id', 'tags', 'reference', 'observations'],
    'benchmark case',
  );
  requireComponent(value.id, 'benchmark case id');
  if (
    !Array.isArray(value.tags) ||
    value.tags.length === 0 ||
    value.tags.length > MAX_TAGS_PER_CASE
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
  validateReference(value.reference);
  if (!Array.isArray(value.observations)) {
    throw new TypeError('benchmark observations must be an array');
  }
  const observedProviders = new Set();
  for (const observation of value.observations) {
    normalizeProbeOutcome(observation);
    if (!providerIds.has(observation.providerId)) {
      throw new TypeError(
        'provider observation references an unknown provider',
      );
    }
    if (observedProviders.has(observation.providerId)) {
      throw new TypeError('duplicate provider observation');
    }
    observedProviders.add(observation.providerId);
  }
  if (observedProviders.size !== providerIds.size) {
    throw new TypeError(
      'benchmark case must contain one observation per provider',
    );
  }
}

export function validateLyricsProviderBenchmark(value) {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'benchmarkId',
      'baselineProviderId',
      'providers',
      'acceptance',
      'cases',
    ],
    'lyrics provider benchmark',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported lyrics provider benchmark version');
  }
  requireComponent(value.benchmarkId, 'benchmark id');
  requireComponent(value.baselineProviderId, 'baseline provider id');
  if (
    !Array.isArray(value.providers) ||
    value.providers.length < 2 ||
    value.providers.length > MAX_PROVIDERS
  ) {
    throw new TypeError('benchmark providers are invalid');
  }
  const providerIds = new Set();
  let baselineCount = 0;
  for (const provider of value.providers) {
    validateProvider(provider);
    if (providerIds.has(provider.id)) {
      throw new TypeError('benchmark provider ids must be unique');
    }
    providerIds.add(provider.id);
    if (provider.mode === 'baseline') baselineCount += 1;
  }
  if (
    baselineCount !== 1 ||
    !value.providers.some(
      (provider) =>
        provider.id === value.baselineProviderId &&
        provider.mode === 'baseline',
    )
  ) {
    throw new TypeError(
      'benchmark must identify exactly one baseline provider',
    );
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
  const distinctTags = new Set();
  for (const benchmarkCase of value.cases) {
    validateCase(benchmarkCase, providerIds);
    if (caseIds.has(benchmarkCase.id)) {
      throw new TypeError('benchmark case ids must be unique');
    }
    caseIds.add(benchmarkCase.id);
    for (const tag of benchmarkCase.tags) distinctTags.add(tag);
    if (distinctTags.size > MAX_DISTINCT_TAGS) {
      throw new TypeError('benchmark distinct tags are invalid');
    }
  }
  return value;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function isCorrectMatch(outcome) {
  return (
    outcome?.request.status === 'ok' &&
    outcome.catalogStatus === 'match' &&
    outcome.reviewVerdict === 'correct'
  );
}

function isValidT2(outcome) {
  return (
    isCorrectMatch(outcome) &&
    outcome.capability === 'T2' &&
    outcome.timingValidation === 'valid'
  );
}

function isEligibleMatchBand(outcome) {
  return new Set(['exact', 'strong']).has(outcome?.matchBand);
}

function createGate(id, actual, required, comparison) {
  return {
    id,
    actual,
    required,
    comparison,
    passed:
      actual !== null &&
      (comparison === 'at-least' ? actual >= required : actual <= required),
  };
}

function createBooleanGate(id, actual, required, passed) {
  return { id, actual, required, comparison: 'satisfies', passed };
}

function summarizeMatchBand(reviewed, matchBand) {
  const matches = reviewed.filter(
    ({ outcome }) => outcome.matchBand === matchBand,
  );
  const correct = matches.filter(
    ({ outcome }) => outcome.reviewVerdict === 'correct',
  );
  const incorrect = matches.filter(
    ({ outcome }) => outcome.reviewVerdict === 'incorrect',
  );
  return {
    reviewedMatchCount: matches.length,
    correctMatchCount: correct.length,
    incorrectMatchCount: incorrect.length,
    falseMatchRate:
      matches.length === 0 ? null : rate(incorrect.length, matches.length),
  };
}

function summarizeProvider(
  benchmark,
  providerId,
  baselineByCase,
  observationsByCase,
) {
  const observations = benchmark.cases.map((benchmarkCase) => ({
    benchmarkCase,
    outcome: observationsByCase.get(benchmarkCase.id)?.get(providerId) || null,
  }));
  const present = observations.filter(({ outcome }) => outcome !== null);
  const successes = present.filter(
    ({ outcome }) => outcome.request.status === 'ok',
  );
  const failures = present.filter(
    ({ outcome }) => outcome.request.status === 'failed',
  );
  const misses = successes.filter(
    ({ outcome }) => outcome.catalogStatus === 'miss',
  );
  const reviewed = successes.filter(
    ({ outcome }) =>
      outcome.catalogStatus === 'match' &&
      new Set(['correct', 'incorrect']).has(outcome.reviewVerdict),
  );
  const correct = reviewed.filter(
    ({ outcome }) => outcome.reviewVerdict === 'correct',
  );
  const incorrect = reviewed.filter(
    ({ outcome }) => outcome.reviewVerdict === 'incorrect',
  );
  const eligibleReviewed = reviewed.filter(({ outcome }) =>
    isEligibleMatchBand(outcome),
  );
  const eligibleCorrect = eligibleReviewed.filter(
    ({ outcome }) => outcome.reviewVerdict === 'correct',
  );
  const eligibleIncorrect = eligibleReviewed.filter(
    ({ outcome }) => outcome.reviewVerdict === 'incorrect',
  );
  const incremental = correct.filter(
    ({ benchmarkCase }) =>
      !isCorrectMatch(baselineByCase.get(benchmarkCase.id)),
  );
  const uniqueValidT2 = correct.filter(
    ({ benchmarkCase, outcome }) =>
      isValidT2(outcome) && !isValidT2(baselineByCase.get(benchmarkCase.id)),
  );
  const eligibleIncremental = eligibleCorrect.filter(
    ({ benchmarkCase }) =>
      !isCorrectMatch(baselineByCase.get(benchmarkCase.id)),
  );
  const eligibleUniqueValidT2 = eligibleCorrect.filter(
    ({ benchmarkCase, outcome }) =>
      isValidT2(outcome) && !isValidT2(baselineByCase.get(benchmarkCase.id)),
  );
  const invalidT2 = present.filter(
    ({ outcome }) =>
      outcome.capability === 'T2' && outcome.timingValidation === 'invalid',
  );
  const rateLimited = failures.filter(
    ({ outcome }) => outcome.request.failureCode === 'rate-limited',
  );
  const durations = present.map(({ outcome }) => outcome.request.durationMs);
  return {
    caseCount: benchmark.cases.length,
    observedCaseCount: present.length,
    requestSuccessRate: rate(successes.length, present.length),
    requestFailureCount: failures.length,
    catalogMissCount: misses.length,
    reviewedMatchCount: reviewed.length,
    correctMatchCount: correct.length,
    incorrectMatchCount: incorrect.length,
    falseMatchRate:
      reviewed.length === 0 ? null : rate(incorrect.length, reviewed.length),
    coverageRate: rate(correct.length, benchmark.cases.length),
    eligibleReviewedMatchCount: eligibleReviewed.length,
    eligibleCorrectMatchCount: eligibleCorrect.length,
    eligibleIncorrectMatchCount: eligibleIncorrect.length,
    eligibleFalseMatchRate:
      eligibleReviewed.length === 0
        ? null
        : rate(eligibleIncorrect.length, eligibleReviewed.length),
    incrementalCoverageCount: incremental.length,
    incrementalCoverageRate: rate(incremental.length, benchmark.cases.length),
    uniqueValidT2Count: uniqueValidT2.length,
    eligibleIncrementalCoverageCount: eligibleIncremental.length,
    eligibleIncrementalCoverageRate: rate(
      eligibleIncremental.length,
      benchmark.cases.length,
    ),
    eligibleUniqueValidT2Count: eligibleUniqueValidT2.length,
    invalidT2Count: invalidT2.length,
    p50LatencyMs: percentile(durations, 0.5),
    p95LatencyMs: percentile(durations, 0.95),
    rateLimitedRate: rate(rateLimited.length, present.length),
    matchBands: Object.fromEntries(
      [...MATCH_BANDS].map((matchBand) => [
        matchBand,
        summarizeMatchBand(reviewed, matchBand),
      ]),
    ),
  };
}

function evaluateCandidate(summary, acceptance, provider) {
  const dataGates = [
    createGate(
      'reviewed-match-count',
      summary.eligibleReviewedMatchCount,
      acceptance.minimumReviewedMatches,
      'at-least',
    ),
  ];
  const qualityGates = [
    createGate(
      'request-success-rate',
      summary.requestSuccessRate,
      acceptance.minimumRequestSuccessRate,
      'at-least',
    ),
    createGate(
      'false-match-rate',
      summary.eligibleFalseMatchRate,
      acceptance.maximumFalseMatchRate,
      'at-most',
    ),
    createBooleanGate(
      'access-mode',
      provider.accessMode,
      'none-or-automatic-token',
      new Set(['none', 'automatic-token']).has(provider.accessMode),
    ),
    createBooleanGate(
      'token-refresh',
      provider.tokenRefresh,
      provider.accessMode === 'none' ? 'not-required' : 'verified',
      provider.accessMode === 'none'
        ? provider.tokenRefresh === 'not-required'
        : provider.tokenRefresh === 'verified',
    ),
    createBooleanGate(
      'bounded-payload',
      provider.boundedPayload,
      true,
      provider.boundedPayload === true,
    ),
  ];
  const incrementalRateGate = createGate(
    'incremental-coverage-rate',
    summary.eligibleIncrementalCoverageRate,
    acceptance.minimumIncrementalCoverageRate,
    'at-least',
  );
  const uniqueT2Gate = createGate(
    'unique-valid-t2-count',
    summary.eligibleUniqueValidT2Count,
    acceptance.minimumUniqueValidT2Count,
    'at-least',
  );
  const valueGate = {
    id: 'incremental-value',
    actual: {
      incrementalCoverageRate: summary.eligibleIncrementalCoverageRate,
      uniqueValidT2Count: summary.eligibleUniqueValidT2Count,
    },
    required: {
      minimumIncrementalCoverageRate: acceptance.minimumIncrementalCoverageRate,
      minimumUniqueValidT2Count: acceptance.minimumUniqueValidT2Count,
    },
    comparison: 'either-at-least',
    passed: incrementalRateGate.passed || uniqueT2Gate.passed,
  };
  const gates = [...dataGates, ...qualityGates, valueGate];
  return {
    decision: dataGates.some((gate) => !gate.passed)
      ? 'insufficient-data'
      : [...qualityGates, valueGate].every((gate) => gate.passed)
        ? 'advance-to-sentinel'
        : 'no-go',
    gates,
  };
}

export function evaluateLyricsProviderBenchmark(value) {
  const benchmark = validateLyricsProviderBenchmark(value);
  const tagCounts = {};
  for (const benchmarkCase of benchmark.cases) {
    for (const tag of benchmarkCase.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const corpusGates = [
    createGate(
      'minimum-cases',
      benchmark.cases.length,
      benchmark.acceptance.minimumCases,
      'at-least',
    ),
    ...benchmark.acceptance.requiredTags.map(({ tag, minimumCases }) =>
      createGate(
        `required-tag:${tag}`,
        tagCounts[tag] || 0,
        minimumCases,
        'at-least',
      ),
    ),
  ];
  const observationsByCase = new Map(
    benchmark.cases.map((benchmarkCase) => [
      benchmarkCase.id,
      new Map(
        benchmarkCase.observations.map((observation) => [
          observation.providerId,
          observation,
        ]),
      ),
    ]),
  );
  const baselineByCase = new Map(
    benchmark.cases.map((benchmarkCase) => [
      benchmarkCase.id,
      observationsByCase
        .get(benchmarkCase.id)
        ?.get(benchmark.baselineProviderId) || null,
    ]),
  );
  const providers = {};
  for (const provider of benchmark.providers) {
    const summary = summarizeProvider(
      benchmark,
      provider.id,
      baselineByCase,
      observationsByCase,
    );
    const groups = {};
    for (const tag of Object.keys(tagCounts).sort()) {
      groups[tag] = summarizeProvider(
        {
          ...benchmark,
          cases: benchmark.cases.filter((benchmarkCase) =>
            benchmarkCase.tags.includes(tag),
          ),
        },
        provider.id,
        baselineByCase,
        observationsByCase,
      );
    }
    providers[provider.id] =
      provider.mode === 'baseline'
        ? {
            mode: provider.mode,
            profileId: provider.profileId,
            decision: 'baseline',
            summary,
            groups,
            gates: [],
          }
        : {
            mode: provider.mode,
            profileId: provider.profileId,
            summary,
            groups,
            ...evaluateCandidate(summary, benchmark.acceptance, provider),
          };
  }
  const candidateDecisions = benchmark.providers
    .filter((provider) => provider.mode === 'candidate')
    .map((provider) => providers[provider.id].decision);
  const corpusInsufficient = corpusGates.some((gate) => !gate.passed);
  const decision = corpusInsufficient
    ? 'insufficient-data'
    : candidateDecisions.includes('no-go')
      ? 'no-go'
      : candidateDecisions.includes('insufficient-data')
        ? 'insufficient-data'
        : 'advance-to-sentinel';
  return {
    schemaVersion: 1,
    benchmarkId: benchmark.benchmarkId,
    baselineProviderId: benchmark.baselineProviderId,
    decision,
    corpus: {
      caseCount: benchmark.cases.length,
      tagCounts,
      gates: corpusGates,
    },
    providers,
  };
}

function loadBenchmark(filePath) {
  const resolvedPath = path.resolve(filePath);
  const stats = fs.statSync(resolvedPath);
  if (stats.size > MAX_BENCHMARK_BYTES) {
    throw new Error('lyrics provider benchmark exceeds the size limit');
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function atomicWriteReport(filePath, report, protectedPaths = []) {
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.${process.pid}.${randomUUID()}.tmp`;
  const protectedPathSet = new Set(
    protectedPaths.map((protectedPath) => path.resolve(protectedPath)),
  );
  if (protectedPathSet.has(temporaryPath)) {
    throw new Error('benchmark report temporary path conflicts with its input');
  }
  let temporaryCreated = false;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    temporaryCreated = true;
    fs.renameSync(temporaryPath, resolvedPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) fs.rmSync(temporaryPath, { force: true });
  }
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    throw new Error(
      'usage: node scripts/lyrics-provider-evaluation.mjs <benchmark.json> [report.json]',
    );
  }
  if (outputPath && path.resolve(outputPath) === path.resolve(inputPath)) {
    throw new Error('benchmark report must not overwrite its input');
  }
  const report = evaluateLyricsProviderBenchmark(loadBenchmark(inputPath));
  if (outputPath) {
    atomicWriteReport(outputPath, report, [inputPath]);
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
