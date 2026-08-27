import { fork, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  NETEASE_RUNTIME_PROFILE,
  createCleanNeteaseWorkerEnvironment,
  createNeteaseRuntimePaths,
  validateNeteaseRuntimeLock,
  validateNeteaseWorkerRequest,
  validateNeteaseWorkerResult,
} from './lyrics-provider-netease-runtime-contract.mjs';

const DEFAULT_WORKER_DEADLINE_MS = 30_000;
const MAX_WORKER_DEADLINE_MS = 120_000;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;
const MAX_TERMINATION_GRACE_MS = 5_000;
const DEFAULT_MINIMUM_START_INTERVAL_MS = 500;
const MAX_RUNTIME_BYTES = 256 * 1024 * 1024;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function failureObservation(failureCode, durationMs) {
  return {
    providerId: 'netease',
    request: {
      status: 'failed',
      durationMs: Math.max(0, Math.round(durationMs)),
      failureCode,
    },
    catalogStatus: 'not-evaluated',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  };
}

function failureWorkerResult(failureCode, durationMs) {
  return {
    observation: failureObservation(failureCode, durationMs),
    reviewCandidate: null,
  };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`invalid ${label}`, { cause: error });
  }
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function directoryBytes(root) {
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) total += fs.statSync(entryPath).size;
      else if (!entry.isSymbolicLink()) {
        throw new Error('invalid NetEase runtime filesystem entry');
      }
      if (total > MAX_RUNTIME_BYTES) {
        throw new Error('NetEase runtime exceeds the size limit');
      }
    }
  }
  return total;
}

function validateInstalledRuntime(runtimeRoot) {
  const packageRoot = path.join(
    runtimeRoot,
    'node_modules',
    '@neteasecloudmusicapienhanced',
    'api',
  );
  const packageJson = readJson(
    path.join(packageRoot, 'package.json'),
    'NetEase runtime package',
  );
  if (
    packageJson.name !== NETEASE_RUNTIME_PROFILE.packageId ||
    packageJson.version !== NETEASE_RUNTIME_PROFILE.packageVersion ||
    packageJson.license !== NETEASE_RUNTIME_PROFILE.license ||
    typeof packageJson.main !== 'string' ||
    packageJson.main.length === 0
  ) {
    throw new Error('invalid NetEase runtime package');
  }
  const mainPath = path.resolve(packageRoot, packageJson.main);
  const packagePrefix = `${path.resolve(packageRoot)}${path.sep}`;
  if (!mainPath.startsWith(packagePrefix) || !fs.statSync(mainPath).isFile()) {
    throw new Error('invalid NetEase runtime package entrypoint');
  }
  return {
    installedBytes: directoryBytes(runtimeRoot),
    packageMainPath: mainPath,
  };
}

function validateActivation(value, paths) {
  const expectedKeys = [
    'schemaVersion',
    'profileId',
    'generationId',
    'packageVersion',
    'lockSha256',
    'installedBytes',
    'activatedAt',
    'runtimeRoot',
  ].sort();
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expectedKeys.join(',') ||
    value.schemaVersion !== 1 ||
    value.profileId !== NETEASE_RUNTIME_PROFILE.profileId ||
    value.packageVersion !== NETEASE_RUNTIME_PROFILE.packageVersion ||
    !/^netease-yrc-evaluation-v1-4\.40\.1-[a-f0-9]{16}$/u.test(
      value.generationId,
    ) ||
    !/^[a-f0-9]{64}$/u.test(value.lockSha256) ||
    !Number.isSafeInteger(value.installedBytes) ||
    value.installedBytes <= 0 ||
    value.installedBytes > MAX_RUNTIME_BYTES ||
    typeof value.activatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.activatedAt)) ||
    value.runtimeRoot !== path.join(paths.generationsDir, value.generationId)
  ) {
    throw new Error('invalid NetEase runtime activation');
  }
  validateInstalledRuntime(value.runtimeRoot);
  return JSON.parse(JSON.stringify(value));
}

export function loadCurrentNeteaseRuntimeActivation(projectRoot) {
  const paths = createNeteaseRuntimePaths(projectRoot);
  return validateActivation(
    readJson(paths.currentActivationPath, 'NetEase runtime activation'),
    paths,
  );
}

function defaultInstallRuntime({
  stagingRoot,
  npmCliPath,
  nodePath,
  cacheRoot,
  profileRoot,
  spawnImpl = spawn,
}) {
  if (
    typeof npmCliPath !== 'string' ||
    !path.isAbsolute(npmCliPath) ||
    path.basename(npmCliPath).toLowerCase() !== 'npm-cli.js' ||
    typeof nodePath !== 'string' ||
    !path.isAbsolute(nodePath)
  ) {
    throw new Error('NetEase runtime npm CLI is unavailable');
  }
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.mkdirSync(profileRoot, { recursive: true });
  const environment = createCleanNeteaseWorkerEnvironment({
    baseEnvironment: process.env,
    profileRoot,
    runtimeRoot: stagingRoot,
  });
  return new Promise((resolve, reject) => {
    const installer = spawnImpl(
      nodePath,
      [
        npmCliPath,
        'ci',
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--prefix',
        stagingRoot,
      ],
      {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          ...environment,
          npm_config_cache: cacheRoot,
          npm_config_registry: 'https://registry.npmjs.org/',
        },
      },
    );
    installer.once('error', reject);
    installer.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('NetEase runtime npm install failed'));
    });
  });
}

export function createNeteaseRuntimeProvisioner(options = {}) {
  const paths = createNeteaseRuntimePaths(options.projectRoot);
  const templateRoot = options.templateRoot;
  const installRuntime = options.installRuntime || defaultInstallRuntime;
  const now = options.now || (() => new Date());
  if (
    typeof templateRoot !== 'string' ||
    !path.isAbsolute(templateRoot) ||
    typeof installRuntime !== 'function' ||
    typeof now !== 'function'
  ) {
    throw new TypeError('invalid NetEase runtime provisioner options');
  }

  async function provision() {
    const packageTemplatePath = path.join(templateRoot, 'package.json');
    const lockTemplatePath = path.join(templateRoot, 'package-lock.json');
    const packageTemplate = readJson(
      packageTemplatePath,
      'NetEase runtime package template',
    );
    const lockBytes = fs.readFileSync(lockTemplatePath);
    const lock = JSON.parse(lockBytes.toString('utf8'));
    const lockSummary = validateNeteaseRuntimeLock(lock);
    if (
      packageTemplate.name !== 'utawakui-netease-evaluation-runtime' ||
      packageTemplate.version !== '1.0.0' ||
      packageTemplate.private !== true ||
      packageTemplate.dependencies?.[NETEASE_RUNTIME_PROFILE.packageId] !==
        NETEASE_RUNTIME_PROFILE.packageVersion ||
      Object.keys(packageTemplate.dependencies || {}).length !== 1 ||
      Number(process.versions.node.split('.')[0]) <
        NETEASE_RUNTIME_PROFILE.minimumNodeMajor ||
      lockSummary.missingIntegrityCount !== 0
    ) {
      throw new Error('invalid NetEase runtime template');
    }
    const lockSha256 = createHash('sha256').update(lockBytes).digest('hex');
    const generationId = `${NETEASE_RUNTIME_PROFILE.profileId}-${NETEASE_RUNTIME_PROFILE.packageVersion}-${lockSha256.slice(0, 16)}`;
    fs.mkdirSync(paths.generationsDir, { recursive: true });
    fs.mkdirSync(paths.stagingDir, { recursive: true });
    fs.mkdirSync(paths.profileRoot, { recursive: true });

    if (fs.existsSync(paths.currentActivationPath)) {
      const current = loadCurrentNeteaseRuntimeActivation(options.projectRoot);
      if (
        current.generationId === generationId &&
        current.lockSha256 === lockSha256
      ) {
        return current;
      }
    }

    const stagingRoot = path.join(paths.stagingDir, randomUUID());
    const runtimeRoot = path.join(paths.generationsDir, generationId);
    fs.mkdirSync(stagingRoot, { recursive: false });
    try {
      fs.copyFileSync(
        packageTemplatePath,
        path.join(stagingRoot, 'package.json'),
      );
      fs.copyFileSync(
        lockTemplatePath,
        path.join(stagingRoot, 'package-lock.json'),
      );
      await installRuntime({
        stagingRoot,
        npmCliPath: options.npmCliPath || process.env.npm_execpath,
        nodePath: options.nodePath || process.execPath,
        cacheRoot: path.join(paths.root, 'npm-cache'),
        profileRoot: paths.profileRoot,
        spawnImpl: options.spawnImpl,
      });
      const installed = validateInstalledRuntime(stagingRoot);
      if (fs.existsSync(runtimeRoot)) {
        validateInstalledRuntime(runtimeRoot);
        fs.rmSync(stagingRoot, { recursive: true, force: true });
      } else {
        fs.renameSync(stagingRoot, runtimeRoot);
      }
      const activation = {
        schemaVersion: 1,
        profileId: NETEASE_RUNTIME_PROFILE.profileId,
        generationId,
        packageVersion: NETEASE_RUNTIME_PROFILE.packageVersion,
        lockSha256,
        installedBytes: installed.installedBytes,
        activatedAt: now().toISOString(),
        runtimeRoot,
      };
      atomicWriteJson(paths.currentActivationPath, activation);
      return validateActivation(activation, paths);
    } catch (error) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      throw new Error('NetEase runtime provisioning failed', { cause: error });
    }
  }

  return Object.freeze({ paths, provision });
}

export async function terminateNeteaseProcessTree(
  child,
  {
    platform = process.platform,
    systemRoot = process.env.SystemRoot || process.env.WINDIR,
    spawnImpl = spawn,
  } = {},
) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw new TypeError('invalid NetEase worker process');
  }
  if (platform !== 'win32') {
    if (typeof child.kill !== 'function' || child.kill('SIGKILL') !== true) {
      throw new Error('NetEase worker process could not be terminated');
    }
    return;
  }
  if (typeof systemRoot !== 'string' || !path.isAbsolute(systemRoot)) {
    throw new Error('NetEase worker process could not be terminated');
  }
  const taskkillPath = path.join(systemRoot, 'System32', 'taskkill.exe');
  await new Promise((resolve, reject) => {
    const killer = spawnImpl(
      taskkillPath,
      ['/PID', String(child.pid), '/T', '/F'],
      {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    killer.once('error', reject);
    killer.once('close', (code) => {
      if (code === 0 || code === 128) resolve();
      else reject(new Error('NetEase worker process could not be terminated'));
    });
  });
}

export function createNeteaseWorkerRunner(options = {}) {
  const forkImpl = options.forkImpl || fork;
  const terminateProcessTree =
    options.terminateProcessTree || terminateNeteaseProcessTree;
  const now = options.now || Date.now;
  const sleep = options.sleep || delay;
  const deadlineMs = options.deadlineMs ?? DEFAULT_WORKER_DEADLINE_MS;
  const terminationGraceMs =
    options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
  const minimumStartIntervalMs =
    options.minimumStartIntervalMs ?? DEFAULT_MINIMUM_START_INTERVAL_MS;
  if (
    typeof forkImpl !== 'function' ||
    typeof terminateProcessTree !== 'function' ||
    typeof now !== 'function' ||
    typeof sleep !== 'function' ||
    typeof options.runtimeRoot !== 'string' ||
    !path.isAbsolute(options.runtimeRoot) ||
    typeof options.profileRoot !== 'string' ||
    !path.isAbsolute(options.profileRoot) ||
    typeof options.workerPath !== 'string' ||
    !path.isAbsolute(options.workerPath) ||
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > MAX_WORKER_DEADLINE_MS ||
    !Number.isSafeInteger(terminationGraceMs) ||
    terminationGraceMs < 1 ||
    terminationGraceMs > MAX_TERMINATION_GRACE_MS ||
    !Number.isSafeInteger(minimumStartIntervalMs) ||
    minimumStartIntervalMs < DEFAULT_MINIMUM_START_INTERVAL_MS ||
    minimumStartIntervalMs > 60_000
  ) {
    throw new TypeError('invalid NetEase worker runner options');
  }

  let activeProbe = Promise.resolve();
  let lastProbeStartedAt = null;

  async function runProbe(reference) {
    let request;
    try {
      request = validateNeteaseWorkerRequest({
        schemaVersion: 1,
        type: 'probe',
        reference,
      });
    } catch {
      return Promise.resolve(failureWorkerResult('invalid-request', 0));
    }

    if (lastProbeStartedAt !== null) {
      const waitMs = Math.max(
        0,
        lastProbeStartedAt + minimumStartIntervalMs - now(),
      );
      if (waitMs > 0) await sleep(waitMs);
    }
    const startedAt = now();
    lastProbeStartedAt = startedAt;

    return new Promise((resolve) => {
      const workerEnvironment = createCleanNeteaseWorkerEnvironment({
        baseEnvironment: process.env,
        profileRoot: options.profileRoot,
        runtimeRoot: options.runtimeRoot,
      });
      for (const directory of [
        workerEnvironment.HOME,
        workerEnvironment.APPDATA,
        workerEnvironment.LOCALAPPDATA,
        workerEnvironment.TEMP,
      ]) {
        fs.mkdirSync(directory, { recursive: true });
      }
      const child = forkImpl(options.workerPath, [], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'json',
        env: workerEnvironment,
      });
      let receivedResult = null;
      let terminalFailureCode = null;
      let terminationStarted = false;
      let terminationVerificationTimer = null;
      let settled = false;

      const durationMs = () => Math.max(0, now() - startedAt);
      const timer = setTimeout(() => {
        terminalFailureCode = 'timeout';
        startTermination();
      }, deadlineMs);

      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (terminationVerificationTimer !== null) {
          clearTimeout(terminationVerificationTimer);
        }
        resolve(value);
      }

      function startTermination() {
        if (terminationStarted) return;
        terminationStarted = true;
        Promise.resolve(terminateProcessTree(child))
          .then(() => {
            if (settled) return;
            terminationVerificationTimer = setTimeout(() => {
              terminalFailureCode = 'termination-failed';
              finish(failureWorkerResult(terminalFailureCode, durationMs()));
            }, terminationGraceMs);
          })
          .catch(() => {
            terminalFailureCode = 'termination-failed';
            finish(failureWorkerResult(terminalFailureCode, durationMs()));
          });
      }

      child.once('spawn', () => {
        try {
          child.send(request);
        } catch {
          terminalFailureCode = 'worker-protocol-error';
          startTermination();
        }
      });
      child.on('message', (message) => {
        if (receivedResult !== null) {
          terminalFailureCode = 'worker-protocol-error';
          startTermination();
          return;
        }
        try {
          receivedResult = validateNeteaseWorkerResult(message);
        } catch {
          terminalFailureCode = 'worker-protocol-error';
          startTermination();
        }
      });
      child.once('error', () => {
        terminalFailureCode ||= 'worker-crash';
        startTermination();
      });
      child.once('close', (code) => {
        if (terminalFailureCode) {
          finish(failureWorkerResult(terminalFailureCode, durationMs()));
          return;
        }
        if (code !== 0 || receivedResult === null) {
          finish(failureWorkerResult('worker-crash', durationMs()));
          return;
        }
        finish({
          observation: receivedResult.observation,
          reviewCandidate: receivedResult.reviewCandidate,
        });
      });
    });
  }

  function schedule(reference) {
    const result = activeProbe.then(() => runProbe(reference));
    activeProbe = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return Object.freeze({
    probe(reference) {
      return schedule(reference).then(({ observation }) => observation);
    },
    probeWithReview(reference) {
      return schedule(reference);
    },
  });
}
