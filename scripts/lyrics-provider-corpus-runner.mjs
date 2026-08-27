import {
  evaluateLyricsProviderBenchmark,
  normalizeProbeOutcome,
  validateLyricsProviderBenchmark,
} from './lyrics-provider-evaluation.mjs';
import {
  LYRICS_CORPUS_STRATA,
  LYRICS_CORPUS_STRATA_BY_ID,
} from './lyrics-provider-corpus-strata.mjs';

const DEFAULT_REQUIRED_CASE_COUNT = 40;
const REQUIRED_MAINSTREAM_CASES_PER_STRATUM = 7;
const REQUIRED_LONG_TAIL_CASES_PER_STRATUM = 1;
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;
const MAX_PROBE_TIMEOUT_MS = 120_000;
const OPAQUE_CORPUS_ID_RE = /^lyrics-provider-private-(?:synthetic-)?v\d+$/u;
const OPAQUE_CASE_ID_RE = /^case-\d{3}$/u;
const EVALUATION_PROVIDER_IDS = new Set([
  'lrclib',
  'amll',
  'netease',
  'musixmatch',
]);
const EVALUATION_PROFILE_IDS = new Set([
  'lrclib-http-v1',
  'amll-http-v1',
  'netease-yrc-reverse-v1',
  'musixmatch-desktop-reverse-v1',
]);
const APPROVED_PROVIDER_FAILURE_CODES = new Set([
  'timeout',
  'offline',
  'fetch-unavailable',
  'invalid-request',
  'response-too-large',
  'invalid-json',
  'invalid-record',
  'rate-limited',
  'service-unavailable',
  'http-error',
  'unsafe-ttml',
  'invalid-ttml',
  'ttml-too-large',
  'probe-error',
  'provider-failure',
]);
const LANGUAGE_TAGS = new Set([
  'english',
  'mandarin',
  'cantonese',
  'japanese',
  'korean',
  'multilingual',
]);
const CATALOG_REACH_TAGS = new Set(['mainstream', 'long-tail']);
const VERSION_TAGS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const CORPUS_STRATUM_TAGS = new Set(LYRICS_CORPUS_STRATA.map(({ id }) => id));
const CONTROLLED_TAGS = new Set([
  ...LANGUAGE_TAGS,
  ...CATALOG_REACH_TAGS,
  ...VERSION_TAGS,
  ...CORPUS_STRATUM_TAGS,
  'older-release',
  'recent-release',
  'version-trap',
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
  const expected = [...expectedKeys].sort();
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function assertAllowedKeys(value, allowedKeys, label) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !allowedKeys.has(key))
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function boundedIntegerOption(value, fallback, maximum, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} is out of range`);
  }
  return value;
}

function failureObservation(providerId, failureCode, durationMs) {
  return normalizeProbeOutcome({
    providerId,
    request: {
      status: 'failed',
      durationMs: Math.min(
        MAX_PROBE_TIMEOUT_MS,
        Math.max(0, Math.round(durationMs)),
      ),
      failureCode,
    },
    catalogStatus: 'not-evaluated',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  });
}

function unrunObservation(providerId) {
  return failureObservation(providerId, 'probe-not-run', 0);
}

function validationBenchmark(corpus) {
  return {
    schemaVersion: corpus.schemaVersion,
    benchmarkId: corpus.corpusId,
    baselineProviderId: corpus.baselineProviderId,
    providers: corpus.providers,
    acceptance: corpus.acceptance,
    cases: corpus.cases.map((benchmarkCase) => ({
      id: benchmarkCase.id,
      tags: benchmarkCase.tags,
      reference: benchmarkCase.reference,
      observations: corpus.providers.map(({ id }) => unrunObservation(id)),
    })),
  };
}

export function validatePrivateLyricsCorpus(value, options = {}) {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'corpusId',
      'baselineProviderId',
      'providers',
      'acceptance',
      'cases',
    ],
    'private lyrics corpus',
  );
  if (!OPAQUE_CORPUS_ID_RE.test(value.corpusId || '')) {
    throw new TypeError('private lyrics corpus opaque corpus id is invalid');
  }
  if (!Array.isArray(value.cases)) {
    throw new TypeError('private lyrics corpus cases must be an array');
  }
  const requiredCaseCount = boundedIntegerOption(
    options.requiredCaseCount,
    DEFAULT_REQUIRED_CASE_COUNT,
    DEFAULT_REQUIRED_CASE_COUNT,
    'requiredCaseCount',
  );
  if (value.cases.length !== requiredCaseCount) {
    throw new TypeError(
      `private lyrics corpus must contain exactly ${requiredCaseCount} cases`,
    );
  }
  if (Array.isArray(value.providers)) {
    for (const provider of value.providers) {
      if (!EVALUATION_PROVIDER_IDS.has(provider?.id)) {
        throw new TypeError('private lyrics corpus provider id is invalid');
      }
      if (
        !EVALUATION_PROFILE_IDS.has(provider.profileId) ||
        !provider.profileId.startsWith(`${provider.id}-`)
      ) {
        throw new TypeError('private lyrics corpus profile id is invalid');
      }
    }
    const baseline = value.providers.find(({ id }) => id === 'lrclib');
    if (
      value.baselineProviderId !== 'lrclib' ||
      baseline?.mode !== 'baseline' ||
      baseline.profileId !== 'lrclib-http-v1'
    ) {
      throw new TypeError(
        'private lyrics corpus must use the LRCLIB baseline profile',
      );
    }
  }
  if (
    Array.isArray(value.acceptance?.requiredTags) &&
    value.acceptance.requiredTags.some(({ tag }) => !CONTROLLED_TAGS.has(tag))
  ) {
    throw new TypeError(
      'private lyrics corpus controlled required tags are invalid',
    );
  }
  if (requiredCaseCount === DEFAULT_REQUIRED_CASE_COUNT) {
    const requirements = new Map(
      value.acceptance.requiredTags.map(({ tag, minimumCases }) => [
        tag,
        minimumCases,
      ]),
    );
    if (
      [...CORPUS_STRATUM_TAGS].some(
        (tag) => requirements.get(tag) !== DEFAULT_REQUIRED_CASE_COUNT / 5,
      )
    ) {
      throw new TypeError(
        'private lyrics corpus must require exactly 8 cases per corpus stratum',
      );
    }
  }
  const stratumCounts = new Map(
    [...CORPUS_STRATUM_TAGS].map((tag) => [tag, 0]),
  );
  const stratumReachCounts = new Map(
    [...CORPUS_STRATUM_TAGS].flatMap((stratum) =>
      [...CATALOG_REACH_TAGS].map((reach) => [`${stratum}\0${reach}`, 0]),
    ),
  );
  for (const corpusCase of value.cases) {
    assertExactKeys(
      corpusCase,
      ['id', 'tags', 'goldStatus', 'reference'],
      'private lyrics corpus case',
    );
    if (corpusCase.goldStatus !== 'reviewed') {
      throw new TypeError('private lyrics corpus gold status is invalid');
    }
    if (!OPAQUE_CASE_ID_RE.test(corpusCase.id || '')) {
      throw new TypeError('private lyrics corpus opaque case id is invalid');
    }
    if (
      !Array.isArray(corpusCase.tags) ||
      corpusCase.tags.some((tag) => !CONTROLLED_TAGS.has(tag))
    ) {
      throw new TypeError('private lyrics corpus controlled tags are invalid');
    }
    const stratumTags = corpusCase.tags.filter((tag) =>
      CORPUS_STRATUM_TAGS.has(tag),
    );
    if (stratumTags.length !== 1) {
      throw new TypeError(
        'private lyrics corpus case requires exactly one corpus stratum',
      );
    }
    stratumCounts.set(
      stratumTags[0],
      (stratumCounts.get(stratumTags[0]) || 0) + 1,
    );
    const languageTags = corpusCase.tags.filter((tag) =>
      LANGUAGE_TAGS.has(tag),
    );
    if (languageTags.length !== 1) {
      throw new TypeError(
        'private lyrics corpus case requires exactly one language tag',
      );
    }
    if (
      !LYRICS_CORPUS_STRATA_BY_ID.get(
        stratumTags[0],
      ).allowedLanguageTags.includes(languageTags[0])
    ) {
      throw new TypeError(
        'private lyrics corpus language is invalid for its stratum',
      );
    }
    const reachTags = corpusCase.tags.filter((tag) =>
      CATALOG_REACH_TAGS.has(tag),
    );
    if (reachTags.length !== 1) {
      throw new TypeError(
        'private lyrics corpus case requires exactly one catalog reach tag',
      );
    }
    const reachKey = `${stratumTags[0]}\0${reachTags[0]}`;
    stratumReachCounts.set(
      reachKey,
      (stratumReachCounts.get(reachKey) || 0) + 1,
    );
    const versionTags = corpusCase.tags.filter((tag) => VERSION_TAGS.has(tag));
    if (
      versionTags.length !== 1 ||
      versionTags[0] !== corpusCase.reference?.version
    ) {
      throw new TypeError(
        'private lyrics corpus version tag must match its reference version',
      );
    }
    if (
      requiredCaseCount === DEFAULT_REQUIRED_CASE_COUNT &&
      (!corpusCase.tags.includes('recent-release') ||
        corpusCase.tags.includes('older-release'))
    ) {
      throw new TypeError(
        'private lyrics corpus production cases require recent-release confirmation',
      );
    }
  }
  if (
    requiredCaseCount === DEFAULT_REQUIRED_CASE_COUNT &&
    [...stratumCounts.values()].some(
      (count) => count !== DEFAULT_REQUIRED_CASE_COUNT / 5,
    )
  ) {
    throw new TypeError(
      'private lyrics corpus must contain exactly 8 cases per corpus stratum',
    );
  }
  if (
    requiredCaseCount === DEFAULT_REQUIRED_CASE_COUNT &&
    [...CORPUS_STRATUM_TAGS].some(
      (stratum) =>
        stratumReachCounts.get(`${stratum}\0mainstream`) !==
          REQUIRED_MAINSTREAM_CASES_PER_STRATUM ||
        stratumReachCounts.get(`${stratum}\0long-tail`) !==
          REQUIRED_LONG_TAIL_CASES_PER_STRATUM,
    )
  ) {
    throw new TypeError(
      'private lyrics corpus must contain exactly 7 mainstream and 1 long-tail case per corpus stratum',
    );
  }
  if (
    value.acceptance.requiredTags.some(
      ({ tag }) => !value.cases.some(({ tags }) => tags.includes(tag)),
    )
  ) {
    throw new TypeError(
      'private lyrics corpus required tag must occur in at least one case',
    );
  }
  validateLyricsProviderBenchmark(validationBenchmark(value));
  return structuredClone(value);
}

function validateProbes(corpus, probes) {
  if (!isPlainObject(probes)) {
    throw new TypeError('provider probes are invalid');
  }
  const expected = corpus.providers.map(({ id }) => id).sort();
  const actual = Object.keys(probes).sort();
  if (
    expected.length !== actual.length ||
    expected.some((providerId, index) => providerId !== actual[index]) ||
    actual.some((providerId) => typeof probes[providerId] !== 'function')
  ) {
    throw new TypeError('provider probes are invalid');
  }
}

function elapsedMilliseconds(startedAt) {
  const elapsed = performance.now() - startedAt;
  return Number.isFinite(elapsed) ? elapsed : 0;
}

async function executeProbe(task, probe) {
  const startedAt = performance.now();
  try {
    const value = await probe({
      caseId: task.benchmarkCase.id,
      providerId: task.providerId,
      tags: structuredClone(task.benchmarkCase.tags),
      reference: structuredClone(task.benchmarkCase.reference),
    });
    try {
      const outcome = normalizeProbeOutcome(value);
      if (outcome.providerId !== task.providerId) {
        throw new TypeError('provider mismatch');
      }
      if (
        outcome.request.status === 'failed' &&
        !APPROVED_PROVIDER_FAILURE_CODES.has(outcome.request.failureCode)
      ) {
        throw new TypeError('provider failure code is not approved');
      }
      return outcome;
    } catch {
      return failureObservation(
        task.providerId,
        'invalid-observation',
        elapsedMilliseconds(startedAt),
      );
    }
  } catch {
    return failureObservation(
      task.providerId,
      'probe-error',
      elapsedMilliseconds(startedAt),
    );
  }
}

async function runTasks(tasks, concurrency, execute) {
  const results = Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await execute(tasks[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

export async function runPrivateLyricsCorpus(value, options = {}) {
  assertAllowedKeys(
    options,
    new Set(['requiredCaseCount', 'concurrency', 'probes']),
    'private lyrics corpus runner options',
  );
  const corpus = validatePrivateLyricsCorpus(value, {
    requiredCaseCount: options.requiredCaseCount,
  });
  validateProbes(corpus, options.probes);
  const concurrency = boundedIntegerOption(
    options.concurrency,
    DEFAULT_CONCURRENCY,
    MAX_CONCURRENCY,
    'concurrency',
  );
  const tasks = corpus.cases.flatMap((benchmarkCase) =>
    corpus.providers.map(({ id }) => ({
      benchmarkCase,
      providerId: id,
    })),
  );
  const observations = await runTasks(tasks, concurrency, (task) =>
    executeProbe(task, options.probes[task.providerId]),
  );
  const cases = corpus.cases.map((benchmarkCase, caseIndex) => ({
    id: benchmarkCase.id,
    tags: structuredClone(benchmarkCase.tags),
    observations: observations.slice(
      caseIndex * corpus.providers.length,
      (caseIndex + 1) * corpus.providers.length,
    ),
  }));
  const benchmark = {
    schemaVersion: corpus.schemaVersion,
    benchmarkId: corpus.corpusId,
    baselineProviderId: corpus.baselineProviderId,
    providers: corpus.providers,
    acceptance: corpus.acceptance,
    cases: corpus.cases.map((benchmarkCase, caseIndex) => ({
      id: benchmarkCase.id,
      tags: benchmarkCase.tags,
      reference: benchmarkCase.reference,
      observations: cases[caseIndex].observations,
    })),
  };
  return {
    schemaVersion: 1,
    corpusId: corpus.corpusId,
    baselineProviderId: corpus.baselineProviderId,
    run: {
      caseCount: corpus.cases.length,
      providerCount: corpus.providers.length,
      observationCount: observations.length,
    },
    cases,
    report: evaluateLyricsProviderBenchmark(benchmark),
  };
}
