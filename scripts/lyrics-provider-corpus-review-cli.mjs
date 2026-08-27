import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  createPrivateLyricsReviewManifest,
  exportReviewedLyricsCorpus,
} from './lyrics-provider-corpus-review.mjs';

const MAX_PRIVATE_ARTIFACT_BYTES = 1024 * 1024;

function privatePaths(cwd) {
  const workspace = fs.realpathSync(cwd);
  const directory = path.join(workspace, '.benchmarks', 'lyrics-provider');
  return {
    directory,
    candidates: path.join(directory, 'candidates.json'),
    reviews: path.join(directory, 'reviews.json'),
    corpus: path.join(directory, 'corpus.json'),
  };
}

function assertSafePrivateDirectory(directory) {
  for (const current of [path.dirname(directory), directory]) {
    if (!fs.existsSync(current)) {
      throw new TypeError('private lyrics review directory is unsafe');
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new TypeError('private lyrics review directory is unsafe');
    }
  }
}

function boundedJson(pathname, label) {
  let descriptor;
  try {
    const pathStat = fs.lstatSync(pathname);
    if (
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      pathStat.size > MAX_PRIVATE_ARTIFACT_BYTES
    ) {
      throw new TypeError(
        pathStat.size > MAX_PRIVATE_ARTIFACT_BYTES
          ? `${label} exceeds the size limit`
          : `${label} is unsafe`,
      );
    }
    descriptor = fs.openSync(pathname, 'r');
    const openedStat = fs.fstatSync(descriptor);
    if (
      !openedStat.isFile() ||
      openedStat.size > MAX_PRIVATE_ARTIFACT_BYTES ||
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino
    ) {
      throw new TypeError(
        openedStat.size > MAX_PRIVATE_ARTIFACT_BYTES
          ? `${label} exceeds the size limit`
          : `${label} is unsafe`,
      );
    }
    const buffer = Buffer.allocUnsafe(MAX_PRIVATE_ARTIFACT_BYTES + 1);
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
    if (bytesRead > MAX_PRIVATE_ARTIFACT_BYTES) {
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

function publishPrivateJson(outputPath, value, prefix) {
  if (fs.existsSync(outputPath)) {
    throw new TypeError('private lyrics review artifact already exists');
  }
  const payload = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (payload.length > MAX_PRIVATE_ARTIFACT_BYTES) {
    throw new TypeError(
      'private lyrics review artifact exceeds the size limit',
    );
  }
  const temporaryPath = path.join(
    path.dirname(outputPath),
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
    fs.linkSync(temporaryPath, outputPath);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Cleanup below remains best-effort and does not expose private details.
      }
    }
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function validateCliOptions(options) {
  const argv = options.argv ?? process.argv.slice(2);
  const cwd = options.cwd ?? process.cwd();
  const consoleLike = options.consoleLike ?? console;
  if (
    !Array.isArray(argv) ||
    !consoleLike ||
    typeof consoleLike.log !== 'function' ||
    !(argv.length === 1 && (argv[0] === 'init' || argv[0] === 'export'))
  ) {
    throw new TypeError('private lyrics review CLI arguments are invalid');
  }
  return { command: argv[0], cwd, consoleLike };
}

export async function runLyricsProviderCorpusReviewCli(options = {}) {
  const { command, cwd, consoleLike } = validateCliOptions(options);
  const paths = privatePaths(cwd);
  assertSafePrivateDirectory(paths.directory);
  const outputPath = command === 'init' ? paths.reviews : paths.corpus;
  if (fs.existsSync(outputPath)) {
    throw new TypeError('private lyrics review artifact already exists');
  }
  const candidates = boundedJson(
    paths.candidates,
    'private candidate artifact',
  );
  if (command === 'init') {
    const manifest = createPrivateLyricsReviewManifest(candidates);
    publishPrivateJson(paths.reviews, manifest, 'reviews');
    consoleLike.log(`review-count=${manifest.reviews.length}`);
    consoleLike.log(
      `pending-count=${manifest.reviews.filter(({ decision }) => decision === 'pending').length}`,
    );
    return 0;
  }
  const reviews = boundedJson(paths.reviews, 'private review artifact');
  const corpus = exportReviewedLyricsCorpus(candidates, reviews);
  publishPrivateJson(paths.corpus, corpus, 'corpus');
  consoleLike.log(`case-count=${corpus.cases.length}`);
  return 0;
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runLyricsProviderCorpusReviewCli().catch(() => {
    process.stderr.write('private-lyrics-review-failed\n');
    process.exitCode = 1;
  });
}
