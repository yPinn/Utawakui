import { createHash } from 'node:crypto';

import {
  readingFromSegments,
  validateLyricsReadingBenchmark,
  validateSegments,
} from '../lyricsReadingEvaluation/contract.mjs';

const MAX_CASES = 300;
const MAX_TEXT_LENGTH = 160;
const MAX_READING_LENGTH = 640;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._+:-]{0,127}$/iu;
const CASE_ID_RE = /^local-[a-f0-9]{64}$/u;
const RECORDING_ID_RE = /^local:[a-f0-9]{64}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const SHAPES = new Set([
  'kanji-kana',
  'mixed-latin',
  'kana-only',
  'kanji-only',
]);
const COHORTS = Object.freeze([
  'standard',
  'proper-noun',
  'mixed',
  'jukujikun',
  'song-specific',
]);
const COHORT_SET = new Set(COHORTS);
const REQUIRED_COHORTS = COHORTS.filter((cohort) => cohort !== 'song-specific');
const DECISIONS = new Set(['pending', 'approved', 'skipped']);
const SUMMARY_KEYS = [
  'schemaVersion',
  'generatedAt',
  'documentsScanned',
  'japaneseDocuments',
  'nonJapaneseDocuments',
  'invalidDocuments',
  'linesScanned',
  'eligibleAutomaticLines',
  'availableEditedGoldSeedLines',
  'editedGoldSeedLines',
  'conflictingEditedGoldLines',
  'excludedNonJapaneseLines',
  'excludedLongLines',
  'excludedControlCharacterLines',
  'excludedMalformedLines',
  'excludedDuplicateTextLines',
  'reviewQueueLines',
  'reviewLimit',
  'reviewQueueTruncated',
  'goldSeedTruncated',
];
const SUMMARY_SCAN_KEYS = [
  'documentsSeen',
  'directoryEntriesSeen',
  'sourceBytesRead',
];

export const LOCAL_READING_REVIEW_COHORTS = COHORTS;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

function validateTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function validateReading(value, label) {
  if (typeof value === 'string' && value.length > MAX_READING_LENGTH) {
    throw new TypeError(`${label} exceeds the length limit`);
  }
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    hasControlCharacters(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function validateAnalyzer(value) {
  assertExactKeys(value, ['id', 'version'], 'local reading analyzer');
  if (
    typeof value.id !== 'string' ||
    typeof value.version !== 'string' ||
    !COMPONENT_RE.test(value.id) ||
    !COMPONENT_RE.test(value.version)
  ) {
    throw new TypeError('local reading analyzer is invalid');
  }
}

function validateSourceReview(value, kind) {
  const keys =
    kind === 'automatic'
      ? [
          'status',
          'cohort',
          'analyzerAddressable',
          'expectedKana',
          'expectedSegments',
          'notes',
        ]
      : ['status', 'cohort', 'analyzerAddressable', 'notes'];
  assertExactKeys(value, keys, 'local reading source review');
  const expectedStatus =
    kind === 'automatic' ? 'pending' : 'needs-classification';
  if (
    value.status !== expectedStatus ||
    value.cohort !== null ||
    value.analyzerAddressable !== null ||
    value.notes !== null ||
    (kind === 'automatic' &&
      (value.expectedKana !== null || value.expectedSegments !== null))
  ) {
    throw new TypeError('local reading source review is invalid');
  }
}

function validateSourceCase(value, kind) {
  const keys = [
    'id',
    'recordingIdentity',
    'text',
    'shape',
    'analyzer',
    ...(kind === 'automatic'
      ? ['currentKana', 'currentSegments']
      : ['expectedKana', 'expectedSegments']),
    'review',
  ];
  assertExactKeys(value, keys, 'local reading source case');
  if (!CASE_ID_RE.test(value.id || '')) {
    throw new TypeError('local reading source case id is invalid');
  }
  if (!RECORDING_ID_RE.test(value.recordingIdentity || '')) {
    throw new TypeError('local reading recording identity is invalid');
  }
  if (
    typeof value.text !== 'string' ||
    value.text.length === 0 ||
    value.text.length > MAX_TEXT_LENGTH ||
    hasControlCharacters(value.text) ||
    !SHAPES.has(value.shape)
  ) {
    throw new TypeError('local reading source text is invalid');
  }
  validateAnalyzer(value.analyzer);
  const kanaKey = kind === 'automatic' ? 'currentKana' : 'expectedKana';
  const segmentsKey =
    kind === 'automatic' ? 'currentSegments' : 'expectedSegments';
  validateReading(value[kanaKey], `local reading ${kanaKey}`);
  validateSegments(
    value[segmentsKey],
    value.text,
    `local reading ${segmentsKey}`,
  );
  if (
    value[segmentsKey].length === 0 ||
    value[segmentsKey].length > MAX_TEXT_LENGTH ||
    readingFromSegments(value[segmentsKey]) !== value[kanaKey]
  ) {
    throw new TypeError('local reading source segments are invalid');
  }
  validateSourceReview(value.review, kind);
}

function validateSourceGroup(value, kind) {
  assertExactKeys(
    value,
    ['schemaVersion', 'corpusId', 'generatedAt', 'cases'],
    `local reading ${kind} corpus`,
  );
  const expectedId =
    kind === 'automatic'
      ? 'utawakui-local-reading-review-v1'
      : 'utawakui-local-reading-gold-seed-v1';
  if (value.schemaVersion !== 1 || value.corpusId !== expectedId) {
    throw new TypeError(`local reading ${kind} corpus identity is invalid`);
  }
  validateTimestamp(value.generatedAt, `local reading ${kind} generated time`);
  if (!Array.isArray(value.cases) || value.cases.length > MAX_CASES) {
    throw new TypeError(`local reading ${kind} cases are invalid`);
  }
  for (const sourceCase of value.cases) validateSourceCase(sourceCase, kind);
}

function validateSummary(value, corpus) {
  const scanFieldCount = SUMMARY_SCAN_KEYS.filter((key) =>
    Object.hasOwn(value, key),
  ).length;
  if (scanFieldCount !== 0 && scanFieldCount !== SUMMARY_SCAN_KEYS.length) {
    throw new TypeError('local reading corpus summary scan fields are invalid');
  }
  const expectedKeys =
    scanFieldCount === 0
      ? SUMMARY_KEYS
      : [...SUMMARY_KEYS, ...SUMMARY_SCAN_KEYS];
  assertExactKeys(value, expectedKeys, 'local reading corpus summary');
  if (value.schemaVersion !== 1) {
    throw new TypeError('local reading corpus summary schema is invalid');
  }
  validateTimestamp(value.generatedAt, 'local reading corpus generated time');
  const booleanKeys = new Set(['reviewQueueTruncated', 'goldSeedTruncated']);
  for (const key of expectedKeys.slice(2)) {
    if (booleanKeys.has(key)) {
      if (typeof value[key] !== 'boolean') {
        throw new TypeError('local reading corpus summary is invalid');
      }
      continue;
    }
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw new TypeError('local reading corpus summary is invalid');
    }
  }
  if (
    value.generatedAt !== corpus.reviewQueue.generatedAt ||
    value.generatedAt !== corpus.goldSeed.generatedAt ||
    value.reviewQueueLines !== corpus.reviewQueue.cases.length ||
    value.editedGoldSeedLines !== corpus.goldSeed.cases.length ||
    value.reviewLimit < 1 ||
    value.reviewLimit > MAX_CASES
  ) {
    throw new TypeError('local reading corpus summary does not match cases');
  }
}

export function validateLocalReadingCorpus(value) {
  assertExactKeys(
    value,
    ['reviewQueue', 'goldSeed', 'summary'],
    'local reading corpus',
  );
  validateSourceGroup(value.reviewQueue, 'automatic');
  validateSourceGroup(value.goldSeed, 'gold');
  const allCases = [...value.goldSeed.cases, ...value.reviewQueue.cases];
  if (allCases.length === 0 || allCases.length > MAX_CASES) {
    throw new TypeError('local reading corpus case count is invalid');
  }
  const caseIds = new Set();
  const texts = new Set();
  for (const sourceCase of allCases) {
    if (caseIds.has(sourceCase.id)) {
      throw new TypeError('local reading corpus has a duplicate case id');
    }
    if (texts.has(sourceCase.text)) {
      throw new TypeError('local reading corpus has duplicate text');
    }
    caseIds.add(sourceCase.id);
    texts.add(sourceCase.text);
  }
  validateSummary(value.summary, value);
  return structuredClone(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function localReadingCorpusSha256(value) {
  const corpus = validateLocalReadingCorpus(value);
  return createHash('sha256').update(canonicalJson(corpus)).digest('hex');
}

function orderedSourceCases(corpus) {
  return [...corpus.goldSeed.cases, ...corpus.reviewQueue.cases];
}

function emptyReview(caseId) {
  return {
    caseId,
    decision: 'pending',
    cohort: null,
    analyzerAddressable: null,
    expectedKana: null,
    expectedSegments: null,
  };
}

export function createLocalReadingReviewManifest(value) {
  const corpus = validateLocalReadingCorpus(value);
  return {
    schemaVersion: 1,
    corpusId: corpus.reviewQueue.corpusId,
    corpusSha256: localReadingCorpusSha256(corpus),
    status: 'in-review',
    reviewOrder: [],
    reviews: orderedSourceCases(corpus).map(({ id }) => emptyReview(id)),
  };
}

function validateApprovedReview(review, sourceCase) {
  if (!COHORT_SET.has(review.cohort)) {
    throw new TypeError('approved local reading review cohort is invalid');
  }
  const expectedAddressable = review.cohort !== 'song-specific';
  if (review.analyzerAddressable !== expectedAddressable) {
    throw new TypeError(
      'approved local reading analyzer-addressable flag is invalid',
    );
  }
  validateReading(review.expectedKana, 'approved local reading kana');
  validateSegments(
    review.expectedSegments,
    sourceCase.text,
    'approved local reading',
  );
  if (
    review.expectedSegments.length === 0 ||
    review.expectedSegments.length > MAX_TEXT_LENGTH ||
    readingFromSegments(review.expectedSegments) !== review.expectedKana
  ) {
    throw new TypeError('approved local reading segments are invalid');
  }
}

function validateReview(review, sourceCase) {
  assertExactKeys(
    review,
    [
      'caseId',
      'decision',
      'cohort',
      'analyzerAddressable',
      'expectedKana',
      'expectedSegments',
    ],
    'local reading review',
  );
  if (review.caseId !== sourceCase.id || !DECISIONS.has(review.decision)) {
    throw new TypeError('local reading review identity or decision is invalid');
  }
  if (review.decision === 'approved') {
    validateApprovedReview(review, sourceCase);
    return;
  }
  if (
    review.cohort !== null ||
    review.analyzerAddressable !== null ||
    review.expectedKana !== null ||
    review.expectedSegments !== null
  ) {
    throw new TypeError('non-approved local reading fields must remain null');
  }
}

export function validateLocalReadingReviewManifest(corpusValue, value) {
  const corpus = validateLocalReadingCorpus(corpusValue);
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'corpusId',
      'corpusSha256',
      'status',
      'reviewOrder',
      'reviews',
    ],
    'local reading review manifest',
  );
  if (
    value.schemaVersion !== 1 ||
    value.corpusId !== corpus.reviewQueue.corpusId ||
    value.status !== 'in-review'
  ) {
    throw new TypeError('local reading review manifest identity is invalid');
  }
  if (
    !SHA256_RE.test(value.corpusSha256 || '') ||
    value.corpusSha256 !== localReadingCorpusSha256(corpus)
  ) {
    throw new TypeError(
      'local reading review manifest corpus digest is invalid',
    );
  }
  const sourceCases = orderedSourceCases(corpus);
  if (
    !Array.isArray(value.reviews) ||
    value.reviews.length !== sourceCases.length
  ) {
    throw new TypeError('local reading manifest requires one review per case');
  }
  const sourceById = new Map(
    sourceCases.map((sourceCase) => [sourceCase.id, sourceCase]),
  );
  const reviewsById = new Map();
  for (const review of value.reviews) {
    if (reviewsById.has(review?.caseId)) {
      throw new TypeError('local reading manifest has a duplicate review id');
    }
    const sourceCase = sourceById.get(review?.caseId);
    if (!sourceCase) {
      throw new TypeError('local reading manifest references an unknown case');
    }
    validateReview(review, sourceCase);
    reviewsById.set(review.caseId, review);
  }
  if (!Array.isArray(value.reviewOrder)) {
    throw new TypeError('local reading review order is invalid');
  }
  const orderedIds = new Set();
  for (const caseId of value.reviewOrder) {
    if (typeof caseId !== 'string' || orderedIds.has(caseId)) {
      throw new TypeError('local reading review order has a duplicate id');
    }
    const review = reviewsById.get(caseId);
    if (!review || review.decision === 'pending') {
      throw new TypeError('local reading review order is invalid');
    }
    orderedIds.add(caseId);
  }
  const decidedIds = new Set(
    value.reviews
      .filter(({ decision }) => decision !== 'pending')
      .map(({ caseId }) => caseId),
  );
  if (
    orderedIds.size !== decidedIds.size ||
    [...decidedIds].some((caseId) => !orderedIds.has(caseId))
  ) {
    throw new TypeError('local reading review order does not cover decisions');
  }
  return structuredClone(value);
}

function sourceReading(sourceCase) {
  if (Object.hasOwn(sourceCase, 'currentKana')) {
    return {
      kana: sourceCase.currentKana,
      segments: sourceCase.currentSegments,
    };
  }
  return {
    kana: sourceCase.expectedKana,
    segments: sourceCase.expectedSegments,
  };
}

function normalizeSegmentEdits(value, segmentCount) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > segmentCount
  ) {
    throw new TypeError('local reading segment edits are invalid');
  }
  const seen = new Set();
  return value.map((edit) => {
    if (
      !isPlainObject(edit) ||
      Object.keys(edit).length !== 2 ||
      !Object.hasOwn(edit, 'index') ||
      !Object.hasOwn(edit, 'reading') ||
      !Number.isSafeInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= segmentCount ||
      seen.has(edit.index)
    ) {
      throw new TypeError('local reading segment edits are invalid');
    }
    validateReading(edit.reading, 'local reading segment edit');
    seen.add(edit.index);
    return { index: edit.index, reading: edit.reading };
  });
}

export function parseSegmentReadingEdits(value, segmentCount) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    !Number.isSafeInteger(segmentCount) ||
    segmentCount < 1 ||
    segmentCount > MAX_TEXT_LENGTH
  ) {
    throw new TypeError('local reading segment edit expression is invalid');
  }
  const seen = new Set();
  const edits = value.split(',').map((component) => {
    const separator = component.indexOf('=');
    if (separator <= 0) {
      throw new TypeError('local reading segment edit is invalid');
    }
    const indexText = component.slice(0, separator).trim();
    const reading = component.slice(separator + 1).trim();
    if (!/^\d{1,3}$/u.test(indexText)) {
      throw new TypeError('local reading segment index is invalid');
    }
    const oneBasedIndex = Number(indexText);
    if (oneBasedIndex < 1 || oneBasedIndex > segmentCount) {
      throw new TypeError('local reading segment index is invalid');
    }
    if (seen.has(oneBasedIndex)) {
      throw new TypeError('local reading segment edit has a duplicate index');
    }
    validateReading(reading, 'local reading segment edit reading');
    seen.add(oneBasedIndex);
    return { index: oneBasedIndex - 1, reading };
  });
  return normalizeSegmentEdits(edits, segmentCount);
}

export function applyLocalReadingReview(corpusValue, manifest, decision) {
  const corpus = validateLocalReadingCorpus(corpusValue);
  validateLocalReadingReviewManifest(corpus, manifest);
  if (!isPlainObject(decision) || typeof decision.caseId !== 'string') {
    throw new TypeError('local reading review decision is invalid');
  }
  const sourceCase = orderedSourceCases(corpus).find(
    ({ id }) => id === decision.caseId,
  );
  const review = manifest.reviews.find(
    ({ caseId }) => caseId === decision.caseId,
  );
  if (
    !sourceCase ||
    !review ||
    !['approved', 'skipped'].includes(decision.decision)
  ) {
    throw new TypeError('local reading review decision is invalid');
  }
  if (decision.decision === 'skipped') {
    Object.assign(review, emptyReview(review.caseId), { decision: 'skipped' });
  } else {
    if (!COHORT_SET.has(decision.cohort)) {
      throw new TypeError('local reading review cohort is invalid');
    }
    const baseline = sourceReading(sourceCase);
    const expectedSegments = structuredClone(baseline.segments);
    if (decision.segmentEdits !== undefined) {
      const edits = normalizeSegmentEdits(
        decision.segmentEdits,
        expectedSegments.length,
      );
      for (const edit of edits) {
        expectedSegments[edit.index].r = edit.reading;
      }
    }
    const expectedKana = readingFromSegments(expectedSegments);
    Object.assign(review, {
      decision: 'approved',
      cohort: decision.cohort,
      analyzerAddressable: decision.cohort !== 'song-specific',
      expectedKana,
      expectedSegments,
    });
  }
  manifest.reviewOrder = manifest.reviewOrder.filter(
    (caseId) => caseId !== decision.caseId,
  );
  manifest.reviewOrder.push(decision.caseId);
  validateLocalReadingReviewManifest(corpus, manifest);
  return structuredClone(review);
}

export function undoLastLocalReadingReview(corpusValue, manifest) {
  const corpus = validateLocalReadingCorpus(corpusValue);
  validateLocalReadingReviewManifest(corpus, manifest);
  const caseId = manifest.reviewOrder.at(-1);
  if (!caseId) return null;
  const review = manifest.reviews.find((item) => item.caseId === caseId);
  Object.assign(review, emptyReview(caseId));
  manifest.reviewOrder.pop();
  validateLocalReadingReviewManifest(corpus, manifest);
  return caseId;
}

export function summarizeLocalReadingReviews(corpusValue, manifestValue) {
  const corpus = validateLocalReadingCorpus(corpusValue);
  const manifest = validateLocalReadingReviewManifest(corpus, manifestValue);
  const summary = {
    total: manifest.reviews.length,
    pending: 0,
    approved: 0,
    skipped: 0,
    cohorts: Object.fromEntries(COHORTS.map((cohort) => [cohort, 0])),
  };
  for (const review of manifest.reviews) {
    summary[review.decision] += 1;
    if (review.cohort) summary.cohorts[review.cohort] += 1;
  }
  return summary;
}

export function exportLocalReadingBenchmark(corpusValue, manifestValue) {
  const corpus = validateLocalReadingCorpus(corpusValue);
  const manifest = validateLocalReadingReviewManifest(corpus, manifestValue);
  const sourceById = new Map(
    orderedSourceCases(corpus).map((sourceCase) => [sourceCase.id, sourceCase]),
  );
  const approved = manifest.reviews.filter(
    ({ decision }) => decision === 'approved',
  );
  if (approved.length < 100) {
    throw new TypeError('local reading benchmark requires 100 approved cases');
  }
  for (const cohort of REQUIRED_COHORTS) {
    if (!approved.some((review) => review.cohort === cohort)) {
      throw new TypeError(
        `local reading benchmark is missing required cohort: ${cohort}`,
      );
    }
  }
  const analyzerIds = new Set(
    approved.map((review) => sourceById.get(review.caseId).analyzer.id),
  );
  if (analyzerIds.size !== 1) {
    throw new TypeError(
      'local reading benchmark analyzer ids are inconsistent',
    );
  }
  const requiredCohorts = approved.some(
    ({ cohort }) => cohort === 'song-specific',
  )
    ? [...REQUIRED_COHORTS, 'song-specific']
    : [...REQUIRED_COHORTS];
  const benchmark = {
    schemaVersion: 1,
    benchmarkId: 'utawakui-local-reading-benchmark-v1',
    baselineAnalyzerId: [...analyzerIds][0],
    acceptance: {
      minimumCases: 100,
      requiredCohorts,
      minimumCanonicalIntegrityRate: 1,
      maximumAnalysisFailureRate: 0,
      maximumShadowFalsePositiveCount: 0,
    },
    cases: approved.map((review) => {
      const sourceCase = sourceById.get(review.caseId);
      return {
        id: review.caseId,
        cohort: review.cohort,
        analyzerAddressable: review.analyzerAddressable,
        recordingIdentity: sourceCase.recordingIdentity,
        lines: [sourceCase.text],
        targetLineIndex: 0,
        expectedKana: review.expectedKana,
        expectedSegments: structuredClone(review.expectedSegments),
        expectedShadowCorrectionIds: [],
      };
    }),
  };
  return validateLyricsReadingBenchmark(benchmark);
}
