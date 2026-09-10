'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');

let artifactFs = fs;
try {
  artifactFs = require('original-fs');
} catch {
  // Plain Node tests do not provide Electron's physical-filesystem module.
}

const MAX_BENCHMARK_BYTES = 8 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 60_000;
const MAX_ARTIFACT_ENTRIES = 100_000;
const MAX_ARTIFACT_SCAN_MS = 10_000;

function roundMetric(value) {
  return Number(value.toFixed(6));
}

function readBenchmark(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) throw new TypeError('benchmark input must be a file');
  if (stats.size > MAX_BENCHMARK_BYTES) {
    throw new TypeError('benchmark input exceeds the size limit');
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function directorySize(
  rootPath,
  {
    maximumEntries = MAX_ARTIFACT_ENTRIES,
    maximumElapsedMs = MAX_ARTIFACT_SCAN_MS,
    now = () => performance.now(),
  } = {},
) {
  let total = 0;
  let entryCount = 0;
  const startedAt = now();
  const pending = [rootPath];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of artifactFs.readdirSync(current, {
      withFileTypes: true,
    })) {
      entryCount += 1;
      if (entryCount > maximumEntries) {
        throw new TypeError('packaged application exceeds the entry limit');
      }
      if (now() - startedAt > maximumElapsedMs) {
        throw new TypeError('packaged application scan timed out');
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) total += artifactFs.statSync(entryPath).size;
      else throw new TypeError('packaged application has an unsupported entry');
    }
  }
  return total;
}

function assertTrustedPackageRoot(packagePath, executablePath) {
  const realpath = artifactFs.realpathSync.native ?? artifactFs.realpathSync;
  const resolvedPackagePath = realpath(path.resolve(packagePath));
  const executableRoot = realpath(path.dirname(path.resolve(executablePath)));
  if (resolvedPackagePath.toLowerCase() !== executableRoot.toLowerCase()) {
    throw new TypeError(
      'packaged application root must match the invoking executable',
    );
  }
  return resolvedPackagePath;
}

function assertWorkerResult(result, expectedLines, baselineAnalyzerId) {
  if (
    !result ||
    result.analyzer?.id !== baselineAnalyzerId ||
    typeof result.analyzer.version !== 'string' ||
    !Array.isArray(result.lines) ||
    result.lines.length !== expectedLines.length
  ) {
    throw new TypeError('packaged reading worker result is invalid');
  }
  for (let index = 0; index < expectedLines.length; index += 1) {
    const line = result.lines[index];
    if (
      line?.text !== expectedLines[index] ||
      !Array.isArray(line.segments) ||
      line.segments.map((segment) => segment?.t).join('') !==
        expectedLines[index]
    ) {
      throw new TypeError('packaged reading worker corrupted canonical text');
    }
  }
}

function runWorker(workerPath, lines, baselineAnalyzerId) {
  return new Promise((resolve, reject) => {
    const rssBeforeBytes = process.memoryUsage().rss;
    let peakProcessRssBytes = rssBeforeBytes;
    const startedAt = performance.now();
    const worker = new Worker(workerPath, {
      workerData: { lines, script: 'ja' },
    });
    const sampler = setInterval(() => {
      peakProcessRssBytes = Math.max(
        peakProcessRssBytes,
        process.memoryUsage().rss,
      );
    }, 5);
    const timeout = setTimeout(() => {
      finish(new Error('packaged reading worker timed out'));
    }, WORKER_TIMEOUT_MS);
    let finished = false;

    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearInterval(sampler);
      clearTimeout(timeout);
      worker.terminate().finally(() => {
        if (error) reject(error);
        else resolve(result);
      });
    }

    worker.on('message', (message) => {
      if (message?.type === 'error') {
        finish(new Error('packaged reading worker reported an error'));
        return;
      }
      if (message?.type !== 'done') return;
      try {
        assertWorkerResult(message.result, lines, baselineAnalyzerId);
        const coldWorkerMs = performance.now() - startedAt;
        const rssAfterBytes = process.memoryUsage().rss;
        finish(null, {
          analyzer: message.result.analyzer,
          coldWorkerMs: roundMetric(coldWorkerMs),
          coldBatchLinesPerSecond: roundMetric(
            (lines.length * 1000) / coldWorkerMs,
          ),
          rssBeforeBytes,
          rssAfterBytes,
          peakProcessRssBytes: Math.max(
            peakProcessRssBytes,
            rssAfterBytes,
            process.resourceUsage().maxRSS * 1024,
          ),
        });
      } catch (error) {
        finish(error);
      }
    });
    worker.on('error', (error) => finish(error));
    worker.on('exit', () => {
      if (!finished) {
        finish(
          new Error('packaged reading worker exited before returning a result'),
        );
      }
    });
  });
}

function writeJsonNoClobber(outputPath, value) {
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
      // Preserve the original write error.
    }
    throw error;
  }
}

async function main(argv) {
  const [packagePath, benchmarkPath, outputPath, installerPath] = argv;
  if (!packagePath || !benchmarkPath || !outputPath || argv.length > 4) {
    throw new TypeError(
      'Usage: <package-root> <benchmark.json> <output.json> [installer.exe]',
    );
  }
  if (!process.versions.electron) {
    throw new TypeError('packaged evaluation must run with packaged Electron');
  }
  const resolvedPackagePath = assertTrustedPackageRoot(
    packagePath,
    process.execPath,
  );
  const benchmark = readBenchmark(benchmarkPath);
  const contractUrl = pathToFileURL(
    path.join(__dirname, 'lib', 'lyricsReadingEvaluation', 'contract.mjs'),
  ).href;
  const { validateLyricsReadingBenchmark } = await import(contractUrl);
  validateLyricsReadingBenchmark(benchmark);
  const lines = benchmark.cases.map(
    (benchmarkCase) => benchmarkCase.lines[benchmarkCase.targetLineIndex],
  );
  const workerPath = path.join(
    resolvedPackagePath,
    'resources',
    'app.asar',
    'electron',
    'lib',
    'lyricsReadingWorker.js',
  );
  const performanceResult = await runWorker(
    workerPath,
    lines,
    benchmark.baselineAnalyzerId,
  );
  const installerBytes = installerPath
    ? fs.statSync(path.resolve(installerPath)).size
    : null;
  const report = {
    schemaVersion: 1,
    benchmarkId: benchmark.benchmarkId,
    analyzer: performanceResult.analyzer,
    lineCount: lines.length,
    performance: {
      coldWorkerMs: performanceResult.coldWorkerMs,
      coldBatchLinesPerSecond: performanceResult.coldBatchLinesPerSecond,
      rssBeforeBytes: performanceResult.rssBeforeBytes,
      rssAfterBytes: performanceResult.rssAfterBytes,
      peakProcessRssBytes: performanceResult.peakProcessRssBytes,
    },
    artifacts: {
      installerBytes,
      unpackedBytes: directorySize(resolvedPackagePath),
    },
  };
  writeJsonNoClobber(outputPath, report);
  process.stdout.write(`${path.resolve(outputPath)}\n`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertTrustedPackageRoot,
  assertWorkerResult,
  directorySize,
  runWorker,
  writeJsonNoClobber,
};
