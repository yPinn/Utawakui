import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateArtistPhotoProvider } from './artist-photo-provider-evaluation.mjs';

const MAX_PRIVATE_INPUT_BYTES = 1024 * 1024;
const PUBLIC_MESSAGES = new Set([
  'artist photo evaluation CLI usage: <corpus.json> <observations.json> <reviews.json> <report.json> [--synthetic]',
  'artist photo evaluation report must not overwrite input',
  'artist photo evaluation input exceeds the size limit',
  'artist photo evaluation input could not be read',
  'artist photo evaluation input JSON is invalid',
  'synthetic corpus id is required in synthetic mode',
  'regular corpus profile is required outside synthetic mode',
  'artist photo evaluation failed',
  'artist photo evaluation report could not be written',
]);

class PublicEvaluationCliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PublicEvaluationCliError';
  }
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

export function parseArtistPhotoEvaluationCliArgs(args) {
  if (
    !Array.isArray(args) ||
    (args.length !== 4 && args.length !== 5) ||
    (args.length === 5 && args[4] !== '--synthetic') ||
    args.some((value) => typeof value !== 'string' || value.length === 0)
  ) {
    throw new TypeError(
      'artist photo evaluation CLI usage: <corpus.json> <observations.json> <reviews.json> <report.json> [--synthetic]',
    );
  }
  const inputPaths = args.slice(0, 3).map((value) => path.resolve(value));
  const outputPath = path.resolve(args[3]);
  if (
    inputPaths.some(
      (inputPath) => comparablePath(inputPath) === comparablePath(outputPath),
    )
  ) {
    throw new TypeError(
      'artist photo evaluation report must not overwrite input',
    );
  }
  return {
    corpusPath: inputPaths[0],
    observationsPath: inputPaths[1],
    reviewsPath: inputPaths[2],
    outputPath,
    synthetic: args[4] === '--synthetic',
  };
}

function readBoundedJson(inputPath) {
  let descriptor;
  let serialized;
  try {
    descriptor = fs.openSync(inputPath, 'r');
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.size > MAX_PRIVATE_INPUT_BYTES) {
      throw new PublicEvaluationCliError(
        'artist photo evaluation input exceeds the size limit',
      );
    }
    const buffer = Buffer.allocUnsafe(MAX_PRIVATE_INPUT_BYTES + 1);
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
    if (bytesRead > MAX_PRIVATE_INPUT_BYTES) {
      throw new PublicEvaluationCliError(
        'artist photo evaluation input exceeds the size limit',
      );
    }
    serialized = buffer.subarray(0, bytesRead).toString('utf8');
  } catch (error) {
    if (error instanceof PublicEvaluationCliError) throw error;
    throw new PublicEvaluationCliError(
      'artist photo evaluation input could not be read',
      { cause: error },
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The descriptor was opened only for a bounded private read.
      }
    }
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new PublicEvaluationCliError(
      'artist photo evaluation input JSON is invalid',
      { cause: error },
    );
  }
}

function ensureDistinctExistingPaths(inputPaths, outputPath) {
  if (!fs.existsSync(outputPath)) return;
  const outputStats = fs.statSync(outputPath);
  const outputRealPath = comparablePath(fs.realpathSync(outputPath));
  for (const inputPath of inputPaths) {
    const inputStats = fs.statSync(inputPath);
    if (
      comparablePath(fs.realpathSync(inputPath)) === outputRealPath ||
      (inputStats.dev === outputStats.dev && inputStats.ino === outputStats.ino)
    ) {
      throw new TypeError(
        'artist photo evaluation report must not overwrite input',
      );
    }
  }
}

function atomicWriteReport(outputPath, report) {
  const temporaryPath = `${outputPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  let temporaryCreated = false;
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    const serialized = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    let written = 0;
    while (written < serialized.length) {
      written += fs.writeSync(
        descriptor,
        serialized,
        written,
        serialized.length - written,
      );
    }
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, outputPath);
    temporaryCreated = false;
  } catch (error) {
    throw new PublicEvaluationCliError(
      'artist photo evaluation report could not be written',
      { cause: error },
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Cleanup continues below.
      }
    }
    if (temporaryCreated) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Keep the fixed public error as the only CLI-visible detail.
      }
    }
  }
}

export async function runArtistPhotoEvaluationCli(args) {
  const command = parseArtistPhotoEvaluationCliArgs(args);
  ensureDistinctExistingPaths(
    [command.corpusPath, command.observationsPath, command.reviewsPath],
    command.outputPath,
  );
  const corpus = readBoundedJson(command.corpusPath);
  const observations = readBoundedJson(command.observationsPath);
  const reviews = readBoundedJson(command.reviewsPath);
  if (
    command.synthetic &&
    corpus?.corpusId !== 'artist-photo-private-synthetic-v1'
  ) {
    throw new TypeError('synthetic corpus id is required in synthetic mode');
  }
  if (!command.synthetic && corpus?.corpusId !== 'artist-photo-private-v1') {
    throw new TypeError(
      'regular corpus profile is required outside synthetic mode',
    );
  }
  let report;
  try {
    report = evaluateArtistPhotoProvider({ corpus, observations, reviews });
  } catch (error) {
    throw new PublicEvaluationCliError('artist photo evaluation failed', {
      cause: error,
    });
  }
  atomicWriteReport(command.outputPath, report);
  return command.outputPath;
}

function publicMessage(error) {
  return PUBLIC_MESSAGES.has(error?.message)
    ? error.message
    : 'artist photo evaluation CLI failed';
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const outputPath = await runArtistPhotoEvaluationCli(process.argv.slice(2));
    process.stdout.write(`${outputPath}\n`);
  } catch (error) {
    process.stderr.write(`${publicMessage(error)}\n`);
    process.exitCode = 1;
  }
}
