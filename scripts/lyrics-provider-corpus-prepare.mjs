import { createHash } from 'node:crypto';

import { buildPrivateCandidateSet } from './lyrics-provider-corpus-candidates.mjs';
import {
  collectMusicBrainzRecordingCandidates,
  fetchListenBrainzRecordingPopularity,
  mergeRecordingPopularity,
} from './lyrics-provider-corpus-metadata.mjs';
import { fetchWikidataCandidateSeeds } from './lyrics-provider-corpus-sources.mjs';
import {
  LYRICS_CORPUS_STRATA,
  LYRICS_CORPUS_STRATA_BY_ID,
} from './lyrics-provider-corpus-strata.mjs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEFAULT_MAXIMUM_SEEDS_PER_STRATUM = 100;
const DEFAULT_MAXIMUM_RECORDINGS_PER_STRATUM = 500;

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function validateVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999) {
    throw new TypeError('candidate preparation version is invalid');
  }
  return value;
}

function validateSeed(seed) {
  if (
    !isPlainObject(seed) ||
    Object.keys(seed).length !== 4 ||
    !LYRICS_CORPUS_STRATA_BY_ID.has(seed.stratum) ||
    !['artist', 'work'].includes(seed.seedType) ||
    typeof seed.wikidataId !== 'string' ||
    !/^Q[1-9]\d*$/u.test(seed.wikidataId) ||
    typeof seed.musicbrainzId !== 'string' ||
    !UUID_RE.test(seed.musicbrainzId)
  ) {
    throw new TypeError('candidate discovery seed is invalid');
  }
  return seed;
}

function seedHash(seed, version) {
  return createHash('sha256')
    .update(
      `lyrics-provider-seeds-v${version}\0${seed.stratum}\0${seed.seedType}\0${seed.musicbrainzId.toLowerCase()}`,
    )
    .digest('hex');
}

export function selectDeterministicDiscoverySeeds(seeds, options = {}) {
  if (!Array.isArray(seeds)) {
    throw new TypeError('candidate discovery seeds must be an array');
  }
  const version = validateVersion(options.version);
  const maximumPerStratum =
    options.maximumPerStratum ?? DEFAULT_MAXIMUM_SEEDS_PER_STRATUM;
  if (
    !Number.isSafeInteger(maximumPerStratum) ||
    maximumPerStratum < 1 ||
    maximumPerStratum > 250
  ) {
    throw new TypeError('candidate discovery seed limit is invalid');
  }
  const normalized = seeds.map(validateSeed);
  const selected = [];
  for (const { id } of LYRICS_CORPUS_STRATA) {
    const deduplicated = new Map();
    for (const seed of normalized.filter((item) => item.stratum === id)) {
      const key = seed.musicbrainzId.toLowerCase();
      const candidate = {
        ...seed,
        musicbrainzId: key,
      };
      const existing = deduplicated.get(key);
      if (
        !existing ||
        candidate.seedType.localeCompare(existing.seedType) < 0 ||
        (candidate.seedType === existing.seedType &&
          candidate.wikidataId.localeCompare(existing.wikidataId, 'en', {
            numeric: true,
          }) < 0)
      ) {
        deduplicated.set(key, candidate);
      }
    }
    selected.push(
      ...[...deduplicated.values()]
        .map((seed) => ({ seed, hash: seedHash(seed, version) }))
        .sort((left, right) => left.hash.localeCompare(right.hash))
        .slice(0, maximumPerStratum)
        .map(({ seed }) => seed),
    );
  }
  return selected;
}

export function excludeCrossStratumRecordingConflicts(recordings) {
  if (!Array.isArray(recordings)) {
    throw new TypeError('recording candidates must be an array');
  }
  const strataByRecording = new Map();
  for (const recording of recordings) {
    if (
      !isPlainObject(recording) ||
      !LYRICS_CORPUS_STRATA_BY_ID.has(recording.stratum) ||
      typeof recording.recordingMbid !== 'string' ||
      !UUID_RE.test(recording.recordingMbid)
    ) {
      throw new TypeError('recording candidate identity is invalid');
    }
    const mbid = recording.recordingMbid.toLowerCase();
    const strata = strataByRecording.get(mbid) ?? new Set();
    strata.add(recording.stratum);
    strataByRecording.set(mbid, strata);
  }
  const seen = new Set();
  return recordings.filter((recording) => {
    const mbid = recording.recordingMbid.toLowerCase();
    if (strataByRecording.get(mbid).size !== 1 || seen.has(mbid)) return false;
    seen.add(mbid);
    return true;
  });
}

export function selectDeterministicRecordingPool(recordings, options = {}) {
  if (!Array.isArray(recordings)) {
    throw new TypeError('recording candidates must be an array');
  }
  const version = validateVersion(options.version);
  const maximumPerStratum =
    options.maximumPerStratum ?? DEFAULT_MAXIMUM_RECORDINGS_PER_STRATUM;
  if (
    !Number.isSafeInteger(maximumPerStratum) ||
    maximumPerStratum < 40 ||
    maximumPerStratum > 2_000
  ) {
    throw new TypeError('recording candidate pool limit is invalid');
  }
  return LYRICS_CORPUS_STRATA.flatMap(({ id }) =>
    recordings
      .filter((recording) => {
        if (
          !isPlainObject(recording) ||
          !LYRICS_CORPUS_STRATA_BY_ID.has(recording.stratum) ||
          typeof recording.recordingMbid !== 'string' ||
          !UUID_RE.test(recording.recordingMbid)
        ) {
          throw new TypeError('recording candidate identity is invalid');
        }
        return recording.stratum === id;
      })
      .map((recording) => ({
        recording,
        hash: createHash('sha256')
          .update(
            `lyrics-provider-recordings-v${version}\0${id}\0${recording.recordingMbid.toLowerCase()}`,
          )
          .digest('hex'),
      }))
      .sort((left, right) => left.hash.localeCompare(right.hash))
      .slice(0, maximumPerStratum)
      .map(({ recording }) => recording),
  );
}

function progressCallback(value) {
  if (value === undefined) return () => undefined;
  if (typeof value !== 'function') {
    throw new TypeError('candidate preparation progress callback is invalid');
  }
  return value;
}

async function discoverSelectedSeeds(options, maximumPerStratum, onProgress) {
  const fetchWikidataSeeds =
    options.fetchWikidataSeeds ?? fetchWikidataCandidateSeeds;
  if (typeof fetchWikidataSeeds !== 'function') {
    throw new TypeError('candidate discovery dependency is invalid');
  }
  const discoveredSeeds = [];
  for (const { id } of LYRICS_CORPUS_STRATA) {
    const seeds = await fetchWikidataSeeds(id);
    if (!Array.isArray(seeds)) {
      throw new TypeError('candidate discovery returned invalid seeds');
    }
    discoveredSeeds.push(...seeds);
    onProgress({ stage: 'wikidata', count: discoveredSeeds.length });
  }
  return selectDeterministicDiscoverySeeds(discoveredSeeds, {
    version: options.version,
    maximumPerStratum,
  });
}

export async function preparePrivateLyricsCandidateSet(options = {}) {
  const version = validateVersion(options.version);
  const collectMusicBrainz =
    options.collectMusicBrainz ?? collectMusicBrainzRecordingCandidates;
  const fetchListenBrainz =
    options.fetchListenBrainz ?? fetchListenBrainzRecordingPopularity;
  if (
    typeof collectMusicBrainz !== 'function' ||
    typeof fetchListenBrainz !== 'function'
  ) {
    throw new TypeError('candidate preparation dependencies are invalid');
  }
  const onProgress = progressCallback(options.onProgress);
  const selectedSeeds = await discoverSelectedSeeds(
    options,
    options.maximumSeedsPerStratum ?? DEFAULT_MAXIMUM_SEEDS_PER_STRATUM,
    onProgress,
  );
  const recordings = await collectMusicBrainz(selectedSeeds, {
    maxPagesPerSeed: options.maxPagesPerSeed ?? 1,
  });
  const unambiguousRecordings =
    excludeCrossStratumRecordingConflicts(recordings);
  const recordingPool = selectDeterministicRecordingPool(
    unambiguousRecordings,
    {
      version,
      maximumPerStratum:
        options.maximumRecordingsPerStratum ??
        DEFAULT_MAXIMUM_RECORDINGS_PER_STRATUM,
    },
  );
  onProgress({ stage: 'musicbrainz', count: recordingPool.length });
  if (recordingPool.length < 1) {
    throw new TypeError('candidate recording metadata is empty');
  }
  const popularity = await fetchListenBrainz(
    recordingPool.map(({ recordingMbid }) => recordingMbid),
  );
  const eligible = mergeRecordingPopularity(recordingPool, popularity);
  onProgress({ stage: 'listenbrainz', count: eligible.length });
  const result = buildPrivateCandidateSet(eligible, {
    candidateSetVersion: version,
  });
  onProgress({ stage: 'selected', count: result.candidates.length });
  return result;
}

function selectSmokeRecordings(recordings, version) {
  return LYRICS_CORPUS_STRATA.flatMap(({ id }) =>
    recordings
      .filter((recording) => recording.stratum === id)
      .map((recording) => ({
        recording,
        hash: createHash('sha256')
          .update(
            `lyrics-provider-smoke-v${version}\0${id}\0${recording.recordingMbid}`,
          )
          .digest('hex'),
      }))
      .sort((left, right) => left.hash.localeCompare(right.hash))
      .slice(0, 10)
      .map(({ recording }) => recording),
  );
}

export async function smokeLyricsProviderCandidateSources(options = {}) {
  const version = validateVersion(options.version);
  const collectMusicBrainz =
    options.collectMusicBrainz ?? collectMusicBrainzRecordingCandidates;
  const fetchListenBrainz =
    options.fetchListenBrainz ?? fetchListenBrainzRecordingPopularity;
  if (
    typeof collectMusicBrainz !== 'function' ||
    typeof fetchListenBrainz !== 'function'
  ) {
    throw new TypeError('candidate smoke dependencies are invalid');
  }
  const selectedSeeds = await discoverSelectedSeeds(
    options,
    1,
    () => undefined,
  );
  if (
    LYRICS_CORPUS_STRATA.some(
      ({ id }) =>
        selectedSeeds.filter((seed) => seed.stratum === id).length !== 1,
    )
  ) {
    throw new TypeError(
      'candidate smoke requires every stratum to have a seed',
    );
  }
  const recordings = excludeCrossStratumRecordingConflicts(
    await collectMusicBrainz(selectedSeeds, { maxPagesPerSeed: 1 }),
  );
  const smokeRecordings = selectSmokeRecordings(recordings, version);
  if (
    LYRICS_CORPUS_STRATA.some(
      ({ id }) =>
        !smokeRecordings.some((recording) => recording.stratum === id),
    )
  ) {
    throw new TypeError(
      'candidate smoke requires every stratum to have a recording',
    );
  }
  const popularity = await fetchListenBrainz(
    smokeRecordings.map(({ recordingMbid }) => recordingMbid),
  );
  const availableCount = popularity.filter(
    ({ listenCount, userCount }) => listenCount !== null && userCount !== null,
  ).length;
  return {
    seedCount: selectedSeeds.length,
    recordingCount: smokeRecordings.length,
    popularityAvailableCount: availableCount,
    popularityUnavailableCount: popularity.length - availableCount,
  };
}
