import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const contractValues = require('../shared/musicStructureContractValues.json');
const {
  isSafeTrackId,
  resolveTrackAudioPath,
} = require('../electron/lib/library/paths.js');
const {
  validateAudioPythonModelManifest,
} = require('../electron/lib/audioProcessing/audioPythonManifest.js');

const MAX_CASES = 500;
const MAX_TAGS = 16;
const MAX_PROCESS_OUTPUT_BYTES = 16 * 1024 * 1024;
const COMPONENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CANONICAL_ROLES = new Set(contractValues.canonicalSectionRoles);
const ANALYZER_ID = 'all-in-one-structure';
const PROFILE_ID = 'all-in-one-cpu-v1';

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has invalid fields`);
  }
}

function requireComponent(value, label) {
  if (!COMPONENT_RE.test(value || '') || value === '.' || value === '..') {
    throw new TypeError(`${label} is invalid`);
  }
}

function requireAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`);
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function validateCase(value) {
  assertExactKeys(
    value,
    ['benchmarkCaseId', 'trackId', 'durationMs', 'tags'],
    'real-song benchmark case',
  );
  requireComponent(value.benchmarkCaseId, 'benchmark case id');
  if (!isSafeTrackId(value.trackId)) {
    throw new TypeError('benchmark track id is unsafe');
  }
  if (
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs <= 0 ||
    value.durationMs > contractValues.maxDurationMs
  ) {
    throw new TypeError('benchmark case duration is invalid');
  }
  if (
    !Array.isArray(value.tags) ||
    value.tags.length === 0 ||
    value.tags.length > MAX_TAGS
  ) {
    throw new TypeError('benchmark case tags are invalid');
  }
  const tags = new Set();
  for (const tag of value.tags) {
    requireComponent(tag, 'benchmark case tag');
    if (tags.has(tag))
      throw new TypeError('benchmark case tags must be unique');
    tags.add(tag);
  }
}

export function validateRealSongBenchmarkConfig(value) {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'benchmarkId',
      'libraryRoot',
      'outputRoot',
      'ffmpegPath',
      'pythonPath',
      'environmentPath',
      'workerPath',
      'modelManifestPath',
      'modelPath',
      'cases',
    ],
    'real-song benchmark config',
  );
  if (value.schemaVersion !== 1) {
    throw new TypeError('unsupported real-song benchmark config version');
  }
  requireComponent(value.benchmarkId, 'benchmark id');
  for (const key of [
    'libraryRoot',
    'outputRoot',
    'ffmpegPath',
    'pythonPath',
    'environmentPath',
    'workerPath',
    'modelManifestPath',
    'modelPath',
  ]) {
    requireAbsolutePath(value[key], key);
  }
  if (isWithin(value.libraryRoot, value.outputRoot)) {
    throw new TypeError('benchmark output must stay outside the library');
  }
  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > MAX_CASES
  ) {
    throw new TypeError('real-song benchmark cases are invalid');
  }
  const caseIds = new Set();
  const trackIds = new Set();
  for (const benchmarkCase of value.cases) {
    validateCase(benchmarkCase);
    if (caseIds.has(benchmarkCase.benchmarkCaseId)) {
      throw new TypeError('benchmark case ids must be unique');
    }
    if (trackIds.has(benchmarkCase.trackId)) {
      throw new TypeError('benchmark track ids must be unique');
    }
    caseIds.add(benchmarkCase.benchmarkCaseId);
    trackIds.add(benchmarkCase.trackId);
  }
  return value;
}

export function buildWorkerRequest({ config, manifest, inputPath, jobPath }) {
  return {
    protocolVersion: 1,
    operation: 'analyze-structure',
    analyzerId: ANALYZER_ID,
    profileId: PROFILE_ID,
    modelId: manifest.id,
    modelName: manifest.wrapper.model,
    environmentPath: config.environmentPath,
    inputPath,
    jobPath,
    modelPath: config.modelPath,
    modelFiles: manifest.files.map(({ role, filename, sha256 }) => ({
      role,
      path: path.join(config.modelPath, filename),
      sha256,
    })),
  };
}

export function buildRunFingerprint({
  benchmarkCase,
  manifest,
  sourceSha256,
  workerSha256,
}) {
  validateCase(benchmarkCase);
  if (!SHA256_RE.test(sourceSha256) || !SHA256_RE.test(workerSha256)) {
    throw new TypeError('benchmark fingerprint hashes are invalid');
  }
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        analyzerId: ANALYZER_ID,
        profileId: PROFILE_ID,
        benchmarkCase,
        sourceSha256,
        workerSha256,
        model: {
          id: manifest.id,
          version: manifest.version,
          wrapper: manifest.wrapper,
          files: manifest.files.map(({ role, sizeBytes, sha256 }) => ({
            role,
            sizeBytes,
            sha256,
          })),
        },
      }),
    )
    .digest('hex');
}

function validateWorkerSection(section, durationMs, index) {
  if (
    !isPlainObject(section) ||
    !Number.isSafeInteger(section.startMs) ||
    !Number.isSafeInteger(section.endMs) ||
    section.startMs < 0 ||
    section.endMs <= section.startMs ||
    section.endMs > durationMs + contractValues.durationToleranceMs ||
    !CANONICAL_ROLES.has(section.role) ||
    !Number.isFinite(section.confidence) ||
    section.confidence < contractValues.minConfidence ||
    section.confidence > contractValues.maxConfidence
  ) {
    throw new TypeError(`worker section ${index} is invalid`);
  }
}

function validateWorkerResult(benchmarkCase, result) {
  if (
    !isPlainObject(result) ||
    result.protocolVersion !== 1 ||
    result.analyzerId !== ANALYZER_ID ||
    result.profileId !== PROFILE_ID ||
    result.modelId !== 'all-in-one-harmonix-fold0' ||
    result.offlineEnforced !== true ||
    result.noUserCache !== true ||
    !Number.isSafeInteger(result.durationMs) ||
    result.durationMs <= 0 ||
    Math.abs(result.durationMs - benchmarkCase.durationMs) >
      contractValues.durationToleranceMs ||
    !Array.isArray(result.sections) ||
    result.sections.length > contractValues.maxSections
  ) {
    throw new TypeError('worker result is invalid');
  }
  if (
    result.tempo !== null &&
    (!isPlainObject(result.tempo) ||
      !Number.isFinite(result.tempo.bpm) ||
      result.tempo.bpm < contractValues.minBpm ||
      result.tempo.bpm > contractValues.maxBpm)
  ) {
    throw new TypeError('worker tempo is invalid');
  }
  for (const [index, section] of result.sections.entries()) {
    validateWorkerSection(section, result.durationMs, index);
    if (index > 0 && section.startMs < result.sections[index - 1].endMs) {
      throw new TypeError('worker sections overlap');
    }
  }
}

function validateStoredResult(benchmarkCase, result) {
  assertExactKeys(
    result,
    ['id', 'tags', 'durationMs', 'wallMs', 'estimate'],
    'stored benchmark result',
  );
  if (
    result.id !== benchmarkCase.benchmarkCaseId ||
    JSON.stringify(result.tags) !== JSON.stringify(benchmarkCase.tags) ||
    !Number.isSafeInteger(result.durationMs) ||
    Math.abs(result.durationMs - benchmarkCase.durationMs) >
      contractValues.durationToleranceMs ||
    !Number.isSafeInteger(result.wallMs) ||
    result.wallMs < 0
  ) {
    throw new TypeError('stored benchmark result does not match its case');
  }
  if (result.estimate?.status === 'failed') {
    assertExactKeys(
      result.estimate,
      ['status', 'errorCode'],
      'stored benchmark failure',
    );
    if (!SAFE_ERROR_CODE_RE.test(result.estimate.errorCode || '')) {
      throw new TypeError('stored benchmark failure code is invalid');
    }
    return result;
  }
  assertExactKeys(
    result.estimate,
    ['status', 'bpm', 'sections'],
    'stored benchmark estimate',
  );
  if (
    result.estimate.status !== 'completed' ||
    (result.estimate.bpm !== null &&
      (!Number.isFinite(result.estimate.bpm) ||
        result.estimate.bpm < contractValues.minBpm ||
        result.estimate.bpm > contractValues.maxBpm)) ||
    !Array.isArray(result.estimate.sections) ||
    result.estimate.sections.length > contractValues.maxSections
  ) {
    throw new TypeError('stored benchmark estimate is invalid');
  }
  for (const [index, section] of result.estimate.sections.entries()) {
    assertExactKeys(
      section,
      ['startMs', 'endMs', 'role', 'confidence'],
      `stored benchmark section ${index}`,
    );
    validateWorkerSection(section, result.durationMs, index);
    if (
      index > 0 &&
      section.startMs < result.estimate.sections[index - 1].endMs
    ) {
      throw new TypeError('stored benchmark sections overlap');
    }
  }
  return result;
}

export function projectWorkerResult(benchmarkCase, result, wallMs) {
  validateCase(benchmarkCase);
  validateWorkerResult(benchmarkCase, result);
  if (!Number.isSafeInteger(wallMs) || wallMs < 0) {
    throw new TypeError('benchmark wall time is invalid');
  }
  return {
    id: benchmarkCase.benchmarkCaseId,
    tags: benchmarkCase.tags,
    durationMs: result.durationMs,
    wallMs,
    estimate: {
      status: 'completed',
      bpm: result.tempo?.bpm ?? null,
      sections: result.sections.map(({ startMs, endMs, role, confidence }) => ({
        startMs,
        endMs,
        role,
        confidence,
      })),
    },
  };
}

function projectFailure(benchmarkCase, errorCode, wallMs) {
  const safeCode = SAFE_ERROR_CODE_RE.test(errorCode || '')
    ? errorCode
    : 'BENCHMARK_FAILED';
  return {
    id: benchmarkCase.benchmarkCaseId,
    tags: benchmarkCase.tags,
    durationMs: benchmarkCase.durationMs,
    wallMs: Math.max(0, Math.round(wallMs)),
    estimate: { status: 'failed', errorCode: safeCode },
  };
}

export function buildPredictionEvidence(config, manifest, cases) {
  return {
    schemaVersion: 1,
    benchmarkId: config.benchmarkId,
    analyzer: {
      id: ANALYZER_ID,
      version: manifest.wrapper.version,
      profileId: PROFILE_ID,
      modelId: manifest.id,
    },
    cases,
  };
}

function requireFile(filePath, label) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} is missing`);
  }
}

function requireDirectory(directoryPath, label) {
  if (!fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} is missing`);
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function hashFileSync(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

async function validateRuntimeInputs(config, manifest) {
  requireDirectory(config.libraryRoot, 'benchmark library root');
  requireFile(config.ffmpegPath, 'benchmark FFmpeg');
  requireFile(config.pythonPath, 'benchmark Python');
  requireDirectory(config.environmentPath, 'benchmark environment');
  requireFile(config.workerPath, 'benchmark worker');
  requireFile(config.modelManifestPath, 'benchmark model manifest');
  requireDirectory(config.modelPath, 'benchmark model directory');
  if (
    manifest.id !== 'all-in-one-harmonix-fold0' ||
    manifest.wrapper.package !== 'all-in-one-infer' ||
    manifest.wrapper.version !== '3.1.0' ||
    manifest.distribution.status !== 'benchmark-only'
  ) {
    throw new Error('unsupported real-song benchmark model');
  }
  for (const artifact of manifest.files) {
    const filePath = path.join(config.modelPath, artifact.filename);
    requireFile(filePath, `benchmark model ${artifact.role}`);
    const stats = fs.statSync(filePath);
    if (
      stats.size !== artifact.sizeBytes ||
      (await hashFile(filePath)) !== artifact.sha256
    ) {
      throw new Error(`benchmark model ${artifact.role} verification failed`);
    }
  }
  return { workerSha256: await hashFile(config.workerPath) };
}

function boundedAppend(current, chunk, label) {
  const next = current + chunk;
  if (Buffer.byteLength(next) > MAX_PROCESS_OUTPUT_BYTES) {
    throw new Error(`${label} exceeded the output limit`);
  }
  return next;
}

function runProcess(command, args, { input, onStdoutLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let pendingLine = '';
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    child.on('error', (error) => settle(reject, error));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      try {
        stdout = boundedAppend(stdout, chunk, 'benchmark stdout');
        pendingLine += chunk;
        const lines = pendingLine.split(/\r?\n/);
        pendingLine = lines.pop() ?? '';
        for (const line of lines) onStdoutLine?.(line);
      } catch (error) {
        child.kill();
        settle(reject, error);
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        stderr = boundedAppend(stderr, chunk, 'benchmark stderr');
      } catch (error) {
        child.kill();
        settle(reject, error);
      }
    });
    child.on('close', (code) => {
      if (pendingLine) onStdoutLine?.(pendingLine);
      settle(resolve, { code, stdout, stderr });
    });
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadCachedResult(
  resultPath,
  cachePath,
  cacheKey,
  benchmarkCase,
) {
  try {
    const cache = loadJson(cachePath);
    assertExactKeys(
      cache,
      ['schemaVersion', 'cacheKey', 'resultSha256'],
      'benchmark cache',
    );
    if (
      cache.schemaVersion !== 1 ||
      cache.cacheKey !== cacheKey ||
      !SHA256_RE.test(cache.resultSha256) ||
      hashFileSync(resultPath) !== cache.resultSha256
    ) {
      return null;
    }
    return validateStoredResult(benchmarkCase, loadJson(resultPath));
  } catch {
    return null;
  }
}

function parseWorkerTerminal(stdout) {
  const messages = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const terminal = messages.at(-1);
  if (terminal?.type === 'done') return terminal.result;
  const error = new Error('benchmark worker failed');
  error.code = SAFE_ERROR_CODE_RE.test(terminal?.code || '')
    ? terminal.code
    : 'WORKER_FAILED';
  throw error;
}

async function runCase(
  config,
  manifest,
  benchmarkCase,
  { force = false } = {},
) {
  const jobDirectory = path.resolve(
    config.outputRoot,
    benchmarkCase.benchmarkCaseId,
  );
  if (!isWithin(config.outputRoot, jobDirectory)) {
    throw new Error('benchmark job path escaped the output root');
  }
  const resultPath = path.join(jobDirectory, 'result.json');
  const cachePath = path.join(jobDirectory, 'cache.json');

  const startedAt = performance.now();
  const workDirectory = path.join(jobDirectory, 'work');
  if (!isWithin(jobDirectory, workDirectory)) {
    throw new Error('benchmark work path escaped the job directory');
  }
  fs.rmSync(workDirectory, { recursive: true, force: true });
  fs.mkdirSync(workDirectory, { recursive: true });
  try {
    const audioPath = resolveTrackAudioPath(
      config.libraryRoot,
      benchmarkCase.trackId,
    );
    if (!audioPath) {
      const error = new Error('benchmark source is missing');
      error.code = 'SOURCE_MISSING';
      throw error;
    }
    const cacheKey = buildRunFingerprint({
      benchmarkCase,
      manifest,
      sourceSha256: await hashFile(audioPath),
      workerSha256: config.workerSha256,
    });
    if (!force) {
      const cached = loadCachedResult(
        resultPath,
        cachePath,
        cacheKey,
        benchmarkCase,
      );
      if (cached) {
        process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] cached\n`);
        return cached;
      }
    }
    fs.rmSync(cachePath, { force: true });
    const decodedPath = path.join(workDirectory, 'input.wav');
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] decoding\n`);
    const decode = await runProcess(config.ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      audioPath,
      '-vn',
      '-sn',
      '-dn',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      decodedPath,
    ]);
    if (decode.code !== 0) {
      const error = new Error('benchmark decode failed');
      error.code = 'DECODE_FAILED';
      throw error;
    }
    const request = buildWorkerRequest({
      config,
      manifest,
      inputPath: decodedPath,
      jobPath: workDirectory,
    });
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] analyzing\n`);
    const worker = await runProcess(
      config.pythonPath,
      ['-I', config.workerPath],
      {
        input: `${JSON.stringify(request)}\n`,
        onStdoutLine: (line) => {
          try {
            const message = JSON.parse(line);
            if (message.type === 'progress') {
              process.stderr.write(
                `[${benchmarkCase.benchmarkCaseId}] ${message.stage} ${message.percent}%\n`,
              );
            }
          } catch {
            // The bounded terminal parser reports malformed worker output.
          }
        },
      },
    );
    if (worker.code !== 0) {
      const error = new Error('benchmark worker exited unsuccessfully');
      error.code = 'WORKER_FAILED';
      throw error;
    }
    const result = projectWorkerResult(
      benchmarkCase,
      parseWorkerTerminal(worker.stdout),
      Math.round(performance.now() - startedAt),
    );
    atomicWriteJson(resultPath, result);
    atomicWriteJson(cachePath, {
      schemaVersion: 1,
      cacheKey,
      resultSha256: hashFileSync(resultPath),
    });
    process.stderr.write(`[${benchmarkCase.benchmarkCaseId}] completed\n`);
    return result;
  } catch (error) {
    const failure = projectFailure(
      benchmarkCase,
      error.code,
      performance.now() - startedAt,
    );
    fs.rmSync(cachePath, { force: true });
    atomicWriteJson(resultPath, failure);
    process.stderr.write(
      `[${benchmarkCase.benchmarkCaseId}] failed ${failure.estimate.errorCode}\n`,
    );
    return failure;
  } finally {
    fs.rmSync(workDirectory, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  if (!argv[0]) {
    throw new Error(
      'usage: node scripts/music-analysis-real-song-benchmark.mjs <config.json> [--case <id>] [--force]',
    );
  }
  const options = {
    configPath: path.resolve(argv[0]),
    caseId: null,
    force: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--force') {
      options.force = true;
    } else if (argv[index] === '--case' && argv[index + 1]) {
      options.caseId = argv[index + 1];
      index += 1;
    } else {
      throw new Error('invalid real-song benchmark arguments');
    }
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const config = validateRealSongBenchmarkConfig(loadJson(options.configPath));
  const manifest = validateAudioPythonModelManifest(
    loadJson(config.modelManifestPath),
  );
  Object.assign(config, await validateRuntimeInputs(config, manifest));
  fs.mkdirSync(config.outputRoot, { recursive: true });
  const selectedCases = options.caseId
    ? config.cases.filter(
        (benchmarkCase) => benchmarkCase.benchmarkCaseId === options.caseId,
      )
    : config.cases;
  if (selectedCases.length === 0) {
    throw new Error('requested benchmark case does not exist');
  }
  const results = [];
  for (const benchmarkCase of selectedCases) {
    results.push(
      await runCase(config, manifest, benchmarkCase, {
        force: options.force,
      }),
    );
  }
  const evidence = buildPredictionEvidence(config, manifest, results);
  const evidencePath = path.join(config.outputRoot, 'predictions.json');
  atomicWriteJson(evidencePath, evidence);
  process.stdout.write(`${evidencePath}\n`);
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
