import { createHash } from 'node:crypto';

import {
  CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_ID,
  validatePrivateLyricsCandidateSet,
} from './lyrics-provider-corpus-candidates.mjs';
import { LYRICS_CORPUS_STRATA_BY_ID } from './lyrics-provider-corpus-strata.mjs';
import { validatePrivateLyricsCorpus } from './lyrics-provider-corpus-runner.mjs';
import { FIXED_LYRICS_PROVIDER_DESCRIPTORS } from './lyrics-provider-probe-registry.mjs';

const REVIEW_MANIFEST_KEYS = new Set([
  'schemaVersion',
  'candidateSetId',
  'candidateSetSha256',
  'status',
  'reviews',
]);
const REVIEW_KEYS = new Set([
  'candidateId',
  'decision',
  'rejectionReason',
  'stratum',
  'languageTag',
  'version',
  'eraTag',
  'versionTrap',
  'reference',
]);
const REFERENCE_KEYS = new Set([
  'title',
  'artist',
  'album',
  'durationSeconds',
  'version',
]);
const DECISIONS = new Set(['pending', 'approved', 'rejected']);
const REJECTION_REASONS = new Set([
  'language-mismatch',
  'genre-mismatch',
  'credit-mismatch',
  'version-ambiguous',
  'metadata-insufficient',
  'duplicate-recording',
  'release-before-2010',
  'other',
]);
const LEGACY_V2_REJECTION_REASONS = new Set([
  ...REJECTION_REASONS,
  'release-before-2000',
]);
const VERSION_TAGS = new Set([
  'studio',
  'live',
  'remaster',
  'cover',
  'remix',
  'acoustic',
]);
const APPROVED_ERA_TAG = 'recent-release';
const CANDIDATE_ID_RE = /^candidate-[a-f0-9]{16}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const MAX_TEXT_LENGTH = 256;

export const PRIVATE_LYRICS_CORPUS_ACCEPTANCE = Object.freeze({
  minimumCases: 40,
  requiredTags: Object.freeze([
    Object.freeze({ tag: 'chinese-rap', minimumCases: 8 }),
    Object.freeze({ tag: 'chinese-pop', minimumCases: 8 }),
    Object.freeze({ tag: 'english-catalog', minimumCases: 8 }),
    Object.freeze({ tag: 'japanese-catalog', minimumCases: 8 }),
    Object.freeze({ tag: 'korean-catalog', minimumCases: 8 }),
  ]),
  minimumReviewedMatches: 20,
  minimumRequestSuccessRate: 0.95,
  maximumFalseMatchRate: 0.01,
  minimumIncrementalCoverageRate: 0.1,
  minimumUniqueValidT2Count: 10,
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
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== expectedKeys.size ||
    Object.keys(value).some((key) => !expectedKeys.has(key))
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
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

export function privateCandidateSetSha256(value) {
  const candidateSet = validatePrivateLyricsCandidateSet(value);
  return createHash('sha256').update(canonicalJson(candidateSet)).digest('hex');
}

function requiredText(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_TEXT_LENGTH ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function validateReference(value, review) {
  assertExactKeys(value, REFERENCE_KEYS, 'approved review reference');
  requiredText(value.title, 'approved review title');
  requiredText(value.artist, 'approved review artist');
  if (value.album !== null) requiredText(value.album, 'approved review album');
  if (
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds <= 0 ||
    value.durationSeconds > 86_400
  ) {
    throw new TypeError('approved review duration is invalid');
  }
  if (!VERSION_TAGS.has(value.version)) {
    throw new TypeError('approved review reference version is invalid');
  }
  if (review.version !== value.version) {
    throw new TypeError(
      'approved review version must match its reference version',
    );
  }
}

function requireNullReviewFields(review) {
  if (
    review.stratum !== null ||
    review.languageTag !== null ||
    review.version !== null ||
    review.eraTag !== null ||
    review.versionTrap !== null ||
    review.reference !== null
  ) {
    throw new TypeError('non-approved review fields must remain null');
  }
}

function validateReview(review, candidate, rejectionReasons) {
  assertExactKeys(review, REVIEW_KEYS, 'private candidate review');
  if (!CANDIDATE_ID_RE.test(review.candidateId || '')) {
    throw new TypeError('private candidate review id is invalid');
  }
  if (!DECISIONS.has(review.decision)) {
    throw new TypeError('private candidate review decision is invalid');
  }
  if (review.decision === 'pending') {
    if (review.rejectionReason !== null) {
      throw new TypeError('pending review rejection reason must remain null');
    }
    requireNullReviewFields(review);
    return;
  }
  if (review.decision === 'rejected') {
    if (!rejectionReasons.has(review.rejectionReason)) {
      throw new TypeError('rejected review rejection reason is invalid');
    }
    requireNullReviewFields(review);
    return;
  }
  if (review.rejectionReason !== null) {
    throw new TypeError('approved review rejection reason must remain null');
  }
  if (review.stratum !== candidate.stratum) {
    throw new TypeError('approved review stratum must confirm its candidate');
  }
  const stratum = LYRICS_CORPUS_STRATA_BY_ID.get(review.stratum);
  if (!stratum?.allowedLanguageTags.includes(review.languageTag)) {
    throw new TypeError('approved review language is invalid for its stratum');
  }
  if (!VERSION_TAGS.has(review.version)) {
    throw new TypeError('approved review version is invalid');
  }
  if (review.eraTag !== APPROVED_ERA_TAG) {
    throw new TypeError('approved review era tag must confirm recent-release');
  }
  if (typeof review.versionTrap !== 'boolean') {
    throw new TypeError('approved review version trap is invalid');
  }
  validateReference(review.reference, review);
}

export function createPrivateLyricsReviewManifest(value) {
  const candidateSet = validatePrivateLyricsCandidateSet(value);
  return {
    schemaVersion: 1,
    candidateSetId: candidateSet.candidateSetId,
    candidateSetSha256: privateCandidateSetSha256(candidateSet),
    status: 'in-review',
    reviews: candidateSet.candidates.map(({ id }) => ({
      candidateId: id,
      decision: 'pending',
      rejectionReason: null,
      stratum: null,
      languageTag: null,
      version: null,
      eraTag: null,
      versionTrap: null,
      reference: null,
    })),
  };
}

export function validatePrivateLyricsReviewManifest(candidateValue, value) {
  const candidateSet = validatePrivateLyricsCandidateSet(candidateValue);
  assertExactKeys(value, REVIEW_MANIFEST_KEYS, 'private review manifest');
  if (value.schemaVersion !== 1) {
    throw new TypeError('private review manifest schema version is invalid');
  }
  if (value.candidateSetId !== candidateSet.candidateSetId) {
    throw new TypeError('private review manifest candidate set id is invalid');
  }
  if (
    !SHA256_RE.test(value.candidateSetSha256 || '') ||
    value.candidateSetSha256 !== privateCandidateSetSha256(candidateSet)
  ) {
    throw new TypeError(
      'private review manifest candidate set digest is invalid',
    );
  }
  if (value.status !== 'in-review') {
    throw new TypeError('private review manifest status is invalid');
  }
  if (
    !Array.isArray(value.reviews) ||
    value.reviews.length !== candidateSet.candidates.length
  ) {
    throw new TypeError(
      'private review manifest requires one review per candidate',
    );
  }
  const candidatesById = new Map(
    candidateSet.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const rejectionReasons = candidateSet.candidateSetId.endsWith('-v2')
    ? LEGACY_V2_REJECTION_REASONS
    : REJECTION_REASONS;
  const reviewedIds = new Set();
  for (const review of value.reviews) {
    if (reviewedIds.has(review?.candidateId)) {
      throw new TypeError(
        'private review manifest has a duplicate candidate id',
      );
    }
    const candidate = candidatesById.get(review?.candidateId);
    if (!candidate) {
      throw new TypeError(
        'private review manifest references an unknown candidate',
      );
    }
    reviewedIds.add(review.candidateId);
    validateReview(review, candidate, rejectionReasons);
  }
  if (reviewedIds.size !== candidatesById.size) {
    throw new TypeError(
      'private review manifest requires one review per candidate',
    );
  }
  return structuredClone(value);
}

function corpusId(candidateSetId) {
  const version = candidateSetId.match(/-v([1-9]\d{0,2})$/u)?.[1];
  if (!version) throw new TypeError('private candidate set version is invalid');
  return `lyrics-provider-private-v${version}`;
}

export function exportReviewedLyricsCorpus(candidateValue, reviewValue) {
  const candidateSet = validatePrivateLyricsCandidateSet(candidateValue);
  const manifest = validatePrivateLyricsReviewManifest(
    candidateSet,
    reviewValue,
  );
  if (candidateSet.candidateSetId !== CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_ID) {
    throw new TypeError(
      candidateSet.candidateSetId.endsWith('-v2')
        ? 'legacy v2 candidate reviews cannot be exported as the current pilot'
        : 'only the current v4 candidate reviews can be exported',
    );
  }
  if (manifest.reviews.some(({ decision }) => decision !== 'approved')) {
    throw new TypeError(
      'all 40 candidate reviews must be approved before export',
    );
  }
  const reviewsById = new Map(
    manifest.reviews.map((review) => [review.candidateId, review]),
  );
  const cases = candidateSet.candidates.map((candidate, index) => {
    const review = reviewsById.get(candidate.id);
    const tags = [
      review.languageTag,
      candidate.stratum,
      candidate.catalogReach,
      review.version,
    ];
    tags.push(review.eraTag);
    if (review.versionTrap) tags.push('version-trap');
    return {
      id: `case-${String(index + 1).padStart(3, '0')}`,
      tags,
      goldStatus: 'reviewed',
      reference: structuredClone(review.reference),
    };
  });
  const corpus = {
    schemaVersion: 1,
    corpusId: corpusId(candidateSet.candidateSetId),
    baselineProviderId: 'lrclib',
    providers: structuredClone(FIXED_LYRICS_PROVIDER_DESCRIPTORS),
    acceptance: structuredClone(PRIVATE_LYRICS_CORPUS_ACCEPTANCE),
    cases,
  };
  return validatePrivateLyricsCorpus(corpus);
}
