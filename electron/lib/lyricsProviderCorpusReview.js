'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 256;
const CANDIDATE_ID_RE = /^candidate-[a-f0-9]{16}$/u;
const LOOKUP_ACTIONS = new Set([
  'copy-candidate-id',
  'copy-recording-mbid',
  'copy-artist-title',
  'open-musicbrainz-recording',
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
const STRATA = Object.freeze([
  Object.freeze({
    id: 'chinese-rap',
    label: '中文饒舌',
    languages: new Set(['mandarin', 'cantonese', 'multilingual']),
  }),
  Object.freeze({
    id: 'chinese-pop',
    label: '中文流行',
    languages: new Set(['mandarin', 'cantonese', 'multilingual']),
  }),
  Object.freeze({
    id: 'english-catalog',
    label: '英文',
    languages: new Set(['english', 'multilingual']),
  }),
  Object.freeze({
    id: 'japanese-catalog',
    label: '日文',
    languages: new Set(['japanese', 'multilingual']),
  }),
  Object.freeze({
    id: 'korean-catalog',
    label: '韓文',
    languages: new Set(['korean', 'multilingual']),
  }),
]);
const STRATA_BY_ID = new Map(STRATA.map((stratum) => [stratum.id, stratum]));

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, keys, label) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${label} is invalid`);
  }
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
  return value.trim();
}

function nullableText(value, label) {
  if (value === null) return null;
  return requiredText(value, label);
}

function fixedPaths(workspaceRoot) {
  const root = fs.realpathSync(workspaceRoot);
  const directory = path.join(root, '.benchmarks', 'lyrics-provider');
  return Object.freeze({
    root,
    directory,
    candidates: path.join(directory, 'candidates.json'),
    reviews: path.join(directory, 'reviews.json'),
    corpus: path.join(directory, 'corpus.json'),
  });
}

async function loadLyricsProviderReviewContract(workspaceRoot) {
  const root = fs.realpathSync(workspaceRoot);
  const [candidateContract, reviewContract] = await Promise.all([
    import(
      pathToFileURL(
        path.join(root, 'scripts', 'lyrics-provider-corpus-candidates.mjs'),
      ).href
    ),
    import(
      pathToFileURL(
        path.join(root, 'scripts', 'lyrics-provider-corpus-review.mjs'),
      ).href
    ),
  ]);
  return Object.freeze({
    currentCandidateSetId:
      candidateContract.CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_ID,
    validatePrivateLyricsCandidateSet:
      candidateContract.validatePrivateLyricsCandidateSet,
    validatePrivateLyricsReviewManifest:
      reviewContract.validatePrivateLyricsReviewManifest,
    exportReviewedLyricsCorpus: reviewContract.exportReviewedLyricsCorpus,
  });
}

function assertSafeDirectory(paths) {
  for (const current of [
    paths.root,
    path.join(paths.root, '.benchmarks'),
    paths.directory,
  ]) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new TypeError('private lyrics review directory is unsafe');
    }
  }
}

function readBoundedJson(filePath, label) {
  let descriptor;
  try {
    const pathStat = fs.lstatSync(filePath);
    if (
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      pathStat.size > MAX_ARTIFACT_BYTES
    ) {
      throw new TypeError(`${label} is unsafe`);
    }
    descriptor = fs.openSync(filePath, 'r');
    const openedStat = fs.fstatSync(descriptor);
    if (
      !openedStat.isFile() ||
      openedStat.size > MAX_ARTIFACT_BYTES ||
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino
    ) {
      throw new TypeError(`${label} is unsafe`);
    }
    const buffer = Buffer.allocUnsafe(MAX_ARTIFACT_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null,
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_ARTIFACT_BYTES) {
      throw new TypeError(`${label} exceeds the size limit`);
    }
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function payloadBuffer(value) {
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (payload.length > MAX_ARTIFACT_BYTES) {
    throw new TypeError(
      'private lyrics review artifact exceeds the size limit',
    );
  }
  return payload;
}

function writeTemporaryJson(directory, prefix, value) {
  const payload = payloadBuffer(value);
  const temporaryPath = path.join(
    directory,
    `.${prefix}-${process.pid}-${randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    let written = 0;
    while (written < payload.length) {
      written += fs.writeSync(
        descriptor,
        payload,
        written,
        payload.length - written,
      );
    }
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return temporaryPath;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
}

function atomicReplaceJson(outputPath, value, prefix) {
  const pathStat = fs.lstatSync(outputPath);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new TypeError('private lyrics review artifact is unsafe');
  }
  const temporaryPath = writeTemporaryJson(
    path.dirname(outputPath),
    prefix,
    value,
  );
  try {
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function atomicPublishJson(outputPath, value, prefix) {
  if (fs.existsSync(outputPath)) {
    throw new TypeError('private lyrics review artifact already exists');
  }
  const temporaryPath = writeTemporaryJson(
    path.dirname(outputPath),
    prefix,
    value,
  );
  try {
    fs.linkSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function countsFor(candidates) {
  const counts = {
    total: candidates.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    replacementNeeded: 0,
  };
  for (const candidate of candidates) {
    counts[candidate.decision] += 1;
    if (candidate.decision === 'rejected') counts.replacementNeeded += 1;
  }
  return counts;
}

function projectDataset(candidateSet, manifest, currentCandidateSetId) {
  const reviewsById = new Map(
    manifest.reviews.map((review) => [review.candidateId, review]),
  );
  const candidates = candidateSet.candidates.map((candidate) => {
    const review = reviewsById.get(candidate.id);
    return {
      id: candidate.id,
      stratum: candidate.stratum,
      languageTag: candidate.languageTag,
      catalogReach: candidate.catalogReach,
      decision: review.decision,
      rejectionReason: review.rejectionReason,
      reference: structuredClone(candidate.reference),
      confirmation:
        review.decision === 'approved'
          ? {
              title: review.reference.title,
              artist: review.reference.artist,
              album: review.reference.album,
              durationSeconds: review.reference.durationSeconds,
              languageTag: review.languageTag,
              version: review.version,
              eraTag: review.eraTag,
              versionTrap: review.versionTrap,
            }
          : null,
      evidence: {
        recordingMbid: candidate.source.recordingMbid,
        listenCount: candidate.source.listenCount,
        userCount: candidate.source.userCount,
      },
    };
  });
  const counts = countsFor(candidates);
  return {
    schemaVersion: 1,
    candidateSetId: candidateSet.candidateSetId,
    counts,
    canExport:
      candidateSet.candidateSetId === currentCandidateSetId &&
      counts.total > 0 &&
      counts.approved === counts.total,
    strata: STRATA.map(({ id, label }) => {
      const stratumCandidates = candidates.filter(
        (candidate) => candidate.stratum === id,
      );
      return { id, label, counts: countsFor(stratumCandidates) };
    }),
    candidates,
  };
}

function approvedReview(intent, candidate) {
  assertExactKeys(
    intent,
    ['candidateId', 'decision', 'confirmation'],
    'approval intent',
  );
  if (
    !CANDIDATE_ID_RE.test(intent.candidateId || '') ||
    intent.decision !== 'approved'
  ) {
    throw new TypeError('approval intent is invalid');
  }
  const confirmation = intent.confirmation;
  assertExactKeys(
    confirmation,
    [
      'title',
      'artist',
      'album',
      'durationSeconds',
      'languageTag',
      'version',
      'eraTag',
      'versionTrap',
    ],
    'approval confirmation',
  );
  const stratum = STRATA_BY_ID.get(candidate.stratum);
  if (!stratum?.languages.has(confirmation.languageTag)) {
    throw new TypeError('approval language is invalid');
  }
  if (!VERSION_TAGS.has(confirmation.version)) {
    throw new TypeError('approval version is invalid');
  }
  if (confirmation.eraTag !== APPROVED_ERA_TAG) {
    throw new TypeError('approval era is invalid');
  }
  const candidateReleaseYear = Number(
    candidate.reference.firstReleaseDate?.slice(0, 4),
  );
  if (
    !Number.isSafeInteger(candidateReleaseYear) ||
    candidateReleaseYear < 2010
  ) {
    throw new TypeError('approval candidate release is before 2010');
  }
  if (
    !Number.isSafeInteger(confirmation.durationSeconds) ||
    confirmation.durationSeconds <= 0 ||
    confirmation.durationSeconds > 86_400 ||
    typeof confirmation.versionTrap !== 'boolean'
  ) {
    throw new TypeError('approval confirmation is invalid');
  }
  const version = confirmation.version;
  return {
    candidateId: intent.candidateId,
    decision: 'approved',
    rejectionReason: null,
    stratum: candidate.stratum,
    languageTag: confirmation.languageTag,
    version,
    eraTag: confirmation.eraTag,
    versionTrap: confirmation.versionTrap,
    reference: {
      title: requiredText(confirmation.title, 'approval title'),
      artist: requiredText(confirmation.artist, 'approval artist'),
      album: nullableText(confirmation.album, 'approval album'),
      durationSeconds: confirmation.durationSeconds,
      version,
    },
  };
}

function rejectedReview(intent) {
  assertExactKeys(
    intent,
    ['candidateId', 'decision', 'rejectionReason'],
    'rejection intent',
  );
  if (
    !CANDIDATE_ID_RE.test(intent.candidateId || '') ||
    intent.decision !== 'rejected' ||
    !REJECTION_REASONS.has(intent.rejectionReason)
  ) {
    throw new TypeError('rejection intent is invalid');
  }
  return {
    candidateId: intent.candidateId,
    decision: 'rejected',
    rejectionReason: intent.rejectionReason,
    stratum: null,
    languageTag: null,
    version: null,
    eraTag: null,
    versionTrap: null,
    reference: null,
  };
}

function reviewFromIntent(intent, candidate) {
  if (!isPlainObject(intent)) throw new TypeError('review intent is invalid');
  if (intent.decision === 'approved') return approvedReview(intent, candidate);
  if (intent.decision === 'rejected') return rejectedReview(intent);
  throw new TypeError('review intent is invalid');
}

function createLyricsProviderCorpusReviewService({
  workspaceRoot,
  loadReviewContract,
}) {
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    throw new TypeError('lyrics review workspace is invalid');
  }
  const paths = fixedPaths(workspaceRoot);
  const contractLoader =
    loadReviewContract ?? (() => loadLyricsProviderReviewContract(paths.root));
  let mutationQueue = Promise.resolve();

  async function readValidated() {
    assertSafeDirectory(paths);
    const contract = await contractLoader();
    const candidateSet = contract.validatePrivateLyricsCandidateSet(
      readBoundedJson(paths.candidates, 'private candidate artifact'),
    );
    const manifest = contract.validatePrivateLyricsReviewManifest(
      candidateSet,
      readBoundedJson(paths.reviews, 'private review artifact'),
    );
    return { contract, candidateSet, manifest };
  }

  function serializeMutation(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function load() {
    const { contract, candidateSet, manifest } = await readValidated();
    return projectDataset(
      candidateSet,
      manifest,
      contract.currentCandidateSetId,
    );
  }

  async function resolveLookupAction(intent) {
    assertExactKeys(intent, ['candidateId', 'action'], 'review lookup intent');
    if (
      !CANDIDATE_ID_RE.test(intent.candidateId || '') ||
      !LOOKUP_ACTIONS.has(intent.action)
    ) {
      throw new TypeError('review lookup intent is invalid');
    }
    const { candidateSet } = await readValidated();
    const candidate = candidateSet.candidates.find(
      (item) => item.id === intent.candidateId,
    );
    if (!candidate) throw new TypeError('review lookup candidate is invalid');

    if (intent.action === 'copy-candidate-id') {
      return { effect: 'copy', value: candidate.id };
    }
    if (intent.action === 'copy-recording-mbid') {
      return { effect: 'copy', value: candidate.source.recordingMbid };
    }
    if (intent.action === 'copy-artist-title') {
      return {
        effect: 'copy',
        value: `${candidate.reference.artist} ${candidate.reference.title}`,
      };
    }
    return {
      effect: 'open-external',
      value: `https://musicbrainz.org/recording/${encodeURIComponent(candidate.source.recordingMbid)}`,
    };
  }

  function saveDecision(intent) {
    return serializeMutation(async () => {
      const { contract, candidateSet, manifest } = await readValidated();
      const candidate = candidateSet.candidates.find(
        (item) => item.id === intent?.candidateId,
      );
      if (!candidate) throw new TypeError('review candidate is invalid');
      const review = reviewFromIntent(intent, candidate);
      const nextManifest = {
        ...manifest,
        reviews: manifest.reviews.map((item) =>
          item.candidateId === candidate.id ? review : item,
        ),
      };
      const validated = contract.validatePrivateLyricsReviewManifest(
        candidateSet,
        nextManifest,
      );
      atomicReplaceJson(paths.reviews, validated, 'reviews');
      return projectDataset(
        candidateSet,
        validated,
        contract.currentCandidateSetId,
      );
    });
  }

  function exportCorpus() {
    return serializeMutation(async () => {
      const { contract, candidateSet, manifest } = await readValidated();
      const corpus = contract.exportReviewedLyricsCorpus(
        candidateSet,
        manifest,
      );
      atomicPublishJson(paths.corpus, corpus, 'corpus');
      return { exported: true, caseCount: corpus.cases.length };
    });
  }

  return Object.freeze({
    load,
    resolveLookupAction,
    saveDecision,
    exportCorpus,
  });
}

module.exports = {
  createLyricsProviderCorpusReviewService,
  loadLyricsProviderReviewContract,
};
