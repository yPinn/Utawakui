import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const {
  createOnnxMdxJob,
} = require('../electron/lib/audioProcessing/engines/onnxMdxJob.js');

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const WORKER_PATH = path.join(
  REPO_ROOT,
  'electron',
  'lib',
  'vocalSeparationWorker.js',
);
const BENCHMARK_RECIPE_DEFINITIONS = Object.freeze({
  quick: Object.freeze({ profileId: 'mdx-kara2-v1', modelId: 'kara2' }),
  general: Object.freeze({
    profileId: 'mdx-inst-hq4-v1',
    modelId: 'inst-hq4',
  }),
  'benchmark-hq3': Object.freeze({
    profileId: 'mdx-inst-hq3-v1',
    modelId: 'inst-hq3',
  }),
});
const RESULT_PREFIX = 'UTAWAKUI_BENCHMARK_RESULT:';

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function buildResultMetrics({
  sourceBytes,
  outputBytes,
  durationSeconds,
  wallMs,
  cpuUsage,
  peakRssBytes,
}) {
  const wallSeconds = wallMs / 1000;
  const cpuSeconds = (cpuUsage.user + cpuUsage.system) / 1_000_000;
  return {
    sourceMiB: round(sourceBytes / 1024 ** 2),
    outputMiB: round(outputBytes / 1024 ** 2),
    outputToSourceRatio: round(outputBytes / sourceBytes),
    wallSeconds: round(wallSeconds),
    realtimeFactor: round(wallSeconds / durationSeconds),
    processingSpeed: round(durationSeconds / wallSeconds),
    cpuSeconds: round(cpuSeconds),
    averageCpuCores: round(cpuSeconds / wallSeconds),
    peakRssMiB: round(peakRssBytes / 1024 ** 2),
  };
}

function requireAbsolutePath(value, fieldName) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be an absolute path`);
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export function validateBenchmarkConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('benchmark config must be an object');
  }
  requireAbsolutePath(config.outputRoot, 'outputRoot');
  requireAbsolutePath(config.resultsPath, 'resultsPath');
  const outputRoot = path.resolve(config.outputRoot);
  if (!isWithin(outputRoot, path.resolve(config.resultsPath))) {
    throw new Error('resultsPath must stay inside outputRoot');
  }
  if (!Array.isArray(config.jobs) || config.jobs.length === 0) {
    throw new Error('benchmark config must contain jobs');
  }

  const outputDirs = new Set();
  for (const [index, job] of config.jobs.entries()) {
    if (!job || typeof job !== 'object') {
      throw new Error(`job ${index} must be an object`);
    }
    if (!Object.hasOwn(BENCHMARK_RECIPE_DEFINITIONS, job.recipeId)) {
      throw new Error(`job ${index} has an unsupported recipe`);
    }
    for (const field of ['inputPath', 'outputDir', 'modelPath', 'ffmpegPath']) {
      requireAbsolutePath(job[field], `job ${index}.${field}`);
    }
    if (!isSha256(job.sourceSha256) || !isSha256(job.modelSha256)) {
      throw new Error(`job ${index} must include valid source/model SHA-256`);
    }
    if (!isWithin(outputRoot, path.resolve(job.outputDir))) {
      throw new Error(
        `job ${index} output directory must stay inside outputRoot`,
      );
    }
    const normalizedOutputDir = path.resolve(job.outputDir).toLowerCase();
    if (outputDirs.has(normalizedOutputDir)) {
      throw new Error('every job must use a unique output directory');
    }
    outputDirs.add(normalizedOutputDir);
    if (
      typeof job.trackId !== 'string' ||
      typeof job.title !== 'string' ||
      typeof job.album !== 'string' ||
      !Number.isFinite(job.durationSeconds) ||
      job.durationSeconds <= 0
    ) {
      throw new Error(`job ${index} has invalid track metadata`);
    }
  }
  return config;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function probeInput(job) {
  const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const ffprobePath = path.join(path.dirname(job.ffmpegPath), ffprobeName);
  if (!fs.existsSync(ffprobePath)) return null;
  const probe = spawnSync(
    ffprobePath,
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels,bit_rate',
      '-of',
      'json',
      job.inputPath,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (probe.status !== 0) return null;
  try {
    return JSON.parse(probe.stdout).streams?.[0] || null;
  } catch {
    return null;
  }
}

function ensureFreshOutputDir(outputDir) {
  if (fs.existsSync(outputDir)) {
    const entries = fs.readdirSync(outputDir);
    if (entries.length > 0) {
      throw new Error(`benchmark output directory is not empty: ${outputDir}`);
    }
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

async function runSingleJob(job) {
  for (const filePath of [job.inputPath, job.modelPath, job.ffmpegPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`required benchmark input is missing: ${filePath}`);
    }
  }
  const [sourceSha256, modelSha256] = await Promise.all([
    hashFile(job.inputPath),
    hashFile(job.modelPath),
  ]);
  if (sourceSha256 !== job.sourceSha256.toLowerCase()) {
    throw new Error(`benchmark source checksum mismatch: ${job.inputPath}`);
  }
  if (modelSha256 !== job.modelSha256.toLowerCase()) {
    throw new Error(`benchmark model checksum mismatch: ${job.modelPath}`);
  }
  ensureFreshOutputDir(job.outputDir);

  const sourceBytes = fs.statSync(job.inputPath).size;
  const inputProbe = probeInput(job);
  const baselineRssBytes = process.memoryUsage().rss;
  let peakRssBytes = baselineRssBytes;
  const memorySampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 100);
  const wallStartedAt = performance.now();
  const cpuStartedAt = process.cpuUsage();

  try {
    const recipe = BENCHMARK_RECIPE_DEFINITIONS[job.recipeId];
    const engineJob = createOnnxMdxJob({
      workerPath: WORKER_PATH,
      workerData: {
        inputPath: job.inputPath,
        outputDir: job.outputDir,
        modelPath: job.modelPath,
        ffmpegPath: job.ffmpegPath,
        recipeId: job.recipeId,
        profileId: recipe.profileId,
        modelId: recipe.modelId,
      },
      emitProgress: ({ stage, percent }) => {
        const suffix = Number.isFinite(percent) ? ` ${percent}%` : '';
        process.stderr.write(
          `[${job.album} / ${job.title} / ${job.recipeId}] ${stage}${suffix}\n`,
        );
      },
    });
    const engineResult = await engineJob.result;
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    const wallMs = performance.now() - wallStartedAt;
    const cpuUsage = process.cpuUsage(cpuStartedAt);
    const outputBytes = fs.statSync(engineResult.stemsPath).size;
    return {
      trackId: job.trackId,
      title: job.title,
      artist: job.artist,
      album: job.album,
      recipeId: job.recipeId,
      profileId: recipe.profileId,
      modelId: recipe.modelId,
      sourceSha256,
      modelSha256,
      durationSeconds: job.durationSeconds,
      inputProbe,
      baselineRssMiB: round(baselineRssBytes / 1024 ** 2),
      ...buildResultMetrics({
        sourceBytes,
        outputBytes,
        durationSeconds: job.durationSeconds,
        wallMs,
        cpuUsage,
        peakRssBytes,
      }),
      artifactPath: engineResult.stemsPath,
    };
  } finally {
    clearInterval(memorySampler);
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function loadConfig(configPath) {
  return validateBenchmarkConfig(
    JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8')),
  );
}

function parseChildResult(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(RESULT_PREFIX));
  if (!line) throw new Error('benchmark child returned no result');
  return JSON.parse(line.slice(RESULT_PREFIX.length));
}

function runBatch(configPath) {
  const config = loadConfig(configPath);
  const startedAt = new Date().toISOString();
  const results = [];
  for (const [index, job] of config.jobs.entries()) {
    process.stdout.write(
      `Running ${index + 1}/${config.jobs.length}: ${job.album} / ${job.title} / ${job.recipeId}\n`,
    );
    const child = spawnSync(
      process.execPath,
      [SCRIPT_PATH, '--job', String(index), path.resolve(configPath)],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.status !== 0) {
      atomicWriteJson(config.resultsPath, {
        schemaVersion: 1,
        startedAt,
        failedAt: new Date().toISOString(),
        hardware: config.hardware,
        results,
        error: child.stderr || `benchmark child exited ${child.status}`,
      });
      throw new Error(`benchmark failed for ${job.title} / ${job.recipeId}`);
    }
    results.push(parseChildResult(child.stdout));
    atomicWriteJson(config.resultsPath, {
      schemaVersion: 1,
      startedAt,
      updatedAt: new Date().toISOString(),
      hardware: config.hardware,
      results,
    });
  }
  const document = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    hardware: config.hardware,
    results,
  };
  atomicWriteJson(config.resultsPath, document);
  process.stdout.write(`Results: ${config.resultsPath}\n`);
}

async function main() {
  if (process.argv[2] === '--job') {
    const index = Number(process.argv[3]);
    const config = loadConfig(process.argv[4]);
    if (!Number.isInteger(index) || !config.jobs[index]) {
      throw new Error('invalid benchmark job index');
    }
    const result = await runSingleJob(config.jobs[index]);
    process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
    return;
  }
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error(
      'usage: node scripts/audio-processing-benchmark.mjs <config.json>',
    );
  }
  runBatch(configPath);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
