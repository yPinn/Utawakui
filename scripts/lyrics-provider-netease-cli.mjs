import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildNeteasePhaseReport,
  createNeteaseEvaluationPaths,
  createNeteaseSentinelStore,
  readNeteaseEvaluationJson,
  runNeteaseSmoke,
  runNextNeteaseSentinelSlot,
  validateNeteaseSmokeManifest,
  writeNeteaseEvaluationJson,
} from './lyrics-provider-netease-evaluation.mjs';
import {
  createNeteaseRuntimeProvisioner,
  createNeteaseWorkerRunner,
  loadCurrentNeteaseRuntimeActivation,
  terminateNeteaseProcessTree,
} from './lyrics-provider-netease-runtime.mjs';
import {
  createCleanNeteaseWorkerEnvironment,
  createNeteaseRuntimePaths,
  validateNeteaseReviewCandidate,
  validateNeteaseWorkerRequest,
} from './lyrics-provider-netease-runtime-contract.mjs';

const COMMANDS = new Set([
  'provision',
  'smoke',
  'sentinel-start',
  'sentinel-run',
  'sentinel-status',
  'sentinel-stop',
  'report',
]);
const SENTINEL_INTERVAL_MS = 15 * 60 * 1000;
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const PUBLIC_RESULT_KEYS = new Set([
  'command',
  'status',
  'profileId',
  'packageVersion',
  'installedBytes',
  'caseCount',
  'selectionCorrect',
  'ambiguousCandidateCount',
  'ambiguousLanguageGroups',
  'reviewCandidates',
  'attemptedSlots',
  'requiredSlots',
  'complete',
  'running',
  'totals',
  'languageGroups',
  'provisionalOutcome',
  'productEligibility',
]);

export function parseNeteaseEvaluationCliArgs(args) {
  if (!Array.isArray(args) || args.length !== 1 || !COMMANDS.has(args[0])) {
    throw new TypeError(
      'NetEase evaluation CLI usage: provision|smoke|sentinel-start|sentinel-run|sentinel-status|sentinel-stop|report',
    );
  }
  return { command: args[0] };
}

export function sanitizeNeteaseCliResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid NetEase CLI result');
  }
  if (Object.hasOwn(value, 'reviewCandidates')) {
    if (
      !Array.isArray(value.reviewCandidates) ||
      value.reviewCandidates.length > 16
    ) {
      throw new TypeError('invalid NetEase CLI result');
    }
    for (const item of value.reviewCandidates) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        Object.keys(item).sort().join(',') !==
          ['candidate', 'languageGroup', 'reference'].sort().join(',') ||
        !new Set(['zh', 'en', 'ja', 'ko']).has(item.languageGroup)
      ) {
        throw new TypeError('invalid NetEase CLI result');
      }
      try {
        validateNeteaseWorkerRequest({
          schemaVersion: 1,
          type: 'probe',
          reference: item.reference,
        });
        validateNeteaseReviewCandidate(item.candidate);
      } catch {
        throw new TypeError('invalid NetEase CLI result');
      }
    }
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => PUBLIC_RESULT_KEYS.has(key))
      .map(([key, item]) => [key, JSON.parse(JSON.stringify(item))]),
  );
}

function loadPrivateManifest(paths) {
  return validateNeteaseSmokeManifest(
    readNeteaseEvaluationJson(
      paths.smokeManifestPath,
      'NetEase smoke manifest',
    ),
  );
}

function createActiveRunner(projectRoot) {
  const activation = loadCurrentNeteaseRuntimeActivation(projectRoot);
  const runtimePaths = createNeteaseRuntimePaths(projectRoot);
  return {
    activation,
    runner: createNeteaseWorkerRunner({
      runtimeRoot: activation.runtimeRoot,
      profileRoot: runtimePaths.profileRoot,
      workerPath: path.resolve(
        projectRoot,
        'scripts',
        'lyrics-provider-netease-worker.mjs',
      ),
    }),
  };
}

function validateLease(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      ['pid', 'schemaVersion', 'startedAt'].sort().join(',') ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt))
  ) {
    throw new Error('invalid NetEase sentinel lease');
  }
  return value;
}

function readLease(paths) {
  if (!fs.existsSync(paths.sentinelLeasePath)) return null;
  return validateLease(
    readNeteaseEvaluationJson(
      paths.sentinelLeasePath,
      'NetEase sentinel lease',
    ),
  );
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearOwnedLease(paths, pid) {
  try {
    const lease = readLease(paths);
    if (lease?.pid === pid) fs.rmSync(paths.sentinelLeasePath, { force: true });
  } catch {
    // A malformed lease remains visible to the next fixed status command.
  }
}

async function runProvision(projectRoot) {
  const provisioner = createNeteaseRuntimeProvisioner({
    projectRoot,
    templateRoot: path.resolve(
      projectRoot,
      'scripts',
      'lyrics-provider-netease-runtime',
    ),
  });
  const activation = await provisioner.provision();
  return sanitizeNeteaseCliResult({
    command: 'provision',
    status: 'ready',
    profileId: activation.profileId,
    packageVersion: activation.packageVersion,
    installedBytes: activation.installedBytes,
  });
}

async function runSmoke(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const manifest = loadPrivateManifest(paths);
  const { runner } = createActiveRunner(projectRoot);
  const reviewCandidates = [];
  const report = await runNeteaseSmoke(manifest, {
    probe: (reference) => runner.probeWithReview(reference),
    onAmbiguousCandidate: (value) => reviewCandidates.push(value),
  });
  writeNeteaseEvaluationJson(paths.smokeReportPath, report);
  return sanitizeNeteaseCliResult({
    command: 'smoke',
    status: report.selectionCorrect ? 'passed' : 'owner-review-required',
    caseCount: report.caseCount,
    selectionCorrect: report.selectionCorrect,
    ambiguousCandidateCount: report.ambiguousCandidateCount,
    ambiguousLanguageGroups: report.ambiguousLanguageGroups,
    reviewCandidates,
    totals: report.totals,
    languageGroups: report.languageGroups,
  });
}

async function runSentinelLoop(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const lease = readLease(paths);
  if (lease && lease.pid !== process.pid && processIsAlive(lease.pid)) {
    throw new Error('NetEase sentinel is already running');
  }
  writeNeteaseEvaluationJson(paths.sentinelLeasePath, {
    schemaVersion: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  try {
    const manifest = loadPrivateManifest(paths);
    const smokeReport = readNeteaseEvaluationJson(
      paths.smokeReportPath,
      'NetEase smoke report',
    );
    if (smokeReport?.selectionCorrect !== true) {
      throw new Error('NetEase smoke selection is not confirmed');
    }
    const { runner } = createActiveRunner(projectRoot);
    const store = createNeteaseSentinelStore({ projectRoot });
    let state = store.load();
    while (!state?.complete) {
      state = await runNextNeteaseSentinelSlot({
        manifest,
        store,
        probe: (reference) => runner.probe(reference),
      });
      if (!state.complete) await sleepFor(SENTINEL_INTERVAL_MS);
    }
    return sanitizeNeteaseCliResult({
      command: 'sentinel-run',
      status: 'complete',
      attemptedSlots: state.attemptedSlots,
      requiredSlots: state.requiredSlots,
      complete: state.complete,
      totals: state.totals,
      languageGroups: state.languageGroups,
    });
  } finally {
    clearOwnedLease(paths, process.pid);
  }
}

function startSentinel(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const existing = readLease(paths);
  if (existing && processIsAlive(existing.pid)) {
    return sanitizeNeteaseCliResult({
      command: 'sentinel-start',
      status: 'already-running',
      running: true,
    });
  }
  if (existing) fs.rmSync(paths.sentinelLeasePath, { force: true });
  const activation = loadCurrentNeteaseRuntimeActivation(projectRoot);
  const runtimePaths = createNeteaseRuntimePaths(projectRoot);
  const environment = createCleanNeteaseWorkerEnvironment({
    baseEnvironment: process.env,
    profileRoot: runtimePaths.profileRoot,
    runtimeRoot: activation.runtimeRoot,
  });
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), 'sentinel-run'],
    {
      cwd: projectRoot,
      detached: true,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: environment,
    },
  );
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw new Error('NetEase sentinel could not start');
  }
  writeNeteaseEvaluationJson(paths.sentinelLeasePath, {
    schemaVersion: 1,
    pid: child.pid,
    startedAt: new Date().toISOString(),
  });
  child.unref();
  return sanitizeNeteaseCliResult({
    command: 'sentinel-start',
    status: 'started',
    running: true,
  });
}

function sentinelStatus(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const lease = readLease(paths);
  const running = Boolean(lease && processIsAlive(lease.pid));
  const state = createNeteaseSentinelStore({ projectRoot }).load();
  return sanitizeNeteaseCliResult({
    command: 'sentinel-status',
    status: state?.complete
      ? 'complete'
      : state
        ? 'in-progress'
        : 'not-started',
    running,
    attemptedSlots: state?.attemptedSlots || 0,
    requiredSlots: state?.requiredSlots || 288,
    complete: state?.complete || false,
    ...(state
      ? { totals: state.totals, languageGroups: state.languageGroups }
      : {}),
  });
}

async function stopSentinel(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const lease = readLease(paths);
  if (!lease || !processIsAlive(lease.pid)) {
    fs.rmSync(paths.sentinelLeasePath, { force: true });
    return sanitizeNeteaseCliResult({
      command: 'sentinel-stop',
      status: 'not-running',
      running: false,
    });
  }
  await terminateNeteaseProcessTree({ pid: lease.pid });
  fs.rmSync(paths.sentinelLeasePath, { force: true });
  return sanitizeNeteaseCliResult({
    command: 'sentinel-stop',
    status: 'stopped',
    running: false,
  });
}

function writePhaseReport(projectRoot) {
  const paths = createNeteaseEvaluationPaths(projectRoot);
  const state = createNeteaseSentinelStore({ projectRoot }).load();
  if (!state) throw new Error('NetEase sentinel state is unavailable');
  const report = buildNeteasePhaseReport({
    state,
    smokeReport: readNeteaseEvaluationJson(
      paths.smokeReportPath,
      'NetEase smoke report',
    ),
    activation: loadCurrentNeteaseRuntimeActivation(projectRoot),
    generatedAt: new Date().toISOString(),
  });
  writeNeteaseEvaluationJson(paths.sentinelReportPath, report);
  return sanitizeNeteaseCliResult({
    command: 'report',
    status: 'written',
    provisionalOutcome: report.provisionalOutcome,
    productEligibility: report.productEligibility,
  });
}

export async function runNeteaseEvaluationCli(
  args,
  { projectRoot = PROJECT_ROOT } = {},
) {
  const { command } = parseNeteaseEvaluationCliArgs(args);
  if (command === 'provision') return runProvision(projectRoot);
  if (command === 'smoke') return runSmoke(projectRoot);
  if (command === 'sentinel-start') return startSentinel(projectRoot);
  if (command === 'sentinel-run') return runSentinelLoop(projectRoot);
  if (command === 'sentinel-status') return sentinelStatus(projectRoot);
  if (command === 'sentinel-stop') return stopSentinel(projectRoot);
  return writePhaseReport(projectRoot);
}

function publicErrorMessage(error) {
  return /usage:/iu.test(error?.message || '')
    ? error.message
    : 'NetEase evaluation CLI failed';
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const result = await runNeteaseEvaluationCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${publicErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
