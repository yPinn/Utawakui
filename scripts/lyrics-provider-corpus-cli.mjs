import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runPrivateLyricsCorpus } from './lyrics-provider-corpus-runner.mjs';
import { createDefaultLyricsProviderProbeRegistry } from './lyrics-provider-probe-registry.mjs';

const MAX_PRIVATE_CORPUS_BYTES = 1024 * 1024;
const DEFAULT_REQUIRED_CASE_COUNT = 40;
const SYNTHETIC_REQUIRED_CASE_COUNT = 2;
const PUBLIC_CLI_MESSAGES = new Set([
  'lyrics provider corpus CLI usage: <corpus.json> <report.json> [--synthetic]',
  'lyrics provider corpus report must not overwrite input',
  'lyrics provider corpus exceeds the size limit',
  'private corpus JSON is invalid',
  'private corpus could not be read',
  'synthetic corpus id is required in synthetic mode',
  'private corpus validation failed',
  'lyrics provider report could not be written',
]);

class PublicCorpusCliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PublicCorpusCliError';
  }
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

export function parseLyricsProviderCorpusCliArgs(args) {
  if (
    !Array.isArray(args) ||
    (args.length !== 2 && args.length !== 3) ||
    (args.length === 3 && args[2] !== '--synthetic') ||
    args.some((value) => typeof value !== 'string' || value.length === 0)
  ) {
    throw new TypeError(
      'lyrics provider corpus CLI usage: <corpus.json> <report.json> [--synthetic]',
    );
  }
  const inputPath = path.resolve(args[0]);
  const outputPath = path.resolve(args[1]);
  if (comparablePath(inputPath) === comparablePath(outputPath)) {
    throw new TypeError(
      'lyrics provider corpus report must not overwrite input',
    );
  }
  const synthetic = args[2] === '--synthetic';
  return {
    inputPath,
    outputPath,
    synthetic,
    requiredCaseCount: synthetic
      ? SYNTHETIC_REQUIRED_CASE_COUNT
      : DEFAULT_REQUIRED_CASE_COUNT,
  };
}

function loadPrivateCorpus(inputPath, synthetic) {
  let descriptor;
  let serialized;
  try {
    descriptor = fs.openSync(inputPath, 'r');
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.size > MAX_PRIVATE_CORPUS_BYTES) {
      throw new PublicCorpusCliError(
        'lyrics provider corpus exceeds the size limit',
      );
    }
    const bounded = Buffer.allocUnsafe(MAX_PRIVATE_CORPUS_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.length) {
      const count = fs.readSync(
        descriptor,
        bounded,
        bytesRead,
        bounded.length - bytesRead,
        null,
      );
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_PRIVATE_CORPUS_BYTES) {
      throw new PublicCorpusCliError(
        'lyrics provider corpus exceeds the size limit',
      );
    }
    serialized = bounded.subarray(0, bytesRead).toString('utf8');
  } catch (error) {
    if (error instanceof PublicCorpusCliError) throw error;
    throw new PublicCorpusCliError('private corpus could not be read', {
      cause: error,
    });
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The descriptor was opened only for a bounded read; no data is written.
      }
    }
  }
  let corpus;
  try {
    corpus = JSON.parse(serialized);
  } catch (error) {
    throw new PublicCorpusCliError('private corpus JSON is invalid', {
      cause: error,
    });
  }
  if (
    synthetic &&
    !/^lyrics-provider-private-synthetic-v\d+$/u.test(corpus?.corpusId || '')
  ) {
    throw new TypeError('synthetic corpus id is required in synthetic mode');
  }
  return corpus;
}

function ensureDistinctExistingPaths(inputPath, outputPath) {
  if (!fs.existsSync(outputPath)) return;
  const inputStats = fs.statSync(inputPath);
  const outputStats = fs.statSync(outputPath);
  if (
    comparablePath(fs.realpathSync(inputPath)) ===
      comparablePath(fs.realpathSync(outputPath)) ||
    (inputStats.dev === outputStats.dev && inputStats.ino === outputStats.ino)
  ) {
    throw new TypeError(
      'lyrics provider corpus report must not overwrite input',
    );
  }
}

function atomicWriteReport(outputPath, report) {
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
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
    throw new PublicCorpusCliError(
      'lyrics provider report could not be written',
      { cause: error },
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Cleanup continues with the private temporary file below.
      }
    }
    if (temporaryCreated) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // The fixed public error above remains the only CLI-visible detail.
      }
    }
  }
}

export async function runLyricsProviderCorpusCli(args) {
  const command = parseLyricsProviderCorpusCliArgs(args);
  ensureDistinctExistingPaths(command.inputPath, command.outputPath);
  const corpus = loadPrivateCorpus(command.inputPath, command.synthetic);
  let result;
  try {
    result = await runPrivateLyricsCorpus(corpus, {
      requiredCaseCount: command.requiredCaseCount,
      probes: createDefaultLyricsProviderProbeRegistry(),
    });
  } catch (error) {
    throw new PublicCorpusCliError('private corpus validation failed', {
      cause: error,
    });
  }
  atomicWriteReport(command.outputPath, result);
  return command.outputPath;
}

function publicCliMessage(error) {
  return PUBLIC_CLI_MESSAGES.has(error?.message)
    ? error.message
    : 'lyrics provider corpus CLI failed';
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const outputPath = await runLyricsProviderCorpusCli(process.argv.slice(2));
    process.stdout.write(`${outputPath}\n`);
  } catch (error) {
    process.stderr.write(`${publicCliMessage(error)}\n`);
    process.exitCode = 1;
  }
}
