import { normalizeProbeOutcome } from './lyrics-provider-evaluation.mjs';
import { NETEASE_RUNTIME_PROFILE } from './lyrics-provider-netease-runtime-contract.mjs';

export const NETEASE_SENTINEL_REQUIRED_SLOTS = 288;
const SLOTS_PER_INTERVAL = 4;
const LANGUAGE_GROUPS = Object.freeze(['zh', 'en', 'ja', 'ko']);
const HARD_FAILURE_CODES = new Set([
  'integrity-mismatch',
  'environment-leak',
  'worker-protocol-error',
  'termination-failed',
  'schema-drift',
]);
const FAILURE_CODES = new Set([
  'invalid-request',
  'invalid-record',
  'fetch-unavailable',
  'provider-failure',
  'service-unavailable',
  'rate-limited',
  'http-error',
  'response-too-large',
  'probe-error',
  'timeout',
  'schema-drift',
  'worker-crash',
  'worker-protocol-error',
  'termination-failed',
  'runtime-unavailable',
]);

function emptyCounts() {
  return {
    attempts: 0,
    requestSucceeded: 0,
    requestFailed: 0,
    catalogMatch: 0,
    catalogMiss: 0,
    capabilities: { T0: 0, T1: 0, T2: 0 },
    yrcMissing: 0,
    failures: {},
    hardFailureCount: 0,
    schemaDriftCount: 0,
    latency: {
      count: 0,
      sumMs: 0,
      buckets: {
        upTo500: 0,
        upTo1000: 0,
        upTo3000: 0,
        upTo10000: 0,
        over10000: 0,
      },
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validCounts(value) {
  if (
    !hasExactKeys(value, [
      'attempts',
      'requestSucceeded',
      'requestFailed',
      'catalogMatch',
      'catalogMiss',
      'capabilities',
      'yrcMissing',
      'failures',
      'hardFailureCount',
      'schemaDriftCount',
      'latency',
    ]) ||
    ![
      value.attempts,
      value.requestSucceeded,
      value.requestFailed,
      value.catalogMatch,
      value.catalogMiss,
      value.yrcMissing,
      value.hardFailureCount,
      value.schemaDriftCount,
    ].every(validCount) ||
    value.requestSucceeded + value.requestFailed !== value.attempts ||
    !hasExactKeys(value.capabilities, ['T0', 'T1', 'T2']) ||
    !Object.values(value.capabilities).every(validCount) ||
    !value.failures ||
    typeof value.failures !== 'object' ||
    Array.isArray(value.failures) ||
    Object.entries(value.failures).some(
      ([code, count]) => !FAILURE_CODES.has(code) || !validCount(count),
    ) ||
    !hasExactKeys(value.latency, ['count', 'sumMs', 'buckets']) ||
    !validCount(value.latency.count) ||
    !validCount(value.latency.sumMs) ||
    value.latency.count !== value.attempts ||
    !hasExactKeys(value.latency.buckets, [
      'upTo500',
      'upTo1000',
      'upTo3000',
      'upTo10000',
      'over10000',
    ]) ||
    !Object.values(value.latency.buckets).every(validCount) ||
    Object.values(value.latency.buckets).reduce(
      (sum, count) => sum + count,
      0,
    ) !== value.attempts
  ) {
    return false;
  }
  return true;
}

function incrementLatency(latency, durationMs) {
  const next = clone(latency);
  next.count += 1;
  next.sumMs += durationMs;
  if (durationMs <= 500) next.buckets.upTo500 += 1;
  else if (durationMs <= 1000) next.buckets.upTo1000 += 1;
  else if (durationMs <= 3000) next.buckets.upTo3000 += 1;
  else if (durationMs <= 10_000) next.buckets.upTo10000 += 1;
  else next.buckets.over10000 += 1;
  return next;
}

function incrementCounts(counts, observation) {
  const next = clone(counts);
  next.attempts += 1;
  next.latency = incrementLatency(next.latency, observation.request.durationMs);
  if (observation.request.status === 'ok') next.requestSucceeded += 1;
  else next.requestFailed += 1;
  if (observation.catalogStatus === 'match') next.catalogMatch += 1;
  if (observation.catalogStatus === 'miss') next.catalogMiss += 1;
  if (observation.capability) {
    next.capabilities[observation.capability] += 1;
    if (observation.capability !== 'T2') next.yrcMissing += 1;
  }
  const failureCode = observation.request.failureCode;
  if (failureCode) {
    next.failures[failureCode] = (next.failures[failureCode] || 0) + 1;
    if (HARD_FAILURE_CODES.has(failureCode)) next.hardFailureCount += 1;
    if (failureCode === 'schema-drift') next.schemaDriftCount += 1;
  }
  return next;
}

export function createNeteaseSentinelState({ startedAt } = {}) {
  if (!validTimestamp(startedAt)) {
    throw new TypeError('invalid NetEase sentinel start time');
  }
  return {
    schemaVersion: 1,
    profileId: NETEASE_RUNTIME_PROFILE.profileId,
    startedAt,
    updatedAt: startedAt,
    requiredSlots: NETEASE_SENTINEL_REQUIRED_SLOTS,
    attemptedSlots: 0,
    complete: false,
    languageGroups: Object.fromEntries(
      LANGUAGE_GROUPS.map((group) => [group, emptyCounts()]),
    ),
    totals: emptyCounts(),
    intervals: [],
  };
}

export function validateNeteaseSentinelState(value) {
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'profileId',
      'startedAt',
      'updatedAt',
      'requiredSlots',
      'attemptedSlots',
      'complete',
      'languageGroups',
      'totals',
      'intervals',
    ]) ||
    value.schemaVersion !== 1 ||
    value.profileId !== NETEASE_RUNTIME_PROFILE.profileId ||
    !validTimestamp(value.startedAt) ||
    !validTimestamp(value.updatedAt) ||
    value.requiredSlots !== NETEASE_SENTINEL_REQUIRED_SLOTS ||
    !Number.isSafeInteger(value.attemptedSlots) ||
    value.attemptedSlots < 0 ||
    value.attemptedSlots > value.requiredSlots ||
    value.complete !== (value.attemptedSlots === value.requiredSlots) ||
    !value.languageGroups ||
    Object.keys(value.languageGroups).sort().join(',') !==
      [...LANGUAGE_GROUPS].sort().join(',') ||
    !Object.values(value.languageGroups).every(validCounts) ||
    !validCounts(value.totals) ||
    value.totals.attempts !== value.attemptedSlots ||
    Object.values(value.languageGroups).reduce(
      (sum, counts) => sum + counts.attempts,
      0,
    ) !== value.attemptedSlots ||
    !Array.isArray(value.intervals) ||
    value.intervals.length > 72 ||
    value.intervals.some(
      (interval, index) =>
        !hasExactKeys(interval, [
          'index',
          'firstObservedAt',
          'lastObservedAt',
          'counts',
        ]) ||
        interval.index !== index ||
        !validTimestamp(interval.firstObservedAt) ||
        !validTimestamp(interval.lastObservedAt) ||
        !validCounts(interval.counts),
    ) ||
    value.intervals.reduce(
      (sum, interval) => sum + interval.counts.attempts,
      0,
    ) !== value.attemptedSlots
  ) {
    throw new TypeError('invalid NetEase sentinel state');
  }
  return clone(value);
}

export function recordNeteaseSentinelObservation(
  state,
  { languageGroup, observedAt, observation },
) {
  const current = validateNeteaseSentinelState(state);
  if (current.complete) throw new TypeError('NetEase sentinel is complete');
  if (!LANGUAGE_GROUPS.includes(languageGroup) || !validTimestamp(observedAt)) {
    throw new TypeError('invalid NetEase sentinel observation metadata');
  }
  const normalized = normalizeProbeOutcome(observation, 'netease');
  const intervalIndex = Math.floor(current.attemptedSlots / SLOTS_PER_INTERVAL);
  const intervals = [...current.intervals];
  if (!intervals[intervalIndex]) {
    intervals.push({
      index: intervalIndex,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      counts: emptyCounts(),
    });
  }
  intervals[intervalIndex] = {
    ...intervals[intervalIndex],
    lastObservedAt: observedAt,
    counts: incrementCounts(intervals[intervalIndex].counts, normalized),
  };
  const attemptedSlots = current.attemptedSlots + 1;
  return validateNeteaseSentinelState({
    ...current,
    updatedAt: observedAt,
    attemptedSlots,
    complete: attemptedSlots === current.requiredSlots,
    languageGroups: {
      ...current.languageGroups,
      [languageGroup]: incrementCounts(
        current.languageGroups[languageGroup],
        normalized,
      ),
    },
    totals: incrementCounts(current.totals, normalized),
    intervals,
  });
}

export function decideNeteaseSentinelOutcome(value) {
  if (
    !value ||
    typeof value.complete !== 'boolean' ||
    typeof value.smokeSelectionCorrect !== 'boolean' ||
    !Number.isSafeInteger(value.attemptedSlots) ||
    !Number.isSafeInteger(value.requestSucceeded) ||
    !Number.isSafeInteger(value.requestFailed) ||
    !Number.isSafeInteger(value.hardFailureCount) ||
    !Number.isSafeInteger(value.schemaDriftCount) ||
    !Number.isSafeInteger(value.validatedT2Count)
  ) {
    throw new TypeError('invalid NetEase sentinel decision input');
  }
  const requestCount = value.requestSucceeded + value.requestFailed;
  const successRate =
    requestCount === 0 ? 0 : value.requestSucceeded / requestCount;
  if (
    !value.complete ||
    !value.smokeSelectionCorrect ||
    value.attemptedSlots < NETEASE_SENTINEL_REQUIRED_SLOTS ||
    value.hardFailureCount > 0 ||
    value.schemaDriftCount > 0 ||
    successRate < 0.9
  ) {
    return 'unstable-exclude';
  }
  if (successRate >= 0.95 && value.validatedT2Count > 0) {
    return 'technically-usable';
  }
  return 'fallback-experimental-only';
}
