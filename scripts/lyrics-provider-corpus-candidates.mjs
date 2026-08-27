import { createHash } from 'node:crypto';
import {
  LYRICS_CORPUS_STRATA,
  LYRICS_CORPUS_STRATA_BY_ID,
} from './lyrics-provider-corpus-strata.mjs';

const RAW_CANDIDATE_KEYS = new Set([
  'stratum',
  'languageTag',
  'recordingMbid',
  'primaryArtistMbid',
  'workQid',
  'workMbid',
  'title',
  'artist',
  'album',
  'durationMs',
  'firstReleaseDate',
  'listenCount',
  'userCount',
]);
const RAW_CANDIDATE_KEYS_WITH_CLASSIFICATION = new Set([
  ...RAW_CANDIDATE_KEYS,
  'classificationBasis',
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WIKIDATA_ITEM_RE = /^Q[1-9]\d*$/u;
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u;
const MAX_TEXT_LENGTH = 500;
const TARGET_PER_STRATUM = 8;
const MAINSTREAM_TARGET_PER_STRATUM = 7;
const LONG_TAIL_TARGET_PER_STRATUM = 1;
const MINIMUM_FIRST_RELEASE_YEAR = 2010;
const MAX_PRIMARY_ARTIST_PER_STRATUM = 2;
export const CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION = 4;
export const CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_ID = `lyrics-provider-private-candidates-v${CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION}`;
const LEGACY_V2_CONTRACT = Object.freeze({
  targetPerStratum: 20,
  mainstreamPerStratum: 16,
  longTailPerStratum: 4,
  minimumFirstReleaseYear: 2000,
});
const CURRENT_CONTRACT = Object.freeze({
  targetPerStratum: TARGET_PER_STRATUM,
  mainstreamPerStratum: MAINSTREAM_TARGET_PER_STRATUM,
  longTailPerStratum: LONG_TAIL_TARGET_PER_STRATUM,
  minimumFirstReleaseYear: MINIMUM_FIRST_RELEASE_YEAR,
});
const CANDIDATE_SET_ID_RE =
  /^lyrics-provider-private-candidates-v([1-9]\d{0,2})$/u;
const CANDIDATE_ID_RE = /^candidate-[a-f0-9]{16}$/u;
const CANDIDATE_SET_KEYS = new Set([
  'schemaVersion',
  'candidateSetId',
  'status',
  'policy',
  'candidates',
]);
const CANDIDATE_POLICY_KEYS = new Set([
  'targetCount',
  'casesPerStratum',
  'mainstreamCasesPerStratum',
  'longTailCasesPerStratum',
  'minimumFirstReleaseYear',
  'mainstreamSelection',
  'popularityBasis',
  'middlePopularityBand',
  'maxPrimaryArtistPerStratum',
]);
const CANDIDATE_KEYS = new Set([
  'id',
  'stratum',
  'languageTag',
  'catalogReach',
  'reviewStatus',
  'reference',
  'source',
]);
const CANDIDATE_REFERENCE_KEYS = new Set([
  'title',
  'artist',
  'album',
  'durationSeconds',
  'firstReleaseDate',
]);
const CANDIDATE_SOURCE_KEYS = new Set([
  'recordingMbid',
  'primaryArtistMbid',
  'workQid',
  'workMbid',
  'listenCount',
  'userCount',
]);
const CURRENT_CANDIDATE_SOURCE_KEYS = new Set([
  ...CANDIDATE_SOURCE_KEYS,
  'classificationBasis',
]);
const CLASSIFICATION_BASES = new Set(['work-metadata', 'recording-shortlist']);

export { LYRICS_CORPUS_STRATA as CANDIDATE_STRATA };

const STRATA_BY_ID = LYRICS_CORPUS_STRATA_BY_ID;

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

function requiredText(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > MAX_TEXT_LENGTH ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function nullableText(value, label) {
  return value === null ? null : requiredText(value, label);
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function contractForCandidateSetVersion(version) {
  return version === 2 ? LEGACY_V2_CONTRACT : CURRENT_CONTRACT;
}

function recordingDuration(value, label) {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 86_400_000) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function normalizeCandidate(value, index, seenRecordings) {
  const label = `candidate ${index + 1}`;
  const keys = new Set(Object.keys(value ?? {}));
  if (
    !isPlainObject(value) ||
    ![RAW_CANDIDATE_KEYS, RAW_CANDIDATE_KEYS_WITH_CLASSIFICATION].some(
      (expected) =>
        keys.size === expected.size &&
        [...keys].every((key) => expected.has(key)),
    )
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
  const stratum = STRATA_BY_ID.get(value.stratum);
  if (!stratum) throw new TypeError(`${label} stratum is invalid`);
  if (!stratum.allowedLanguageTags.includes(value.languageTag)) {
    throw new TypeError(`${label} language is invalid for its stratum`);
  }
  if (
    typeof value.recordingMbid !== 'string' ||
    !UUID_RE.test(value.recordingMbid)
  ) {
    throw new TypeError(`${label} recording MBID is invalid`);
  }
  const recordingMbid = value.recordingMbid.toLowerCase();
  if (seenRecordings.has(recordingMbid)) {
    throw new TypeError(`${label} has a duplicate recording MBID`);
  }
  seenRecordings.add(recordingMbid);
  if (
    typeof value.primaryArtistMbid !== 'string' ||
    !UUID_RE.test(value.primaryArtistMbid)
  ) {
    throw new TypeError(`${label} primary artist MBID is invalid`);
  }
  if (value.workQid !== null && !WIKIDATA_ITEM_RE.test(value.workQid)) {
    throw new TypeError(`${label} Wikidata work id is invalid`);
  }
  if (value.workMbid !== null && !UUID_RE.test(value.workMbid)) {
    throw new TypeError(`${label} work MBID is invalid`);
  }
  const classificationBasis = value.classificationBasis ?? 'work-metadata';
  if (!CLASSIFICATION_BASES.has(classificationBasis)) {
    throw new TypeError(`${label} classification basis is invalid`);
  }
  if (
    classificationBasis === 'recording-shortlist' &&
    !value.stratum.startsWith('chinese-')
  ) {
    throw new TypeError(
      `${label} recording shortlist classification is limited to Chinese strata`,
    );
  }
  if (
    classificationBasis === 'work-metadata' &&
    value.stratum.startsWith('chinese-') &&
    (value.workQid === null || value.workMbid === null)
  ) {
    throw new TypeError(
      `${label} Chinese stratum requires work-level provenance`,
    );
  }
  if (
    value.firstReleaseDate !== null &&
    (typeof value.firstReleaseDate !== 'string' ||
      !DATE_RE.test(value.firstReleaseDate))
  ) {
    throw new TypeError(`${label} first release date is invalid`);
  }

  return Object.freeze({
    stratum: stratum.id,
    languageTag: value.languageTag,
    recordingMbid,
    primaryArtistMbid: value.primaryArtistMbid.toLowerCase(),
    workQid: value.workQid,
    workMbid: value.workMbid?.toLowerCase() ?? null,
    title: requiredText(value.title, `${label} title`),
    artist: requiredText(value.artist, `${label} artist`),
    album: nullableText(value.album, `${label} album`),
    durationMs: recordingDuration(value.durationMs, `${label} duration`),
    firstReleaseDate: value.firstReleaseDate,
    listenCount: nonnegativeInteger(value.listenCount, `${label} listen count`),
    userCount: nonnegativeInteger(value.userCount, `${label} user count`),
    classificationBasis,
  });
}

function deterministicKey(candidate, version) {
  return createHash('sha256')
    .update(
      `lyrics-provider-candidates-v${version}\0${candidate.stratum}\0${candidate.recordingMbid}`,
    )
    .digest('hex');
}

function isModernRelease(candidate) {
  return (
    candidate.firstReleaseDate !== null &&
    Number(candidate.firstReleaseDate.slice(0, 4)) >= MINIMUM_FIRST_RELEASE_YEAR
  );
}

function selectReachPool(
  pool,
  reach,
  targetCount,
  version,
  artistCounts,
  orderByPopularity = false,
) {
  const ranked = pool
    .map((candidate) => ({
      candidate,
      hash: deterministicKey(candidate, version),
    }))
    .sort((left, right) =>
      orderByPopularity
        ? right.candidate.userCount - left.candidate.userCount ||
          right.candidate.listenCount - left.candidate.listenCount ||
          left.candidate.recordingMbid.localeCompare(
            right.candidate.recordingMbid,
          )
        : left.hash.localeCompare(right.hash),
    );
  const selected = [];
  for (const item of ranked) {
    const key = item.candidate.primaryArtistMbid;
    const currentCount = artistCounts.get(key) ?? 0;
    if (currentCount >= MAX_PRIMARY_ARTIST_PER_STRATUM) continue;
    artistCounts.set(key, currentCount + 1);
    selected.push({ ...item, reach });
    if (selected.length === targetCount) break;
  }
  return selected;
}

function selectStratum(candidates, stratum, version) {
  const popularityOrder = candidates
    .filter(isModernRelease)
    .sort(
      (left, right) =>
        right.userCount - left.userCount ||
        right.listenCount - left.listenCount ||
        left.recordingMbid.localeCompare(right.recordingMbid),
    );
  const bandSize = Math.floor(popularityOrder.length * 0.4);
  const isExactPilotShortlist =
    popularityOrder.length >= TARGET_PER_STRATUM &&
    bandSize < MAINSTREAM_TARGET_PER_STRATUM;
  const mainstreamPool = isExactPilotShortlist
    ? popularityOrder.slice(0, MAINSTREAM_TARGET_PER_STRATUM)
    : popularityOrder.slice(0, bandSize);
  const longTailPool = isExactPilotShortlist
    ? popularityOrder.slice(MAINSTREAM_TARGET_PER_STRATUM)
    : popularityOrder.slice(-bandSize);
  const artistCounts = new Map();
  const selected = [
    ...selectReachPool(
      mainstreamPool,
      'mainstream',
      MAINSTREAM_TARGET_PER_STRATUM,
      version,
      artistCounts,
      true,
    ),
    ...selectReachPool(
      longTailPool,
      'long-tail',
      LONG_TAIL_TARGET_PER_STRATUM,
      version,
      artistCounts,
    ),
  ];
  if (selected.length !== TARGET_PER_STRATUM) {
    throw new TypeError(
      `not enough eligible candidates for ${stratum.id} after reach and artist limits`,
    );
  }
  return selected;
}

function projectCandidate(item) {
  const { candidate, hash, reach } = item;
  return Object.freeze({
    id: `candidate-${hash.slice(0, 16)}`,
    stratum: candidate.stratum,
    languageTag: candidate.languageTag,
    catalogReach: reach,
    reviewStatus: 'needs-review',
    reference: Object.freeze({
      title: candidate.title,
      artist: candidate.artist,
      album: candidate.album,
      durationSeconds: Math.round(candidate.durationMs / 1000),
      firstReleaseDate: candidate.firstReleaseDate,
    }),
    source: Object.freeze({
      recordingMbid: candidate.recordingMbid,
      primaryArtistMbid: candidate.primaryArtistMbid,
      workQid: candidate.workQid,
      workMbid: candidate.workMbid,
      listenCount: candidate.listenCount,
      userCount: candidate.userCount,
      classificationBasis: candidate.classificationBasis,
    }),
  });
}

export function validatePrivateLyricsCandidateSet(value) {
  assertExactKeys(value, CANDIDATE_SET_KEYS, 'private candidate set');
  if (value.schemaVersion !== 1) {
    throw new TypeError('private candidate set schema version is invalid');
  }
  const idMatch = CANDIDATE_SET_ID_RE.exec(value.candidateSetId || '');
  if (!idMatch) throw new TypeError('private candidate set id is invalid');
  const version = Number(idMatch[1]);
  const contract = contractForCandidateSetVersion(version);
  if (value.status !== 'needs-review') {
    throw new TypeError('private candidate set status is invalid');
  }
  assertExactKeys(value.policy, CANDIDATE_POLICY_KEYS, 'candidate policy');
  const expectedPolicy = {
    targetCount: LYRICS_CORPUS_STRATA.length * contract.targetPerStratum,
    casesPerStratum: contract.targetPerStratum,
    mainstreamCasesPerStratum: contract.mainstreamPerStratum,
    longTailCasesPerStratum: contract.longTailPerStratum,
    minimumFirstReleaseYear: contract.minimumFirstReleaseYear,
    mainstreamSelection: 'highest-user-count-then-listen-count',
    popularityBasis: 'listenbrainz-users-within-stratum',
    middlePopularityBand: 'excluded',
    maxPrimaryArtistPerStratum: MAX_PRIMARY_ARTIST_PER_STRATUM,
  };
  if (
    Object.entries(expectedPolicy).some(
      ([key, expected]) => value.policy[key] !== expected,
    )
  ) {
    throw new TypeError('private candidate set policy is invalid');
  }
  if (
    !Array.isArray(value.candidates) ||
    value.candidates.length !== expectedPolicy.targetCount
  ) {
    throw new TypeError(
      `private candidate set must contain exactly ${expectedPolicy.targetCount} candidates`,
    );
  }

  const ids = new Set();
  const recordings = new Set();
  const artistCounts = new Map();
  const distribution = new Map(
    LYRICS_CORPUS_STRATA.flatMap(({ id }) =>
      ['mainstream', 'long-tail'].map((reach) => [`${id}\0${reach}`, 0]),
    ),
  );
  let previousHash = null;
  for (const [index, candidate] of value.candidates.entries()) {
    const label = `private candidate ${index + 1}`;
    assertExactKeys(candidate, CANDIDATE_KEYS, label);
    if (!CANDIDATE_ID_RE.test(candidate.id || '')) {
      throw new TypeError(`${label} id is invalid`);
    }
    if (ids.has(candidate.id)) {
      throw new TypeError(`${label} has a duplicate candidate id`);
    }
    ids.add(candidate.id);
    const stratum = STRATA_BY_ID.get(candidate.stratum);
    if (!stratum) throw new TypeError(`${label} stratum is invalid`);
    if (!stratum.allowedLanguageTags.includes(candidate.languageTag)) {
      throw new TypeError(`${label} language is invalid for its stratum`);
    }
    if (!new Set(['mainstream', 'long-tail']).has(candidate.catalogReach)) {
      throw new TypeError(`${label} catalog reach is invalid`);
    }
    if (candidate.reviewStatus !== 'needs-review') {
      throw new TypeError(`${label} review status is invalid`);
    }
    assertExactKeys(
      candidate.reference,
      CANDIDATE_REFERENCE_KEYS,
      `${label} reference`,
    );
    requiredText(candidate.reference.title, `${label} title`);
    requiredText(candidate.reference.artist, `${label} artist`);
    nullableText(candidate.reference.album, `${label} album`);
    if (
      !Number.isSafeInteger(candidate.reference.durationSeconds) ||
      candidate.reference.durationSeconds < 1 ||
      candidate.reference.durationSeconds > 86_400
    ) {
      throw new TypeError(`${label} duration is invalid`);
    }
    if (
      candidate.reference.firstReleaseDate !== null &&
      (typeof candidate.reference.firstReleaseDate !== 'string' ||
        !DATE_RE.test(candidate.reference.firstReleaseDate))
    ) {
      throw new TypeError(`${label} first release date is invalid`);
    }
    if (
      candidate.reference.firstReleaseDate === null ||
      Number(candidate.reference.firstReleaseDate.slice(0, 4)) <
        contract.minimumFirstReleaseYear
    ) {
      throw new TypeError(
        `${label} first release must be ${contract.minimumFirstReleaseYear} or later`,
      );
    }
    assertExactKeys(
      candidate.source,
      version === 2 ? CANDIDATE_SOURCE_KEYS : CURRENT_CANDIDATE_SOURCE_KEYS,
      `${label} source`,
    );
    if (
      !UUID_RE.test(candidate.source.recordingMbid || '') ||
      candidate.source.recordingMbid !==
        candidate.source.recordingMbid.toLowerCase()
    ) {
      throw new TypeError(`${label} recording MBID is invalid`);
    }
    if (recordings.has(candidate.source.recordingMbid)) {
      throw new TypeError(`${label} has a duplicate recording MBID`);
    }
    recordings.add(candidate.source.recordingMbid);
    if (
      !UUID_RE.test(candidate.source.primaryArtistMbid || '') ||
      candidate.source.primaryArtistMbid !==
        candidate.source.primaryArtistMbid.toLowerCase()
    ) {
      throw new TypeError(`${label} primary artist MBID is invalid`);
    }
    if (
      candidate.source.workQid !== null &&
      !WIKIDATA_ITEM_RE.test(candidate.source.workQid)
    ) {
      throw new TypeError(`${label} Wikidata work id is invalid`);
    }
    if (
      candidate.source.workMbid !== null &&
      (!UUID_RE.test(candidate.source.workMbid) ||
        candidate.source.workMbid !== candidate.source.workMbid.toLowerCase())
    ) {
      throw new TypeError(`${label} work MBID is invalid`);
    }
    if (version !== 2) {
      if (!CLASSIFICATION_BASES.has(candidate.source.classificationBasis)) {
        throw new TypeError(`${label} classification basis is invalid`);
      }
      if (
        candidate.source.classificationBasis === 'recording-shortlist' &&
        !candidate.stratum.startsWith('chinese-')
      ) {
        throw new TypeError(
          `${label} recording shortlist classification is limited to Chinese strata`,
        );
      }
      if (
        candidate.source.classificationBasis === 'work-metadata' &&
        candidate.stratum.startsWith('chinese-') &&
        (candidate.source.workQid === null ||
          candidate.source.workMbid === null)
      ) {
        throw new TypeError(
          `${label} Chinese stratum requires work-level provenance`,
        );
      }
    }
    nonnegativeInteger(candidate.source.listenCount, `${label} listen count`);
    nonnegativeInteger(candidate.source.userCount, `${label} user count`);

    const hash = deterministicKey(
      {
        stratum: candidate.stratum,
        recordingMbid: candidate.source.recordingMbid.toLowerCase(),
      },
      version,
    );
    if (candidate.id !== `candidate-${hash.slice(0, 16)}`) {
      throw new TypeError(`${label} id does not match its source identity`);
    }
    if (previousHash !== null && previousHash.localeCompare(hash) >= 0) {
      throw new TypeError('private candidate set order is invalid');
    }
    previousHash = hash;
    const distributionKey = `${candidate.stratum}\0${candidate.catalogReach}`;
    distribution.set(
      distributionKey,
      (distribution.get(distributionKey) || 0) + 1,
    );
    const artistKey = `${candidate.stratum}\0${candidate.source.primaryArtistMbid.toLowerCase()}`;
    const artistCount = (artistCounts.get(artistKey) || 0) + 1;
    if (artistCount > MAX_PRIMARY_ARTIST_PER_STRATUM) {
      throw new TypeError(
        'private candidate set exceeds its primary artist limit',
      );
    }
    artistCounts.set(artistKey, artistCount);
  }
  if (
    LYRICS_CORPUS_STRATA.some(
      ({ id }) =>
        distribution.get(`${id}\0mainstream`) !==
          contract.mainstreamPerStratum ||
        distribution.get(`${id}\0long-tail`) !== contract.longTailPerStratum,
    )
  ) {
    throw new TypeError(
      `private candidate set must contain ${contract.mainstreamPerStratum} mainstream and ${contract.longTailPerStratum} long-tail candidate${contract.longTailPerStratum === 1 ? '' : 's'} per stratum`,
    );
  }
  return structuredClone(value);
}

export function buildPrivateCandidateSet(rawCandidates, options = {}) {
  if (!Array.isArray(rawCandidates)) {
    throw new TypeError('raw candidates must be an array');
  }
  const version = options.candidateSetVersion;
  if (!Number.isSafeInteger(version) || version < 1 || version > 999) {
    throw new TypeError('candidate set version is invalid');
  }
  if (version === 2) {
    throw new TypeError('candidate set version 2 is reserved for legacy data');
  }
  const seenRecordings = new Set();
  const normalized = rawCandidates.map((candidate, index) =>
    normalizeCandidate(candidate, index, seenRecordings),
  );
  const selected = LYRICS_CORPUS_STRATA.flatMap((stratum) =>
    selectStratum(
      normalized.filter((candidate) => candidate.stratum === stratum.id),
      stratum,
      version,
    ),
  )
    .sort((left, right) => left.hash.localeCompare(right.hash))
    .map(projectCandidate);

  const result = Object.freeze({
    schemaVersion: 1,
    candidateSetId: `lyrics-provider-private-candidates-v${version}`,
    status: 'needs-review',
    policy: Object.freeze({
      targetCount: LYRICS_CORPUS_STRATA.length * TARGET_PER_STRATUM,
      casesPerStratum: TARGET_PER_STRATUM,
      mainstreamCasesPerStratum: MAINSTREAM_TARGET_PER_STRATUM,
      longTailCasesPerStratum: LONG_TAIL_TARGET_PER_STRATUM,
      minimumFirstReleaseYear: MINIMUM_FIRST_RELEASE_YEAR,
      mainstreamSelection: 'highest-user-count-then-listen-count',
      popularityBasis: 'listenbrainz-users-within-stratum',
      middlePopularityBand: 'excluded',
      maxPrimaryArtistPerStratum: MAX_PRIMARY_ARTIST_PER_STRATUM,
    }),
    candidates: Object.freeze(selected),
  });
  validatePrivateLyricsCandidateSet(result);
  return result;
}
