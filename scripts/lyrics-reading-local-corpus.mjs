import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildLocalLyricsReadingCorpus,
  defaultPrivateCorpusRoot,
  isPathWithin,
  isSamePath,
  prepareLocalLyricsReadingCorpus,
  scanLocalLyricsReadingDocuments,
} from './lib/lyricsReadingCorpus/localCorpus.mjs';

const MIN_REVIEW_LIMIT = 100;
const MAX_REVIEW_LIMIT = 300;

export function parseLocalLyricsReadingCorpusArgs(args) {
  if (
    !Array.isArray(args) ||
    ![2, 4].includes(args.length) ||
    args.some((value) => typeof value !== 'string' || value.length === 0) ||
    (args.length === 4 && args[2] !== '--limit')
  ) {
    throw new TypeError(
      'local lyrics reading corpus usage: <library> <output> [--limit 100..300]',
    );
  }
  const libraryDirectory = path.resolve(args[0]);
  const outputPath = path.resolve(args[1]);
  const privateOutputRoot = path.resolve(defaultPrivateCorpusRoot());
  const limit = args.length === 4 ? Number(args[3]) : 200;
  if (
    !Number.isSafeInteger(limit) ||
    limit < MIN_REVIEW_LIMIT ||
    limit > MAX_REVIEW_LIMIT
  ) {
    throw new TypeError('local lyrics reading review limit must be 100..300');
  }
  if (
    !isPathWithin(privateOutputRoot, outputPath) ||
    isSamePath(privateOutputRoot, outputPath)
  ) {
    throw new TypeError(
      'local corpus output must be inside the private output root',
    );
  }
  if (isPathWithin(libraryDirectory, outputPath)) {
    throw new TypeError('local corpus output must be outside the library');
  }
  return { libraryDirectory, outputPath, privateOutputRoot, limit };
}

export function runLocalLyricsReadingCorpusCli(args) {
  const command = parseLocalLyricsReadingCorpusArgs(args);
  return prepareLocalLyricsReadingCorpus(command);
}

export {
  buildLocalLyricsReadingCorpus,
  defaultPrivateCorpusRoot,
  prepareLocalLyricsReadingCorpus,
  scanLocalLyricsReadingDocuments,
};

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const summary = runLocalLyricsReadingCorpusCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch {
    process.stderr.write('local lyrics reading corpus preparation failed\n');
    process.exitCode = 1;
  }
}
