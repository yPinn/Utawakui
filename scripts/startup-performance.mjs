import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import featureGates from '../shared/featureGates.json' with { type: 'json' };
import startupTraceValues from '../shared/startupTraceValues.json' with { type: 'json' };

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_EXE = path.resolve('release', 'win-unpacked', 'electron.exe');
const DEFAULT_OUTPUT = path.resolve('tasks', 'startup-performance');

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

export function buildRunPlan({ coldRuns = 5, warmRuns = 5 } = {}) {
  const coldCount = requirePositiveInteger(coldRuns, 'coldRuns');
  const warmCount = requirePositiveInteger(warmRuns, 'warmRuns');
  return [
    ...Array.from({ length: coldCount }, (_, index) => ({
      scenario: 'cold',
      profileId: `cold-${index + 1}`,
    })),
    { scenario: 'warm-prime', profileId: 'warm' },
    ...Array.from({ length: warmCount }, () => ({
      scenario: 'warm',
      profileId: 'warm',
    })),
  ];
}

export function parseStartupTrace(input) {
  const lines = String(input)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('startup trace is empty');

  let entries;
  try {
    entries = lines.map(JSON.parse);
  } catch (error) {
    throw new Error(`startup trace contains invalid JSON: ${error.message}`, {
      cause: error,
    });
  }
  const sessionIds = new Set(entries.map((entry) => entry?.sessionId));
  if (sessionIds.size !== 1 || sessionIds.has(undefined)) {
    throw new Error('startup trace must contain exactly one session');
  }

  const byName = new Map();
  for (const entry of entries) {
    if (
      entry?.version !== startupTraceValues.version ||
      startupTraceValues.milestones[entry?.name] !== entry?.process ||
      !Number.isFinite(entry?.elapsedMs) ||
      entry.elapsedMs < 0 ||
      byName.has(entry.name)
    ) {
      throw new Error('startup trace violates the milestone contract');
    }
    byName.set(entry.name, entry);
  }
  for (const name of Object.keys(startupTraceValues.milestones)) {
    if (!byName.has(name)) throw new Error(`startup trace is missing ${name}`);
  }

  return {
    milestones: Object.fromEntries(
      [...byName].map(([name, entry]) => [name, entry.elapsedMs]),
    ),
    baseline: { ...byName.get('baseline-complete').metadata },
  };
}

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(quantile) || quantile <= 0 || quantile > 1) {
    throw new TypeError('quantile must be within (0, 1]');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

function summarizeNumeric(records, selectObject) {
  const keys = new Set(
    records.flatMap((record) => Object.keys(selectObject(record) ?? {})),
  );
  return Object.fromEntries(
    [...keys].flatMap((key) => {
      const values = records
        .map((record) => selectObject(record)?.[key])
        .filter((value) => Number.isFinite(value));
      return values.length
        ? [
            [
              key,
              {
                samples: values.length,
                p50: percentile(values, 0.5),
                p95: percentile(values, 0.95),
              },
            ],
          ]
        : [];
    }),
  );
}

export function summarizeRuns(runs) {
  const scenarios = {};
  for (const scenario of ['cold', 'warm']) {
    const records = runs.filter((run) => run.scenario === scenario);
    if (records.length === 0) continue;
    scenarios[scenario] = {
      runs: records.length,
      milestones: summarizeNumeric(records, (record) => record.milestones),
      baseline: summarizeNumeric(records, (record) => record.baseline),
      gpuAccelerationObserved: [
        ...new Set(
          records.map((record) => record.baseline.gpuAccelerationEnabled),
        ),
      ],
    };
  }
  return {
    method: 'nearest-rank',
    budgets: null,
    scenarios,
  };
}

function parseArguments(argv) {
  const options = {
    exe: DEFAULT_EXE,
    output: DEFAULT_OUTPUT,
    coldRuns: 5,
    warmRuns: 5,
    timeoutMs: 60_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--exe') options.exe = path.resolve(value ?? '');
    else if (flag === '--output') options.output = path.resolve(value ?? '');
    else if (flag === '--cold-runs') {
      options.coldRuns = requirePositiveInteger(value, 'coldRuns');
    } else if (flag === '--warm-runs') {
      options.warmRuns = requirePositiveInteger(value, 'warmRuns');
    } else if (flag === '--timeout-ms') {
      options.timeoutMs = requirePositiveInteger(value, 'timeoutMs');
    } else {
      throw new Error(`unknown startup performance argument: ${flag}`);
    }
    index += 1;
  }
  return options;
}

async function seedProfile(profilePath) {
  await fs.mkdir(profilePath, { recursive: true });
  const libraryPath = path.join(profilePath, 'library');
  await fs.mkdir(libraryPath, { recursive: true });
  await fs
    .writeFile(
      path.join(profilePath, 'config.json'),
      `${JSON.stringify(
        {
          version: 2,
          downloadDir: libraryPath,
          featureConfirmations: {
            'public-output-flow': {
              featureId: 'public-output-flow',
              noticeVersion: featureGates.noticeVersion,
              confirmedAt: '2026-08-23T00:00:00.000Z',
              enabled: true,
            },
          },
          outputRuntime: {
            autoStart: true,
            port: 8700,
            displayDelayMs: 0,
          },
        },
        null,
        2,
      )}\n`,
      { flag: 'wx' },
    )
    .catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
}

function runPackagedApp({ exePath, profilePath, tracePath, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      exePath,
      [
        `--user-data-dir=${profilePath}`,
        startupTraceValues.flag,
        `${startupTraceValues.fileFlagPrefix}${tracePath}`,
        startupTraceValues.exitFlag,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(`packaged startup trace timed out after ${timeoutMs}ms`),
        );
      } else if (code !== 0) {
        reject(new Error(`packaged app exited with ${code ?? signal}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const exePath = path.resolve(options.exe);
  const outputRoot = path.resolve(options.output);
  await fs.access(exePath);
  await fs.mkdir(outputRoot, { recursive: true });

  const profilesRoot = path.join(outputRoot, 'profiles');
  const tracesRoot = path.join(outputRoot, 'traces');
  await fs.mkdir(tracesRoot, { recursive: true });
  const plan = buildRunPlan(options);
  const runs = [];

  for (const [index, run] of plan.entries()) {
    const profilePath = path.join(profilesRoot, run.profileId);
    const tracePath = path.join(
      tracesRoot,
      `${String(index + 1).padStart(2, '0')}-${run.scenario}.jsonl`,
    );
    await seedProfile(profilePath);
    process.stderr.write(
      `[startup-performance] ${index + 1}/${plan.length} ${run.scenario}\n`,
    );
    await runPackagedApp({
      exePath,
      profilePath,
      tracePath,
      timeoutMs: options.timeoutMs,
    });
    const parsed = parseStartupTrace(await fs.readFile(tracePath, 'utf8'));
    if (run.scenario !== 'warm-prime') runs.push({ ...run, ...parsed });
  }

  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      logicalCpuCount: os.cpus().length,
      totalMemoryMiB: Math.round(os.totalmem() / 1024 ** 2),
      storageClass: 'not-measured',
      libraryProfile: 'isolated-empty',
    },
    runCounts: {
      cold: options.coldRuns,
      warm: options.warmRuns,
      warmPrimeExcluded: 1,
    },
    summary: summarizeRuns(runs),
    runs,
  };
  const reportPath = path.join(outputRoot, 'startup-performance.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  });
  process.stdout.write(`${reportPath}\n`);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
