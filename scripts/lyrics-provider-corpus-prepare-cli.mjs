import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  preparePrivateLyricsCandidateSet,
  smokeLyricsProviderCandidateSources,
} from './lyrics-provider-corpus-prepare.mjs';
import { CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION } from './lyrics-provider-corpus-candidates.mjs';

const MAX_CANDIDATE_FILE_BYTES = 1_048_576;

function fixedOutputPath(cwd) {
  const workspace = fs.realpathSync(cwd);
  return path.join(
    workspace,
    '.benchmarks',
    'lyrics-provider',
    'candidates.json',
  );
}

function ensurePrivateOutputDirectory(outputPath) {
  const directory = path.dirname(outputPath);
  const workspace = path.dirname(path.dirname(directory));
  for (const current of [path.join(workspace, '.benchmarks'), directory]) {
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new TypeError('private candidate directory is unsafe');
      }
    } else {
      fs.mkdirSync(current, { mode: 0o700 });
    }
  }
}

function writePrivateCandidateSet(outputPath, candidateSet) {
  if (fs.existsSync(outputPath)) {
    throw new TypeError('private candidate artifact already exists');
  }
  ensurePrivateOutputDirectory(outputPath);
  const payload = `${JSON.stringify(candidateSet, null, 2)}\n`;
  if (Buffer.byteLength(payload, 'utf8') > MAX_CANDIDATE_FILE_BYTES) {
    throw new TypeError('private candidate artifact is too large');
  }
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.candidates-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, payload, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.linkSync(temporaryPath, outputPath);
    fs.rmSync(temporaryPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function countLine(stage, count) {
  if (
    typeof stage !== 'string' ||
    !/^[a-z]+(?:-[a-z]+)*$/u.test(stage) ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw new TypeError('candidate progress is invalid');
  }
  return `${stage}-count=${count}`;
}

export async function runCandidatePreparationCli(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const cwd = options.cwd ?? process.cwd();
  const consoleLike = options.consoleLike ?? console;
  if (
    !Array.isArray(argv) ||
    !consoleLike ||
    typeof consoleLike.log !== 'function'
  ) {
    throw new TypeError('candidate preparation CLI input is invalid');
  }
  if (argv.length === 1 && argv[0] === '--smoke') {
    const smoke = options.smoke ?? smokeLyricsProviderCandidateSources;
    const result = await smoke({
      version: CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION,
    });
    consoleLike.log(countLine('seed', result.seedCount));
    consoleLike.log(countLine('recording', result.recordingCount));
    consoleLike.log(
      countLine('popularity-available', result.popularityAvailableCount),
    );
    consoleLike.log(
      countLine('popularity-unavailable', result.popularityUnavailableCount),
    );
    return 0;
  }
  if (argv.length !== 0) {
    throw new TypeError('candidate preparation CLI arguments are invalid');
  }
  const outputPath = fixedOutputPath(cwd);
  if (fs.existsSync(outputPath)) {
    throw new TypeError('private candidate artifact already exists');
  }
  const prepare = options.prepare ?? preparePrivateLyricsCandidateSet;
  const result = await prepare({
    version: CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION,
    maximumSeedsPerStratum: 100,
    maximumRecordingsPerStratum: 500,
    maxPagesPerSeed: 1,
    onProgress({ stage, count }) {
      consoleLike.log(countLine(stage, count));
    },
  });
  writePrivateCandidateSet(outputPath, result);
  consoleLike.log(countLine('candidate', result.candidates.length));
  return 0;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runCandidatePreparationCli().catch(() => {
    console.error('candidate-preparation-failed');
    process.exitCode = 1;
  });
}
