import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateLyricsReadingBenchmark } from './lib/lyricsReadingEvaluation/contract.mjs';
import { runKuromojiReadingBenchmark } from './lib/lyricsReadingEvaluation/runner.mjs';

export { validateLyricsReadingBenchmark } from './lib/lyricsReadingEvaluation/contract.mjs';
export { scoreLyricsReadingBenchmark } from './lib/lyricsReadingEvaluation/scoring.mjs';
export {
  collectLyricsReadingObservations,
  runKuromojiReadingBenchmark,
} from './lib/lyricsReadingEvaluation/runner.mjs';

const MAX_BENCHMARK_BYTES = 8 * 1024 * 1024;

function readBenchmark(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) throw new TypeError('benchmark input must be a file');
  if (stats.size > MAX_BENCHMARK_BYTES) {
    throw new TypeError('benchmark input exceeds the size limit');
  }
  const benchmark = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  return validateLyricsReadingBenchmark(benchmark);
}

function writeJsonAtomic(outputPath, value) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
    });
    fs.linkSync(temporaryPath, resolvedPath);
    fs.rmSync(temporaryPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error; temp cleanup is best-effort.
    }
    throw error;
  }
}

async function main(argv) {
  const [inputPath, outputPath] = argv;
  if (!inputPath || argv.length > 2) {
    throw new TypeError(
      'Usage: node scripts/lyrics-reading-evaluation.mjs <input.json> [output.json]',
    );
  }
  if (
    outputPath &&
    path.resolve(inputPath).toLowerCase() ===
      path.resolve(outputPath).toLowerCase()
  ) {
    throw new TypeError('benchmark output must not overwrite its input');
  }

  const report = await runKuromojiReadingBenchmark(readBenchmark(inputPath));
  if (outputPath) {
    writeJsonAtomic(outputPath, report);
    process.stdout.write(`${path.resolve(outputPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
