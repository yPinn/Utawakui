const MAX_CASES = 100;
const MAX_RECORDINGS = 3;
const MAX_CANDIDATES = 3;
const MAX_TEXT_LENGTH = 200;
const CASE_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const VIDEO_ID_RE = /^[0-9A-Za-z_-]{11}$/u;
const CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/u;
const ENTITY_ID_RE = /^[0-9A-Za-z_-]{1,128}$/u;
const CORPUS_PROFILES = new Map([
  [
    'artist-photo-private-v1',
    Object.freeze({
      id: 'private-v1',
      caseCount: 54,
      reviewer: 'manual-review-v1',
    }),
  ],
  [
    'artist-photo-private-synthetic-v1',
    Object.freeze({
      id: 'synthetic-v1',
      caseCount: 4,
      reviewer: 'synthetic-review-v1',
    }),
  ],
]);
const PROVIDER_IDS = new Set([
  'synthetic-provider-v1',
  'ytmusicapi-1.12.3-anonymous',
]);
const FAILURE_STAGES = new Set(['search', 'detail', 'playlist']);
const FAILURE_REASONS = new Set([
  'timeout',
  'rate-limited',
  'schema-error',
  'provider-error',
  'circuit-open',
]);
const PORTRAIT_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
]);

const DEFAULT_THRESHOLDS = Object.freeze({
  minListedRecovered: 2,
  minCoverageImprovementPercentagePoints: 10,
  minTop3RecallPercent: 95,
  maxP95LatencyMs: 8000,
  maxFailureRatePercentExclusive: 2,
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

function requireBoundedText(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_TEXT_LENGTH
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function requireCaseId(value) {
  if (!CASE_ID_RE.test(value || '')) {
    throw new TypeError('artist photo case id is invalid');
  }
}

function validateCorpusCase(value) {
  assertExactKeys(
    value,
    ['caseId', 'listed', 'currentPhotoPresent', 'artistName', 'recordings'],
    'artist photo corpus case',
  );
  requireCaseId(value.caseId);
  if (typeof value.listed !== 'boolean') {
    throw new TypeError('artist photo listed flag is invalid');
  }
  if (typeof value.currentPhotoPresent !== 'boolean') {
    throw new TypeError('artist photo current result is invalid');
  }
  requireBoundedText(value.artistName, 'artist name');
  if (
    !Array.isArray(value.recordings) ||
    value.recordings.length > MAX_RECORDINGS
  ) {
    throw new TypeError('artist photo recordings are invalid');
  }
  const videoIds = new Set();
  for (const recording of value.recordings) {
    assertExactKeys(
      recording,
      ['videoId', 'title', 'channelId'],
      'artist photo recording',
    );
    if (!VIDEO_ID_RE.test(recording.videoId || '')) {
      throw new TypeError('artist photo video id is invalid');
    }
    if (videoIds.has(recording.videoId)) {
      throw new TypeError('artist photo video ids must be unique per case');
    }
    videoIds.add(recording.videoId);
    requireBoundedText(recording.title, 'recording title');
    if (
      recording.channelId !== null &&
      !CHANNEL_ID_RE.test(recording.channelId || '')
    ) {
      throw new TypeError('artist photo channel id is invalid');
    }
  }
}

export function validateArtistPhotoEvaluationCorpus(
  value,
  { requiredCaseCount } = {},
) {
  assertExactKeys(
    value,
    ['schemaVersion', 'corpusId', 'cases'],
    'artist photo evaluation corpus',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported artist photo corpus version');
  }
  const profile = CORPUS_PROFILES.get(value.corpusId);
  if (!profile) {
    throw new TypeError('artist photo corpus id is invalid');
  }
  if (
    requiredCaseCount !== undefined &&
    requiredCaseCount !== profile.caseCount
  ) {
    throw new TypeError('artist photo corpus profile is invalid');
  }
  if (
    !Array.isArray(value.cases) ||
    value.cases.length !== profile.caseCount ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('artist photo corpus case count is invalid');
  }
  const caseIds = new Set();
  for (const corpusCase of value.cases) {
    validateCorpusCase(corpusCase);
    if (caseIds.has(corpusCase.caseId)) {
      throw new TypeError('artist photo case ids must be unique');
    }
    caseIds.add(corpusCase.caseId);
  }
  return value;
}

function validateCandidate(candidate, expectedRank) {
  assertExactKeys(
    candidate,
    ['rank', 'entityId', 'name', 'portrait', 'evidence'],
    'artist photo candidate',
  );
  if (candidate.rank !== expectedRank) {
    throw new TypeError('artist photo candidate ranks must be sequential');
  }
  if (!ENTITY_ID_RE.test(candidate.entityId || '')) {
    throw new TypeError('artist photo candidate entity id is invalid');
  }
  requireBoundedText(candidate.name, 'candidate name');
  assertExactKeys(
    candidate.portrait,
    ['host', 'width', 'height'],
    'artist photo portrait',
  );
  if (!PORTRAIT_HOSTS.has(candidate.portrait.host)) {
    throw new TypeError('artist photo portrait host is invalid');
  }
  if (
    !Number.isSafeInteger(candidate.portrait.width) ||
    candidate.portrait.width < 60 ||
    candidate.portrait.width > 2048 ||
    candidate.portrait.height !== candidate.portrait.width
  ) {
    throw new TypeError('artist photo portrait dimensions are invalid');
  }
  assertExactKeys(
    candidate.evidence,
    ['exactName', 'matchedChannelCount', 'matchedVideoCount'],
    'artist photo candidate evidence',
  );
  if (typeof candidate.evidence.exactName !== 'boolean') {
    throw new TypeError('artist photo exact-name evidence is invalid');
  }
  for (const key of ['matchedChannelCount', 'matchedVideoCount']) {
    if (
      !Number.isSafeInteger(candidate.evidence[key]) ||
      candidate.evidence[key] < 0 ||
      candidate.evidence[key] > MAX_RECORDINGS
    ) {
      throw new TypeError('artist photo candidate evidence count is invalid');
    }
  }
}

function assertExactlyOnePerCorpusCase(entries, corpus, label) {
  if (!Array.isArray(entries) || entries.length !== corpus.cases.length) {
    throw new TypeError(`${label} must cover every corpus case exactly once`);
  }
  const expected = new Set(corpus.cases.map(({ caseId }) => caseId));
  const seen = new Set();
  for (const entry of entries) {
    requireCaseId(entry?.caseId);
    if (!expected.has(entry.caseId) || seen.has(entry.caseId)) {
      throw new TypeError(`${label} case ids must be unique and known`);
    }
    seen.add(entry.caseId);
  }
}

export function validateArtistPhotoProviderObservations(value, corpus) {
  assertExactKeys(
    value,
    ['schemaVersion', 'provider', 'cases'],
    'artist photo provider observations',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported artist photo observations version');
  }
  if (!PROVIDER_IDS.has(value.provider)) {
    throw new TypeError('artist photo provider is invalid');
  }
  assertExactlyOnePerCorpusCase(
    value.cases,
    corpus,
    'artist photo observations',
  );
  for (const observation of value.cases) {
    assertExactKeys(
      observation,
      ['caseId', 'status', 'latencyMs', 'candidates', 'operationalFailures'],
      'artist photo observation',
    );
    if (!['ok', 'partial', 'error'].includes(observation.status)) {
      throw new TypeError('artist photo observation status is invalid');
    }
    if (
      !Number.isSafeInteger(observation.latencyMs) ||
      observation.latencyMs < 0 ||
      observation.latencyMs > 120_000
    ) {
      throw new TypeError('artist photo observation latency is invalid');
    }
    if (
      !Array.isArray(observation.candidates) ||
      observation.candidates.length > MAX_CANDIDATES ||
      (observation.status === 'error' && observation.candidates.length !== 0)
    ) {
      throw new TypeError('artist photo observation candidates are invalid');
    }
    if (
      !Array.isArray(observation.operationalFailures) ||
      observation.operationalFailures.length > 6
    ) {
      throw new TypeError('artist photo operational failures are invalid');
    }
    for (const failure of observation.operationalFailures) {
      assertExactKeys(
        failure,
        ['stage', 'reason'],
        'artist photo operational failure',
      );
      if (
        !FAILURE_STAGES.has(failure.stage) ||
        !FAILURE_REASONS.has(failure.reason)
      ) {
        throw new TypeError('artist photo operational failure is invalid');
      }
    }
    if (
      (observation.status === 'ok' &&
        observation.operationalFailures.length !== 0) ||
      (observation.status !== 'ok' &&
        observation.operationalFailures.length === 0)
    ) {
      throw new TypeError(
        'artist photo observation status does not match failures',
      );
    }
    observation.candidates.forEach((candidate, index) =>
      validateCandidate(candidate, index + 1),
    );
  }
  return value;
}

export function validateArtistPhotoProviderReviews(
  value,
  corpus,
  observations = null,
) {
  assertExactKeys(
    value,
    ['schemaVersion', 'reviewer', 'cases'],
    'artist photo provider reviews',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported artist photo reviews version');
  }
  const profile = CORPUS_PROFILES.get(corpus.corpusId);
  if (!profile || value.reviewer !== profile.reviewer) {
    throw new TypeError('artist photo reviewer is invalid');
  }
  assertExactlyOnePerCorpusCase(value.cases, corpus, 'artist photo reviews');
  const candidateCountByCaseId = observations
    ? new Map(
        observations.cases.map((entry) => [
          entry.caseId,
          entry.candidates.length,
        ]),
      )
    : null;
  for (const review of value.cases) {
    assertExactKeys(review, ['caseId', 'correctRanks'], 'artist photo review');
    if (
      !Array.isArray(review.correctRanks) ||
      review.correctRanks.length > MAX_CANDIDATES ||
      review.correctRanks.some(
        (rank) =>
          !Number.isSafeInteger(rank) || rank < 1 || rank > MAX_CANDIDATES,
      ) ||
      new Set(review.correctRanks).size !== review.correctRanks.length
    ) {
      throw new TypeError('artist photo correct candidate ranks are invalid');
    }
    const candidateCount = candidateCountByCaseId?.get(review.caseId);
    if (
      candidateCount !== undefined &&
      review.correctRanks.some((rank) => rank > candidateCount)
    ) {
      throw new TypeError('artist photo correct candidate rank does not exist');
    }
  }
  return value;
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function percentile95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function resolveThresholds(overrides) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(overrides || {}) };
  for (const [key, value] of Object.entries(thresholds)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`artist photo threshold ${key} is invalid`);
    }
  }
  return thresholds;
}

export { selectAutomaticArtistPhotoCandidateRank };

export function evaluateArtistPhotoProvider({
  corpus,
  observations,
  reviews,
  thresholds: thresholdOverrides,
}) {
  validateArtistPhotoEvaluationCorpus(corpus);
  validateArtistPhotoProviderObservations(observations, corpus);
  validateArtistPhotoProviderReviews(reviews, corpus, observations);
  const corpusProfile = CORPUS_PROFILES.get(corpus.corpusId);
  const thresholds = resolveThresholds(thresholdOverrides);
  const observationByCaseId = new Map(
    observations.cases.map((entry) => [entry.caseId, entry]),
  );
  const reviewByCaseId = new Map(
    reviews.cases.map((entry) => [entry.caseId, entry]),
  );

  let currentPhotoCount = 0;
  let projectedPhotoPresenceCount = 0;
  let verifiedAutomaticRecoveryCount = 0;
  let listedCaseCount = 0;
  let listedMissingCount = 0;
  let listedRecoveredCount = 0;
  let top1CorrectCount = 0;
  let top3CorrectCount = 0;
  let wrongAutoApplyCount = 0;
  let automaticCandidateCount = 0;
  let existingAutoApplyCount = 0;
  let failureCount = 0;
  let operationalFailureCount = 0;
  const latencies = [];

  for (const corpusCase of corpus.cases) {
    const observation = observationByCaseId.get(corpusCase.caseId);
    const review = reviewByCaseId.get(corpusCase.caseId);
    const correctRanks = new Set(review.correctRanks);
    const autoApplyRank = selectAutomaticArtistPhotoCandidateRank(
      observation,
      corpusCase,
    );
    const autoApplyCorrect =
      autoApplyRank !== null && correctRanks.has(autoApplyRank);
    const projectedPhotoPresent =
      corpusCase.currentPhotoPresent || autoApplyRank !== null;

    if (corpusCase.currentPhotoPresent) currentPhotoCount += 1;
    if (projectedPhotoPresent) projectedPhotoPresenceCount += 1;
    if (!corpusCase.currentPhotoPresent && autoApplyCorrect)
      verifiedAutomaticRecoveryCount += 1;
    if (corpusCase.listed) {
      listedCaseCount += 1;
      if (!corpusCase.currentPhotoPresent) {
        listedMissingCount += 1;
        if (autoApplyCorrect) listedRecoveredCount += 1;
      }
    }
    if (correctRanks.has(1)) top1CorrectCount += 1;
    if (correctRanks.size > 0) top3CorrectCount += 1;
    if (autoApplyRank !== null) automaticCandidateCount += 1;
    if (autoApplyRank !== null && !autoApplyCorrect) {
      wrongAutoApplyCount += 1;
    }
    if (corpusCase.currentPhotoPresent && autoApplyRank !== null) {
      existingAutoApplyCount += 1;
    }
    if (observation.status !== 'ok') failureCount += 1;
    operationalFailureCount += observation.operationalFailures.length;
    latencies.push(observation.latencyMs);
  }

  const caseCount = corpus.cases.length;
  const currentCoveragePercent = percent(currentPhotoCount, caseCount);
  const currentPresencePlusVerifiedRecoveryCount =
    currentPhotoCount + verifiedAutomaticRecoveryCount;
  const projectedPhotoPresencePercent = percent(
    projectedPhotoPresenceCount,
    caseCount,
  );
  const currentPresencePlusVerifiedRecoveryPercent = percent(
    currentPresencePlusVerifiedRecoveryCount,
    caseCount,
  );
  const metrics = {
    currentPhotoCount,
    projectedPhotoPresenceCount,
    verifiedAutomaticRecoveryCount,
    currentPresencePlusVerifiedRecoveryCount,
    listedMissingCount,
    listedRecoveredCount,
    top1CorrectCount,
    top3CorrectCount,
    automaticCandidateCount,
    wrongAutoApplyCount,
    operationalFailureCount,
    currentCoveragePercent,
    projectedPhotoPresencePercent,
    currentPresencePlusVerifiedRecoveryPercent,
    verifiedRecoveryLiftPercentagePoints: Number(
      (
        currentPresencePlusVerifiedRecoveryPercent - currentCoveragePercent
      ).toFixed(2),
    ),
    top1AccuracyPercent: percent(top1CorrectCount, caseCount),
    top3RecallPercent: percent(top3CorrectCount, caseCount),
    failureRatePercent: percent(failureCount, caseCount),
    p95LatencyMs: percentile95(latencies),
  };
  const gates = {
    zeroWrongAutoApply: wrongAutoApplyCount === 0,
    preservesExistingPhotos: existingAutoApplyCount === 0,
    recoversListedMissing:
      listedRecoveredCount >=
      Math.min(thresholds.minListedRecovered, listedMissingCount),
    improvesFullCoverage:
      metrics.verifiedRecoveryLiftPercentagePoints >=
      thresholds.minCoverageImprovementPercentagePoints,
    meetsTop3Recall:
      metrics.top3RecallPercent >= thresholds.minTop3RecallPercent,
    meetsLatency: metrics.p95LatencyMs <= thresholds.maxP95LatencyMs,
    meetsFailureRate:
      metrics.failureRatePercent < thresholds.maxFailureRatePercentExclusive,
  };
  const safetyPassed =
    gates.zeroWrongAutoApply && gates.preservesExistingPhotos;
  const valuePassed = gates.recoversListedMissing && gates.improvesFullCoverage;
  const allPassed = Object.values(gates).every(Boolean);
  const decision = allPassed
    ? 'go'
    : safetyPassed && valuePassed
      ? 'conditional-go'
      : 'no-go';

  return {
    schemaVersion: 1,
    run: {
      caseCount,
      listedCaseCount,
      provider: observations.provider,
      corpusProfile: corpusProfile.id,
    },
    metrics,
    gates,
    decision,
  };
}
import { selectAutomaticArtistPhotoCandidateRank } from '../electron/lib/artists/artistPhotoCandidatePolicy.js';
