import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import {
  defaultPrivateCorpusRoot,
  restrictWindowsDirectoryAcl,
} from './lib/lyricsReadingCorpus/localCorpus.mjs';
import { acquireReviewSessionLease } from './lib/lyricsReadingCorpus/reviewSessionLease.mjs';
import {
  LOCAL_READING_REVIEW_COHORTS,
  applyLocalReadingReview,
  createLocalReadingReviewManifest,
  exportLocalReadingBenchmark,
  parseSegmentReadingEdits,
  summarizeLocalReadingReviews,
  undoLastLocalReadingReview,
  validateLocalReadingCorpus,
  validateLocalReadingReviewManifest,
} from './lib/lyricsReadingCorpus/review.mjs';

const MAX_PRIVATE_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_PRIVATE_CORPUS_BYTES = 2 * 1024 * 1024;
const MAX_LOCK_BYTES = 1024;
const STALE_LOCK_GRACE_MS = 30_000;
const LOCK_TOKEN_RE =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const COMMANDS = new Set(['review', 'init', 'status', 'undo', 'export']);
const COHORT_INPUTS = new Map([
  ['1', 'standard'],
  ['2', 'proper-noun'],
  ['3', 'mixed'],
  ['4', 'jukujikun'],
  ['5', 'song-specific'],
  ...LOCAL_READING_REVIEW_COHORTS.map((cohort) => [cohort, cohort]),
]);

export function localReadingReviewPaths(
  privateRoot = defaultPrivateCorpusRoot(),
) {
  const directory = path.resolve(privateRoot);
  return {
    directory,
    corpus: path.join(directory, 'local-corpus-v1.json'),
    reviews: path.join(directory, 'local-reviews-v1.json'),
    benchmark: path.join(directory, 'local-benchmark-v1.json'),
  };
}

export { acquireReviewSessionLease };

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function assertSafePrivateDirectory(directory) {
  if (!fs.existsSync(directory)) {
    throw new TypeError('private reading review directory is unavailable');
  }
  const stat = fs.lstatSync(directory);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    !samePath(fs.realpathSync(directory), directory)
  ) {
    throw new TypeError('private reading review directory is unsafe');
  }
}

function readBoundedPrivateJson(
  pathname,
  label,
  maximumBytes = MAX_PRIVATE_ARTIFACT_BYTES,
) {
  let descriptor;
  try {
    const pathStat = fs.lstatSync(pathname);
    if (
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      pathStat.nlink !== 1 ||
      pathStat.size > maximumBytes
    ) {
      throw new TypeError(
        pathStat.size > maximumBytes
          ? `${label} exceeds the size limit`
          : `${label} is unsafe`,
      );
    }
    descriptor = fs.openSync(pathname, 'r');
    const openedStat = fs.fstatSync(descriptor);
    if (
      !openedStat.isFile() ||
      openedStat.nlink !== 1 ||
      openedStat.size > maximumBytes ||
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino
    ) {
      throw new TypeError(
        openedStat.size > maximumBytes
          ? `${label} exceeds the size limit`
          : `${label} is unsafe`,
      );
    }
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
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
    if (bytesRead > maximumBytes) {
      throw new TypeError(`${label} exceeds the size limit`);
    }
    try {
      return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    } catch (error) {
      throw new TypeError(`${label} JSON is invalid`, { cause: error });
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function privateJsonPayload(value, label) {
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (payload.length > MAX_PRIVATE_ARTIFACT_BYTES) {
    throw new TypeError(`${label} exceeds the size limit`);
  }
  return payload;
}

function writeTemporaryJson(outputPath, value, label) {
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const payload = privateJsonPayload(value, label);
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, payload);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return temporaryPath;
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The original write error is more useful than cleanup detail.
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The private directory remains restricted and future runs use a new id.
    }
    throw error;
  }
}

function publishPrivateJson(outputPath, value, label) {
  if (fs.existsSync(outputPath)) {
    throw new TypeError(`${label} already exists`);
  }
  const temporaryPath = writeTemporaryJson(outputPath, value, label);
  try {
    fs.linkSync(temporaryPath, outputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function validateReviewLock(value) {
  const keys = ['schemaVersion', 'pid', 'createdAtMs', 'token'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid < 1 ||
    value.pid > 2_147_483_647 ||
    !Number.isSafeInteger(value.createdAtMs) ||
    value.createdAtMs < 0 ||
    value.createdAtMs > Date.now() + STALE_LOCK_GRACE_MS ||
    !LOCK_TOKEN_RE.test(value.token || '')
  ) {
    throw new TypeError('private reading review lock is invalid');
  }
  return value;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function inspectReviewLock(lockPath) {
  const before = fs.lstatSync(lockPath);
  const value = validateReviewLock(
    readBoundedPrivateJson(
      lockPath,
      'private reading review lock',
      MAX_LOCK_BYTES,
    ),
  );
  const after = fs.lstatSync(lockPath);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    after.nlink !== 1 ||
    !after.isFile() ||
    after.isSymbolicLink()
  ) {
    throw new TypeError('private reading review lock changed unexpectedly');
  }
  return { value, stat: after };
}

function recoverDeadReviewLock(lockPath) {
  const snapshot = inspectReviewLock(lockPath);
  if (
    Date.now() - snapshot.value.createdAtMs < STALE_LOCK_GRACE_MS ||
    processIsAlive(snapshot.value.pid)
  ) {
    return false;
  }
  const current = fs.lstatSync(lockPath);
  if (
    current.dev !== snapshot.stat.dev ||
    current.ino !== snapshot.stat.ino ||
    current.size !== snapshot.stat.size ||
    current.mtimeMs !== snapshot.stat.mtimeMs ||
    current.nlink !== 1 ||
    !current.isFile() ||
    current.isSymbolicLink()
  ) {
    throw new TypeError('private reading review lock changed unexpectedly');
  }
  fs.rmSync(lockPath);
  return true;
}

function acquireReviewLock(lockPath) {
  const owner = {
    schemaVersion: 1,
    pid: process.pid,
    createdAtMs: Date.now(),
    token: randomUUID(),
  };
  let descriptor;
  const open = () => fs.openSync(lockPath, 'wx', 0o600);
  try {
    try {
      descriptor = open();
    } catch (error) {
      if (error?.code !== 'EEXIST' || !recoverDeadReviewLock(lockPath)) {
        throw new TypeError(
          'private reading reviews are active in another session',
          { cause: error },
        );
      }
      try {
        descriptor = open();
      } catch (retryError) {
        throw new TypeError(
          'private reading reviews are active in another session',
          { cause: retryError },
        );
      }
    }
    fs.writeFileSync(descriptor, JSON.stringify(owner));
    fs.fsyncSync(descriptor);
    return { descriptor, lockPath, owner };
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } finally {
        fs.rmSync(lockPath, { force: true });
      }
    }
    throw error;
  }
}

function releaseReviewLock(lock) {
  fs.closeSync(lock.descriptor);
  const current = inspectReviewLock(lock.lockPath);
  if (current.value.token !== lock.owner.token) {
    throw new TypeError('private reading review lock changed unexpectedly');
  }
  fs.rmSync(lock.lockPath);
}

function replacePrivateJson(outputPath, previousValue, value, label) {
  const lockPath = `${outputPath}.lock`;
  let lock;
  try {
    lock = acquireReviewLock(lockPath);
    const currentValue = readBoundedPrivateJson(outputPath, label);
    if (JSON.stringify(currentValue) !== JSON.stringify(previousValue)) {
      throw new TypeError('private reading reviews changed in another session');
    }
    const temporaryPath = writeTemporaryJson(outputPath, value, label);
    try {
      fs.renameSync(temporaryPath, outputPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  } finally {
    if (lock) releaseReviewLock(lock);
  }
}

function parseOptions(options) {
  const argv = options.argv ?? process.argv.slice(2);
  const consoleLike = options.consoleLike ?? console;
  if (
    !Array.isArray(argv) ||
    argv.length > 1 ||
    (argv.length === 1 && !COMMANDS.has(argv[0])) ||
    !consoleLike ||
    typeof consoleLike.log !== 'function' ||
    (options.prompt !== undefined && typeof options.prompt !== 'function') ||
    (options.secureDirectory !== undefined &&
      typeof options.secureDirectory !== 'function') ||
    (options.acquireSessionLease !== undefined &&
      typeof options.acquireSessionLease !== 'function')
  ) {
    throw new TypeError('local reading review CLI arguments are invalid');
  }
  return {
    command: argv[0] ?? 'review',
    consoleLike,
    privateRoot: options.privateRoot ?? defaultPrivateCorpusRoot(),
    prompt: options.prompt,
    secureDirectory: options.secureDirectory ?? restrictWindowsDirectoryAcl,
    acquireSessionLease:
      options.acquireSessionLease ?? acquireReviewSessionLease,
  };
}

function loadCorpus(paths) {
  return validateLocalReadingCorpus(
    readBoundedPrivateJson(
      paths.corpus,
      'private reading corpus',
      MAX_PRIVATE_CORPUS_BYTES,
    ),
  );
}

function loadManifest(paths, corpus) {
  return validateLocalReadingReviewManifest(
    corpus,
    readBoundedPrivateJson(paths.reviews, 'private reading reviews'),
  );
}

function initializeManifest(paths, corpus) {
  const manifest = createLocalReadingReviewManifest(corpus);
  publishPrivateJson(paths.reviews, manifest, 'private reading reviews');
  return manifest;
}

function printSummary(consoleLike, summary) {
  consoleLike.log(`total=${summary.total}`);
  consoleLike.log(`pending=${summary.pending}`);
  consoleLike.log(`approved=${summary.approved}`);
  consoleLike.log(`skipped=${summary.skipped}`);
  for (const cohort of LOCAL_READING_REVIEW_COHORTS) {
    consoleLike.log(`cohort-${cohort}=${summary.cohorts[cohort]}`);
  }
}

function sourceCaseMap(corpus) {
  return new Map(
    [...corpus.goldSeed.cases, ...corpus.reviewQueue.cases].map(
      (sourceCase) => [sourceCase.id, sourceCase],
    ),
  );
}

function sourceReading(sourceCase) {
  return Object.hasOwn(sourceCase, 'currentKana')
    ? {
        source: 'automatic',
        kana: sourceCase.currentKana,
        segments: sourceCase.currentSegments,
      }
    : {
        source: 'gold-seed',
        kana: sourceCase.expectedKana,
        segments: sourceCase.expectedSegments,
      };
}

function printCase(consoleLike, sourceCase, position, total) {
  const reading = sourceReading(sourceCase);
  consoleLike.log(`case=${position}/${total}`);
  consoleLike.log(`source=${reading.source}`);
  consoleLike.log(`shape=${sourceCase.shape}`);
  consoleLike.log(`text=${sourceCase.text}`);
  consoleLike.log(`current-kana=${reading.kana}`);
  consoleLike.log(
    `segments=${reading.segments
      .map(
        (segment, index) =>
          `${index + 1}:${segment.t}→${segment.r ?? segment.t}`,
      )
      .join(' | ')}`,
  );
  consoleLike.log(
    'actions=a accept | e 1=reading,2=reading correct | s skip | q quit',
  );
}

async function reviewInteractively({
  paths,
  corpus,
  manifest,
  consoleLike,
  prompt,
  assertLease,
}) {
  const casesById = sourceCaseMap(corpus);
  while (true) {
    const nextIndex = manifest.reviews.findIndex(
      ({ decision }) => decision === 'pending',
    );
    if (nextIndex === -1) {
      consoleLike.log('pending=0');
      return;
    }
    const review = manifest.reviews[nextIndex];
    const sourceCase = casesById.get(review.caseId);
    const reading = sourceReading(sourceCase);
    printCase(consoleLike, sourceCase, nextIndex + 1, manifest.reviews.length);
    const answer = String(await prompt('decision> ')).trim();
    if (answer === 'q') return;
    if (answer === 's') {
      assertLease();
      const previousManifest = structuredClone(manifest);
      applyLocalReadingReview(corpus, manifest, {
        caseId: review.caseId,
        decision: 'skipped',
      });
      replacePrivateJson(
        paths.reviews,
        previousManifest,
        manifest,
        'private reading reviews',
      );
      consoleLike.log('saved=skipped');
      continue;
    }
    const isAccept = answer === 'a';
    const isEdit = answer.startsWith('e ');
    if (!isAccept && !isEdit) {
      consoleLike.log('invalid-decision');
      continue;
    }
    let segmentEdits;
    try {
      if (isEdit) {
        segmentEdits = parseSegmentReadingEdits(
          answer.slice(2).trim(),
          reading.segments.length,
        );
      }
    } catch {
      consoleLike.log('invalid-segment-edit');
      continue;
    }
    const cohortInput = String(
      await prompt(
        'cohort [1 standard, 2 proper-noun, 3 mixed, 4 jukujikun, 5 song-specific]> ',
      ),
    ).trim();
    const cohort = COHORT_INPUTS.get(cohortInput);
    if (!cohort) {
      consoleLike.log('invalid-cohort');
      continue;
    }
    assertLease();
    const previousManifest = structuredClone(manifest);
    applyLocalReadingReview(corpus, manifest, {
      caseId: review.caseId,
      decision: 'approved',
      cohort,
      ...(segmentEdits ? { segmentEdits } : {}),
    });
    replacePrivateJson(
      paths.reviews,
      previousManifest,
      manifest,
      'private reading reviews',
    );
    consoleLike.log('saved=approved');
  }
}

export async function runLyricsReadingReviewCli(options = {}) {
  const {
    command,
    consoleLike,
    privateRoot,
    prompt,
    secureDirectory,
    acquireSessionLease,
  } = parseOptions(options);
  const paths = localReadingReviewPaths(privateRoot);
  assertSafePrivateDirectory(paths.directory);
  secureDirectory(paths.directory);
  const lease =
    command === 'status'
      ? null
      : await acquireSessionLease(paths.directory, command);
  if (
    lease &&
    (typeof lease.assertHeld !== 'function' ||
      typeof lease.release !== 'function')
  ) {
    throw new TypeError('private reading review session lease is invalid');
  }
  try {
    lease?.assertHeld();
    const corpus = loadCorpus(paths);

    if (command === 'init') {
      const manifest = initializeManifest(paths, corpus);
      consoleLike.log(`review-count=${manifest.reviews.length}`);
      consoleLike.log(`pending-count=${manifest.reviews.length}`);
      return 0;
    }

    let manifest;
    if (command === 'review' && !fs.existsSync(paths.reviews)) {
      manifest = initializeManifest(paths, corpus);
    } else {
      manifest = loadManifest(paths, corpus);
    }

    if (command === 'status') {
      printSummary(consoleLike, summarizeLocalReadingReviews(corpus, manifest));
      return 0;
    }
    if (command === 'undo') {
      lease.assertHeld();
      const previousManifest = structuredClone(manifest);
      const caseId = undoLastLocalReadingReview(corpus, manifest);
      if (caseId) {
        replacePrivateJson(
          paths.reviews,
          previousManifest,
          manifest,
          'private reading reviews',
        );
      }
      consoleLike.log(`undo=${caseId ? 'ok' : 'none'}`);
      consoleLike.log(
        `pending=${summarizeLocalReadingReviews(corpus, manifest).pending}`,
      );
      return 0;
    }
    if (command === 'export') {
      lease.assertHeld();
      if (fs.existsSync(paths.benchmark)) {
        throw new TypeError('private reading benchmark already exists');
      }
      const benchmark = exportLocalReadingBenchmark(corpus, manifest);
      publishPrivateJson(
        paths.benchmark,
        benchmark,
        'private reading benchmark',
      );
      consoleLike.log(`case-count=${benchmark.cases.length}`);
      return 0;
    }

    if (prompt) {
      await reviewInteractively({
        paths,
        corpus,
        manifest,
        consoleLike,
        prompt,
        assertLease: () => lease.assertHeld(),
      });
      return 0;
    }
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      await reviewInteractively({
        paths,
        corpus,
        manifest,
        consoleLike,
        prompt: (question) => readline.question(question),
        assertLease: () => lease.assertHeld(),
      });
    } finally {
      readline.close();
    }
    return 0;
  } finally {
    if (lease) await lease.release();
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runLyricsReadingReviewCli().catch(() => {
    process.stderr.write('private-reading-review-failed\n');
    process.exitCode = 1;
  });
}
