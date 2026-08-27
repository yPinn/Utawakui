import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  buildPrivateCandidateSet,
  validatePrivateLyricsCandidateSet,
} from './lyrics-provider-corpus-candidates.mjs';
import {
  createPrivateLyricsReviewManifest,
  validatePrivateLyricsReviewManifest,
} from './lyrics-provider-corpus-review.mjs';

const MAX_PRIVATE_ARTIFACT_BYTES = 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SELECTION_KEYS = new Set([
  'schemaVersion',
  'targetCandidateSetVersion',
  'recordingMbids',
  'supplements',
]);

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertSelection(value, targetCandidateSetVersion) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== SELECTION_KEYS.size ||
    Object.keys(value).some((key) => !SELECTION_KEYS.has(key)) ||
    value.schemaVersion !== 1 ||
    value.targetCandidateSetVersion !== targetCandidateSetVersion ||
    !Array.isArray(value.recordingMbids) ||
    value.recordingMbids.length !== 40 ||
    value.recordingMbids.some(
      (recordingMbid) =>
        typeof recordingMbid !== 'string' ||
        !UUID_RE.test(recordingMbid) ||
        recordingMbid !== recordingMbid.toLowerCase(),
    ) ||
    new Set(value.recordingMbids).size !== value.recordingMbids.length ||
    !Array.isArray(value.supplements) ||
    value.supplements.length > 40
  ) {
    throw new TypeError('private corpus selection is invalid');
  }
  return value;
}

function projectLegacyCandidate(candidate) {
  return {
    stratum: candidate.stratum,
    languageTag: candidate.languageTag,
    recordingMbid: candidate.source.recordingMbid,
    primaryArtistMbid: candidate.source.primaryArtistMbid,
    workQid: candidate.source.workQid,
    workMbid: candidate.source.workMbid,
    title: candidate.reference.title,
    artist: candidate.reference.artist,
    album: candidate.reference.album,
    durationMs: candidate.reference.durationSeconds * 1_000,
    firstReleaseDate: candidate.reference.firstReleaseDate,
    listenCount: candidate.source.listenCount,
    userCount: candidate.source.userCount,
    classificationBasis:
      candidate.source.classificationBasis ??
      (candidate.stratum.startsWith('chinese-')
        ? 'recording-shortlist'
        : 'work-metadata'),
  };
}

function buildCandidateSetFromSelection(
  sourceCandidateSet,
  selectionValue,
  targetCandidateSetVersion,
) {
  const selection = assertSelection(selectionValue, targetCandidateSetVersion);
  const sourceByRecording = new Map(
    sourceCandidateSet.candidates.map((candidate) => [
      candidate.source.recordingMbid,
      projectLegacyCandidate(candidate),
    ]),
  );
  for (const supplement of selection.supplements) {
    const recordingMbid = supplement?.recordingMbid;
    if (
      typeof recordingMbid !== 'string' ||
      !UUID_RE.test(recordingMbid) ||
      recordingMbid !== recordingMbid.toLowerCase() ||
      sourceByRecording.has(recordingMbid)
    ) {
      throw new TypeError('private supplement identity is invalid');
    }
    sourceByRecording.set(recordingMbid, supplement);
  }
  const rawCandidates = selection.recordingMbids.map((recordingMbid) => {
    const candidate = sourceByRecording.get(recordingMbid);
    if (!candidate) {
      throw new TypeError('private selection recording is unavailable');
    }
    return candidate;
  });
  const candidateSet = buildPrivateCandidateSet(rawCandidates, {
    candidateSetVersion: selection.targetCandidateSetVersion,
  });
  const selectedRecordings = new Set(selection.recordingMbids);
  if (
    candidateSet.candidates.some(
      ({ source }) => !selectedRecordings.has(source.recordingMbid),
    )
  ) {
    throw new TypeError('private selection did not remain exact');
  }
  return candidateSet;
}

export function buildV3CandidateSetFromSelection(
  legacyCandidateValue,
  selectionValue,
) {
  const legacyCandidateSet =
    validatePrivateLyricsCandidateSet(legacyCandidateValue);
  if (
    legacyCandidateSet.candidateSetId !==
    'lyrics-provider-private-candidates-v2'
  ) {
    throw new TypeError('private corpus switch requires the current v2 set');
  }
  return buildCandidateSetFromSelection(legacyCandidateSet, selectionValue, 3);
}

export function buildReplacementCandidateSetFromSelection(
  sourceCandidateValue,
  selectionValue,
) {
  const sourceCandidateSet =
    validatePrivateLyricsCandidateSet(sourceCandidateValue);
  const sourceVersion = Number(
    sourceCandidateSet.candidateSetId.match(/-v([1-9]\d{0,2})$/u)?.[1],
  );
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 3) {
    throw new TypeError('private corpus replacement requires v3 or newer');
  }
  return buildCandidateSetFromSelection(
    sourceCandidateSet,
    selectionValue,
    sourceVersion + 1,
  );
}

export function carryForwardApprovedReviews(
  legacyCandidateValue,
  legacyReviewValue,
  targetCandidateValue,
) {
  const legacyCandidateSet =
    validatePrivateLyricsCandidateSet(legacyCandidateValue);
  const legacyReviews = validatePrivateLyricsReviewManifest(
    legacyCandidateSet,
    legacyReviewValue,
  );
  const targetCandidateSet =
    validatePrivateLyricsCandidateSet(targetCandidateValue);
  if (
    legacyCandidateSet.candidateSetId !==
      'lyrics-provider-private-candidates-v2' ||
    targetCandidateSet.candidateSetId !==
      'lyrics-provider-private-candidates-v3'
  ) {
    throw new TypeError('private review carry requires v2 and v3 sets');
  }
  const legacyCandidatesById = new Map(
    legacyCandidateSet.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const approvedByRecording = new Map();
  for (const review of legacyReviews.reviews) {
    if (review.decision !== 'approved') continue;
    const candidate = legacyCandidatesById.get(review.candidateId);
    approvedByRecording.set(candidate.source.recordingMbid, {
      candidate,
      review,
    });
  }
  const manifest = createPrivateLyricsReviewManifest(targetCandidateSet);
  let carriedCount = 0;
  for (const [index, candidate] of targetCandidateSet.candidates.entries()) {
    const legacy = approvedByRecording.get(candidate.source.recordingMbid);
    if (
      !legacy ||
      legacy.candidate.stratum !== candidate.stratum ||
      candidate.source.classificationBasis !== 'work-metadata'
    ) {
      continue;
    }
    manifest.reviews[index] = {
      ...structuredClone(legacy.review),
      candidateId: candidate.id,
    };
    carriedCount += 1;
  }
  validatePrivateLyricsReviewManifest(targetCandidateSet, manifest);
  return { manifest, carriedCount };
}

export function carryForwardReplacementReviews(
  sourceCandidateValue,
  sourceReviewValue,
  targetCandidateValue,
) {
  const sourceCandidateSet =
    validatePrivateLyricsCandidateSet(sourceCandidateValue);
  const sourceReviews = validatePrivateLyricsReviewManifest(
    sourceCandidateSet,
    sourceReviewValue,
  );
  const targetCandidateSet =
    validatePrivateLyricsCandidateSet(targetCandidateValue);
  const sourceVersion = Number(
    sourceCandidateSet.candidateSetId.match(/-v([1-9]\d{0,2})$/u)?.[1],
  );
  if (
    !Number.isSafeInteger(sourceVersion) ||
    sourceVersion < 3 ||
    targetCandidateSet.candidateSetId !==
      `lyrics-provider-private-candidates-v${sourceVersion + 1}` ||
    targetCandidateSet.candidates.length !==
      sourceCandidateSet.candidates.length
  ) {
    throw new TypeError('private replacement review versions are invalid');
  }
  const sourceCandidatesById = new Map(
    sourceCandidateSet.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const sourceByRecording = new Map();
  for (const review of sourceReviews.reviews) {
    const candidate = sourceCandidatesById.get(review.candidateId);
    sourceByRecording.set(candidate.source.recordingMbid, {
      candidate,
      review,
    });
  }
  const targetRecordings = new Set(
    targetCandidateSet.candidates.map(({ source }) => source.recordingMbid),
  );
  for (const { candidate, review } of sourceByRecording.values()) {
    const retained = targetRecordings.has(candidate.source.recordingMbid);
    if (
      (review.decision === 'rejected' && retained) ||
      (review.decision !== 'rejected' && !retained)
    ) {
      throw new TypeError(
        'private replacement must replace only rejected recordings',
      );
    }
  }
  const manifest = createPrivateLyricsReviewManifest(targetCandidateSet);
  let carriedCount = 0;
  for (const [index, candidate] of targetCandidateSet.candidates.entries()) {
    const source = sourceByRecording.get(candidate.source.recordingMbid);
    if (!source) continue;
    if (
      source.candidate.stratum !== candidate.stratum ||
      source.candidate.source.classificationBasis !==
        candidate.source.classificationBasis
    ) {
      throw new TypeError('private retained candidate classification changed');
    }
    if (source.review.decision !== 'approved') continue;
    manifest.reviews[index] = {
      ...structuredClone(source.review),
      candidateId: candidate.id,
    };
    carriedCount += 1;
  }
  validatePrivateLyricsReviewManifest(targetCandidateSet, manifest);
  return { manifest, carriedCount };
}

function privatePaths(cwd, sourceCandidateSet = null) {
  const workspace = fs.realpathSync(cwd);
  const directory = path.join(workspace, '.benchmarks', 'lyrics-provider');
  const paths = {
    directory,
    candidates: path.join(directory, 'candidates.json'),
    reviews: path.join(directory, 'reviews.json'),
  };
  if (!sourceCandidateSet) return paths;
  const sourceVersion = Number(
    sourceCandidateSet.candidateSetId.match(/-v([1-9]\d{0,2})$/u)?.[1],
  );
  const targetVersion = sourceVersion + 1;
  const legacyV2 = sourceVersion === 2;
  const archiveSuffix = legacyV2
    ? 'v2-legacy-100'
    : `v${sourceVersion}-reviewed-${sourceCandidateSet.candidates.length}`;
  return {
    ...paths,
    sourceVersion,
    targetVersion,
    selection: path.join(directory, `v${targetVersion}-selection.json`),
    candidateArchive: path.join(directory, `candidates-${archiveSuffix}.json`),
    reviewArchive: path.join(directory, `reviews-${archiveSuffix}.json`),
  };
}

function readBoundedJson(pathname, label) {
  const stat = fs.lstatSync(pathname);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size > MAX_PRIVATE_ARTIFACT_BYTES
  ) {
    throw new TypeError(`${label} is unsafe`);
  }
  const text = fs.readFileSync(pathname, 'utf8');
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new TypeError(`${label} JSON is invalid`, { cause: error });
  }
}

function preserveArchive(sourcePath, archivePath, expectedText) {
  if (fs.existsSync(archivePath)) {
    if (fs.readFileSync(archivePath, 'utf8') !== expectedText) {
      throw new TypeError('private legacy archive does not match current data');
    }
    return;
  }
  fs.copyFileSync(sourcePath, archivePath, fs.constants.COPYFILE_EXCL);
}

function writeTemporaryJson(directory, prefix, value) {
  const pathname = path.join(
    directory,
    `.${prefix}-${process.pid}-${randomUUID()}.tmp`,
  );
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(payload) > MAX_PRIVATE_ARTIFACT_BYTES) {
    throw new TypeError('private corpus artifact exceeds the size limit');
  }
  fs.writeFileSync(pathname, payload, { flag: 'wx', mode: 0o600 });
  return pathname;
}

function restoreText(pathname, text, directory, prefix) {
  const temporaryPath = path.join(
    directory,
    `.${prefix}-rollback-${process.pid}-${randomUUID()}.tmp`,
  );
  fs.writeFileSync(temporaryPath, text, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporaryPath, pathname);
}

export function runLyricsProviderCorpusSwitch(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const consoleLike = options.consoleLike ?? console;
  if (!consoleLike || typeof consoleLike.log !== 'function') {
    throw new TypeError('private corpus switch console is invalid');
  }
  const basePaths = privatePaths(cwd);
  const directoryStat = fs.lstatSync(basePaths.directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new TypeError('private lyrics directory is unsafe');
  }
  const candidates = readBoundedJson(
    basePaths.candidates,
    'private candidate artifact',
  );
  const sourceCandidateSet = validatePrivateLyricsCandidateSet(
    candidates.value,
  );
  const paths = privatePaths(cwd, sourceCandidateSet);
  const reviews = readBoundedJson(paths.reviews, 'private review artifact');
  const selection = readBoundedJson(
    paths.selection,
    `private v${paths.targetVersion} selection artifact`,
  );
  const legacyV2 = paths.sourceVersion === 2;
  const targetCandidates = legacyV2
    ? buildV3CandidateSetFromSelection(candidates.value, selection.value)
    : buildReplacementCandidateSetFromSelection(
        candidates.value,
        selection.value,
      );
  const { manifest: targetReviews, carriedCount } = legacyV2
    ? carryForwardApprovedReviews(
        candidates.value,
        reviews.value,
        targetCandidates,
      )
    : carryForwardReplacementReviews(
        candidates.value,
        reviews.value,
        targetCandidates,
      );
  const candidateTemporary = writeTemporaryJson(
    paths.directory,
    `candidates-v${paths.targetVersion}`,
    targetCandidates,
  );
  const reviewTemporary = writeTemporaryJson(
    paths.directory,
    `reviews-v${paths.targetVersion}`,
    targetReviews,
  );
  let candidateReplaced = false;
  try {
    preserveArchive(paths.candidates, paths.candidateArchive, candidates.text);
    preserveArchive(paths.reviews, paths.reviewArchive, reviews.text);
    fs.renameSync(candidateTemporary, paths.candidates);
    candidateReplaced = true;
    fs.renameSync(reviewTemporary, paths.reviews);
  } catch (error) {
    if (candidateReplaced) {
      restoreText(
        paths.candidates,
        candidates.text,
        paths.directory,
        `candidates-v${paths.sourceVersion}`,
      );
    }
    throw error;
  } finally {
    for (const pathname of [candidateTemporary, reviewTemporary]) {
      if (fs.existsSync(pathname)) fs.rmSync(pathname);
    }
  }
  consoleLike.log(`candidate-count=${targetCandidates.candidates.length}`);
  consoleLike.log(`carried-review-count=${carriedCount}`);
  return {
    candidateCount: targetCandidates.candidates.length,
    carriedCount,
  };
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    runLyricsProviderCorpusSwitch();
  } catch {
    process.stderr.write('private-lyrics-corpus-switch-failed\n');
    process.exitCode = 1;
  }
}
