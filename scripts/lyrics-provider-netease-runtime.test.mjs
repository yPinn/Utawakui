import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_LYRICS_PROVIDER_DESCRIPTORS } from './lyrics-provider-probe-registry.mjs';
import {
  NETEASE_RUNTIME_PROFILE,
  createCleanNeteaseWorkerEnvironment,
  createNeteaseRuntimePaths,
  validateNeteaseReviewCandidate,
  validateNeteaseRuntimeLock,
  validateNeteaseWorkerRequest,
  validateNeteaseWorkerResult,
} from './lyrics-provider-netease-runtime-contract.mjs';
import {
  createNeteaseRuntimeProvisioner,
  createNeteaseWorkerRunner,
  loadCurrentNeteaseRuntimeActivation,
  terminateNeteaseProcessTree,
} from './lyrics-provider-netease-runtime.mjs';

const temporaryRoots = [];

function makeTemporaryRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-netease-runtime-test-'),
  );
  temporaryRoots.push(root);
  return root;
}

function reference(overrides = {}) {
  return {
    title: 'Synthetic Example',
    artist: 'Example Artist',
    album: 'Example Album',
    durationSeconds: 180,
    version: 'studio',
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    providerId: 'netease',
    request: { status: 'ok', durationMs: 250, failureCode: null },
    catalogStatus: 'match',
    matchBand: 'exact',
    reviewVerdict: 'unreviewed',
    capability: 'T2',
    timingValidation: 'valid',
    ...overrides,
  };
}

function reviewCandidate(overrides = {}) {
  return {
    title: 'Synthetic Example',
    artists: ['Example Artist'],
    album: 'Example Album',
    durationSeconds: 180,
    matchBand: 'exact',
    durationDeltaSeconds: 0,
    versionMismatch: false,
    ...overrides,
  };
}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 4312;
    this.connected = true;
    this.send = vi.fn();
    this.disconnect = vi.fn(() => {
      this.connected = false;
    });
  }
}

afterEach(() => {
  vi.useRealTimers();
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('NetEase evaluation runtime contract', () => {
  it('pins the maintained reverse client without changing production registries', () => {
    expect(NETEASE_RUNTIME_PROFILE).toEqual({
      schemaVersion: 1,
      profileId: 'netease-yrc-evaluation-v1',
      packageId: '@neteasecloudmusicapienhanced/api',
      packageVersion: '4.40.1',
      packageIntegrity:
        'sha512-RUpVnxUCkeEt0yYeElc+UvCXqucikI/PIlJaLj18FlwHQ8X9wk4QkM/h7C+qePC97COMODcmgRXKgWO94YLuWA==',
      packageUnpackedSize: 15_322_633,
      license: 'MIT',
      minimumNodeMajor: 24,
    });
    expect(FIXED_LYRICS_PROVIDER_DESCRIPTORS.map(({ id }) => id)).toEqual([
      'lrclib',
      'amll',
    ]);

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(packageJson.dependencies).not.toHaveProperty(
      NETEASE_RUNTIME_PROFILE.packageId,
    );
    expect(packageJson.devDependencies).not.toHaveProperty(
      NETEASE_RUNTIME_PROFILE.packageId,
    );
    expect(fs.readFileSync('electron-builder.yml', 'utf8')).not.toContain(
      'lyrics-provider-netease',
    );
  });

  it('validates the complete independent npm lock and every registry artifact integrity', () => {
    const lock = JSON.parse(
      fs.readFileSync(
        'scripts/lyrics-provider-netease-runtime/package-lock.json',
        'utf8',
      ),
    );
    const summary = validateNeteaseRuntimeLock(lock);

    expect(summary.packageVersion).toBe('4.40.1');
    expect(summary.packageIntegrity).toBe(
      NETEASE_RUNTIME_PROFILE.packageIntegrity,
    );
    expect(summary.lockedPackageCount).toBeGreaterThan(100);
    expect(summary.missingIntegrityCount).toBe(0);
  });

  it('derives one ignored runtime root separate from node_modules and application data', () => {
    const projectRoot = makeTemporaryRoot();
    const paths = createNeteaseRuntimePaths(projectRoot);

    expect(paths.root).toBe(
      path.join(
        projectRoot,
        '.benchmarks',
        'lyrics-provider',
        'netease-runtime',
      ),
    );
    expect(paths.generationsDir).toBe(path.join(paths.root, 'generations'));
    expect(paths.currentActivationPath).toBe(
      path.join(paths.root, 'current.json'),
    );
    expect(paths.profileRoot).toBe(path.join(paths.root, 'profile'));
    expect(paths.root).not.toContain('node_modules');
    expect(paths.root).not.toContain('userData');
  });

  it('constructs an explicit worker environment without inherited credentials or Node hooks', () => {
    const root = makeTemporaryRoot();
    const environment = createCleanNeteaseWorkerEnvironment({
      baseEnvironment: {
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
        PATH: 'private path',
        HOME: 'private home',
        USERPROFILE: 'private profile',
        APPDATA: 'private roaming',
        LOCALAPPDATA: 'private local',
        TEMP: 'private temp',
        HTTP_PROXY: 'http://credential@example.invalid',
        npm_config_userconfig: 'private npmrc',
        NETEASE_COOKIE: 'private cookie',
        NODE_OPTIONS: '--require private-hook.js',
        ELECTRON_RUN_AS_NODE: '1',
      },
      profileRoot: path.join(root, 'profile'),
      runtimeRoot: path.join(root, 'generation'),
    });

    expect(environment).toEqual({
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      HOME: path.join(root, 'profile', 'home'),
      USERPROFILE: path.join(root, 'profile', 'home'),
      APPDATA: path.join(root, 'profile', 'roaming'),
      LOCALAPPDATA: path.join(root, 'profile', 'local'),
      TEMP: path.join(root, 'profile', 'temp'),
      TMP: path.join(root, 'profile', 'temp'),
      UTAWAKUI_NETEASE_RUNTIME_ROOT: path.join(root, 'generation'),
    });
    expect(JSON.stringify(environment)).not.toMatch(
      /cookie|credential|npmrc|private-hook|private path/iu,
    );
  });

  it('accepts only exact bounded one-request and one-result IPC schemas', () => {
    expect(
      validateNeteaseWorkerRequest({
        schemaVersion: 1,
        type: 'probe',
        reference: reference(),
      }),
    ).toEqual({
      schemaVersion: 1,
      type: 'probe',
      reference: reference(),
    });
    expect(
      validateNeteaseWorkerResult({
        schemaVersion: 1,
        type: 'result',
        observation: observation(),
        reviewCandidate: reviewCandidate(),
      }),
    ).toEqual({
      schemaVersion: 1,
      type: 'result',
      observation: observation(),
      reviewCandidate: reviewCandidate(),
    });

    expect(() =>
      validateNeteaseWorkerRequest({
        schemaVersion: 1,
        type: 'probe',
        reference: reference(),
        cookie: 'forbidden',
      }),
    ).toThrow(/worker request/i);
    expect(() =>
      validateNeteaseWorkerResult({
        schemaVersion: 1,
        type: 'result',
        observation: observation(),
        reviewCandidate: reviewCandidate(),
        providerBody: 'forbidden',
      }),
    ).toThrow(/worker result/i);
    expect(() =>
      validateNeteaseWorkerResult({
        schemaVersion: 2,
        type: 'result',
        observation: observation(),
        reviewCandidate: reviewCandidate(),
      }),
    ).toThrow(/worker result/i);
  });

  it('rejects malformed IPC primitives, cycles, references, candidates, and mismatched results', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => validateNeteaseWorkerRequest(cyclic)).toThrow(
      /worker request/i,
    );
    expect(() => validateNeteaseWorkerRequest(null)).toThrow(/worker request/i);
    expect(() =>
      validateNeteaseWorkerRequest({
        schemaVersion: 2,
        type: 'probe',
        reference: reference(),
      }),
    ).toThrow(/worker request/i);
    for (const invalidReference of [
      reference({ title: '\u0000' }),
      reference({ artist: '' }),
      reference({ durationSeconds: 0 }),
      reference({ version: 'bootleg' }),
    ]) {
      expect(() =>
        validateNeteaseWorkerRequest({
          schemaVersion: 1,
          type: 'probe',
          reference: invalidReference,
        }),
      ).toThrow(/worker reference/i);
    }

    expect(validateNeteaseReviewCandidate(null)).toBeNull();
    for (const candidate of [
      reviewCandidate({ artists: [] }),
      reviewCandidate({ artists: ['a', 'b', 'c', 'd', 'e'] }),
      reviewCandidate({ album: '' }),
      reviewCandidate({ durationSeconds: Number.NaN }),
      reviewCandidate({ matchBand: 'related' }),
      reviewCandidate({ durationDeltaSeconds: -1 }),
      reviewCandidate({ versionMismatch: 'no' }),
    ]) {
      expect(() => validateNeteaseReviewCandidate(candidate)).toThrow(
        /review candidate/i,
      );
    }
    expect(() =>
      validateNeteaseWorkerResult({
        schemaVersion: 1,
        type: 'result',
        observation: {},
        reviewCandidate: null,
      }),
    ).toThrow(/worker result/i);
    expect(() =>
      validateNeteaseWorkerResult({
        schemaVersion: 1,
        type: 'result',
        observation: observation(),
        reviewCandidate: reviewCandidate({ matchBand: 'strong' }),
      }),
    ).toThrow(/worker result/i);
  });

  it('omits unavailable operating-system variables from the clean worker environment', () => {
    const root = makeTemporaryRoot();
    expect(
      createCleanNeteaseWorkerEnvironment({
        baseEnvironment: {},
        profileRoot: path.join(root, 'profile'),
        runtimeRoot: path.join(root, 'runtime'),
      }),
    ).not.toHaveProperty('SystemRoot');
    expect(
      createCleanNeteaseWorkerEnvironment({
        profileRoot: path.join(root, 'default-environment-profile'),
        runtimeRoot: path.join(root, 'default-environment-runtime'),
      }),
    ).toHaveProperty('UTAWAKUI_NETEASE_RUNTIME_ROOT');
    expect(() =>
      createCleanNeteaseWorkerEnvironment({
        baseEnvironment: null,
        profileRoot: path.join(root, 'profile'),
        runtimeRoot: path.join(root, 'runtime'),
      }),
    ).toThrow(/environment inputs/i);
  });

  it('rejects lock shape and provenance drift while counting incomplete artifacts', () => {
    const lock = JSON.parse(
      fs.readFileSync(
        'scripts/lyrics-provider-netease-runtime/package-lock.json',
        'utf8',
      ),
    );
    expect(() => validateNeteaseRuntimeLock({ ...lock, extra: true })).toThrow(
      /runtime lock/i,
    );
    expect(() =>
      validateNeteaseRuntimeLock({ ...lock, name: 'wrong-runtime' }),
    ).toThrow(/runtime lock/i);
    expect(() =>
      validateNeteaseRuntimeLock({
        ...lock,
        packages: { ...lock.packages, 'invalid/path': {} },
      }),
    ).toThrow(/locked package/i);
    const incomplete = structuredClone(lock);
    const incompletePath = Object.keys(incomplete.packages).find(
      (packagePath) =>
        packagePath.startsWith('node_modules/') &&
        packagePath !== `node_modules/${NETEASE_RUNTIME_PROFILE.packageId}`,
    );
    delete incomplete.packages[incompletePath].integrity;
    expect(validateNeteaseRuntimeLock(incomplete).missingIntegrityCount).toBe(
      1,
    );

    const rootDrift = structuredClone(lock);
    rootDrift.packages[''].dependencies = {};
    expect(() => validateNeteaseRuntimeLock(rootDrift)).toThrow(/lock root/i);
    const packageDrift = structuredClone(lock);
    packageDrift.packages[
      `node_modules/${NETEASE_RUNTIME_PROFILE.packageId}`
    ].integrity = 'sha512-wrong';
    expect(() => validateNeteaseRuntimeLock(packageDrift)).toThrow(
      /package lock/i,
    );
  });
});

describe('killable NetEase one-shot worker runner', () => {
  it('rejects invalid runner options and returns a typed invalid request', async () => {
    expect(() => createNeteaseWorkerRunner()).toThrow(/runner options/i);
    const runner = createNeteaseWorkerRunner({
      forkImpl: () => new FakeChild(),
      terminateProcessTree: vi.fn(),
      runtimeRoot: makeTemporaryRoot(),
      profileRoot: makeTemporaryRoot(),
      workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
      deadlineMs: 1000,
    });
    await expect(
      runner.probe({ title: 'missing fields' }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-request' },
    });
  });

  it('suppresses child output, sends one validated request, and waits for clean exit', async () => {
    const child = new FakeChild();
    const forkImpl = vi.fn(() => child);
    const terminateProcessTree = vi.fn();
    const runtimeRoot = makeTemporaryRoot();
    const runner = createNeteaseWorkerRunner({
      forkImpl,
      terminateProcessTree,
      runtimeRoot,
      profileRoot: path.join(runtimeRoot, 'profile'),
      workerPath: path.join(runtimeRoot, 'worker.mjs'),
      deadlineMs: 1000,
    });

    const pending = runner.probe(reference());
    await Promise.resolve();
    child.emit('spawn');
    expect(child.send).toHaveBeenCalledOnce();
    child.emit('message', {
      schemaVersion: 1,
      type: 'result',
      observation: observation(),
      reviewCandidate: reviewCandidate(),
    });
    child.emit('close', 0, null);

    await expect(pending).resolves.toEqual(observation());
    expect(forkImpl).toHaveBeenCalledWith(
      path.join(runtimeRoot, 'worker.mjs'),
      [],
      expect.objectContaining({
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'json',
      }),
    );
    expect(terminateProcessTree).not.toHaveBeenCalled();
  });

  it('terminates the real process boundary on deadline instead of racing a background request', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const terminateProcessTree = vi.fn(async () => {
      child.emit('close', 1, 'SIGKILL');
    });
    const runner = createNeteaseWorkerRunner({
      forkImpl: () => child,
      terminateProcessTree,
      runtimeRoot: makeTemporaryRoot(),
      profileRoot: makeTemporaryRoot(),
      workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
      deadlineMs: 100,
    });

    const pending = runner.probe(reference());
    await Promise.resolve();
    child.emit('spawn');
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
    });
    expect(terminateProcessTree).toHaveBeenCalledWith(child);
  });

  it('reports termination failure when a kill request succeeds but the worker never closes', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const terminateProcessTree = vi.fn(async () => undefined);
    const runner = createNeteaseWorkerRunner({
      forkImpl: () => child,
      terminateProcessTree,
      runtimeRoot: makeTemporaryRoot(),
      profileRoot: makeTemporaryRoot(),
      workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
      deadlineMs: 100,
      terminationGraceMs: 50,
    });

    const pending = runner.probe(reference());
    await Promise.resolve();
    child.emit('spawn');
    await vi.advanceTimersByTimeAsync(150);

    await expect(pending).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'termination-failed' },
    });
    expect(terminateProcessTree).toHaveBeenCalledWith(child);
  });

  it('enforces a minimum start interval across one-shot worker processes', async () => {
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds) => {
      currentTime += milliseconds;
    });
    const children = [];
    const runner = createNeteaseWorkerRunner({
      forkImpl: () => {
        const child = new FakeChild();
        children.push(child);
        queueMicrotask(() => {
          child.emit('spawn');
          child.emit('message', {
            schemaVersion: 1,
            type: 'result',
            observation: observation(),
            reviewCandidate: reviewCandidate(),
          });
          child.emit('close', 0, null);
        });
        return child;
      },
      terminateProcessTree: vi.fn(),
      runtimeRoot: makeTemporaryRoot(),
      profileRoot: makeTemporaryRoot(),
      workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
      deadlineMs: 1000,
      minimumStartIntervalMs: 500,
      sleep,
      now: () => currentTime,
    });

    await runner.probe(reference());
    await runner.probe(reference({ title: 'Second Example' }));
    currentTime += 500;
    await runner.probe(reference({ title: 'Third Example' }));

    expect(children).toHaveLength(3);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('kills the worker after malformed, duplicate, or oversized IPC', async () => {
    for (const messages of [
      [{ type: 'unknown' }],
      [
        {
          schemaVersion: 1,
          type: 'result',
          observation: observation(),
          reviewCandidate: reviewCandidate(),
        },
        {
          schemaVersion: 1,
          type: 'result',
          observation: observation(),
          reviewCandidate: reviewCandidate(),
        },
      ],
      ['x'.repeat(5000)],
    ]) {
      const child = new FakeChild();
      const terminateProcessTree = vi.fn(async () => {
        child.emit('close', 1, 'SIGKILL');
      });
      const runner = createNeteaseWorkerRunner({
        forkImpl: () => child,
        terminateProcessTree,
        runtimeRoot: makeTemporaryRoot(),
        profileRoot: makeTemporaryRoot(),
        workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
        deadlineMs: 1000,
      });

      const pending = runner.probe(reference());
      await Promise.resolve();
      child.emit('spawn');
      for (const message of messages) child.emit('message', message);

      await expect(pending).resolves.toMatchObject({
        request: {
          status: 'failed',
          failureCode: 'worker-protocol-error',
        },
      });
      expect(terminateProcessTree).toHaveBeenCalledWith(child);
    }
  });

  it('returns bounded candidate metadata only through the smoke review method', async () => {
    const child = new FakeChild();
    const runner = createNeteaseWorkerRunner({
      forkImpl: () => child,
      terminateProcessTree: vi.fn(),
      runtimeRoot: makeTemporaryRoot(),
      profileRoot: makeTemporaryRoot(),
      workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
    });
    const pending = runner.probeWithReview(reference());
    await Promise.resolve();
    child.emit('spawn');
    child.emit('message', {
      schemaVersion: 1,
      type: 'result',
      observation: observation({ matchBand: 'strong' }),
      reviewCandidate: {
        title: 'Synthetic Example',
        artists: ['Example Artist'],
        album: 'Example Album',
        durationSeconds: 184,
        matchBand: 'strong',
        durationDeltaSeconds: 4,
        versionMismatch: false,
      },
    });
    child.emit('close', 0, null);

    await expect(pending).resolves.toMatchObject({
      observation: { matchBand: 'strong' },
      reviewCandidate: { title: 'Synthetic Example', matchBand: 'strong' },
    });
  });

  it('contains send, spawn, close, and termination failures', async () => {
    for (const scenario of ['send', 'error', 'close', 'termination']) {
      const child = new FakeChild();
      if (scenario === 'send')
        child.send.mockImplementation(() => {
          throw new Error('private send failure');
        });
      const terminateProcessTree = vi.fn(async () => {
        if (scenario === 'termination') throw new Error('private kill failure');
        child.emit('close', 1, 'SIGKILL');
      });
      const runner = createNeteaseWorkerRunner({
        forkImpl: () => child,
        terminateProcessTree,
        runtimeRoot: makeTemporaryRoot(),
        profileRoot: makeTemporaryRoot(),
        workerPath: path.join(makeTemporaryRoot(), 'worker.mjs'),
        deadlineMs: 1000,
      });
      const pending = runner.probe(reference());
      await Promise.resolve();
      child.emit('spawn');
      if (scenario === 'error' || scenario === 'termination') {
        child.emit('error', new Error('private child error'));
      }
      if (scenario === 'close') child.emit('close', 1, null);

      await expect(pending).resolves.toMatchObject({
        request: {
          status: 'failed',
          failureCode:
            scenario === 'termination'
              ? 'termination-failed'
              : scenario === 'error' || scenario === 'close'
                ? 'worker-crash'
                : 'worker-protocol-error',
        },
      });
    }
  });
});

describe('NetEase process-tree termination', () => {
  it('uses hidden taskkill with a numeric PID on Windows', async () => {
    const killer = new EventEmitter();
    const spawnImpl = vi.fn(() => killer);
    const pending = terminateNeteaseProcessTree(
      { pid: 4312 },
      { platform: 'win32', systemRoot: 'C:\\Windows', spawnImpl },
    );
    killer.emit('close', 0);
    await expect(pending).resolves.toBeUndefined();
    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\taskkill.exe',
      ['/PID', '4312', '/T', '/F'],
      {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
  });

  it('accepts taskkill already-gone status and rejects taskkill failure', async () => {
    for (const [code, expectation] of [
      [128, 'resolves'],
      [5, 'rejects'],
    ]) {
      const killer = new EventEmitter();
      const pending = terminateNeteaseProcessTree(
        { pid: 4312 },
        {
          platform: 'win32',
          systemRoot: 'C:\\Windows',
          spawnImpl: () => killer,
        },
      );
      killer.emit('close', code);
      if (expectation === 'resolves') {
        await expect(pending).resolves.toBeUndefined();
      } else {
        await expect(pending).rejects.toThrow(/could not be terminated/i);
      }
    }
    await expect(
      terminateNeteaseProcessTree(
        { pid: 4312 },
        { platform: 'win32', systemRoot: 'relative' },
      ),
    ).rejects.toThrow(/could not be terminated/i);
  });

  it('uses SIGKILL off Windows and rejects invalid or unkillable processes', async () => {
    const kill = vi.fn(() => true);
    await expect(
      terminateNeteaseProcessTree({ pid: 10, kill }, { platform: 'linux' }),
    ).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    await expect(
      terminateNeteaseProcessTree(
        { pid: 10, kill: () => false },
        { platform: 'linux' },
      ),
    ).rejects.toThrow(/could not be terminated/i);
    await expect(
      terminateNeteaseProcessTree({ pid: 0 }, { platform: 'win32' }),
    ).rejects.toThrow(/invalid NetEase worker process/i);
  });
});

describe('NetEase immutable runtime provisioning', () => {
  it('rejects invalid provisioner options and malformed activation JSON', () => {
    expect(() =>
      createNeteaseRuntimeProvisioner({ projectRoot: '.' }),
    ).toThrow();
    const projectRoot = makeTemporaryRoot();
    const paths = createNeteaseRuntimePaths(projectRoot);
    fs.mkdirSync(path.dirname(paths.currentActivationPath), {
      recursive: true,
    });
    fs.writeFileSync(paths.currentActivationPath, '{broken');
    expect(() => loadCurrentNeteaseRuntimeActivation(projectRoot)).toThrow(
      /activation/i,
    );
  });

  it('installs into staging, verifies the package, and atomically activates one generation', async () => {
    const projectRoot = makeTemporaryRoot();
    const installRuntime = vi.fn(async ({ stagingRoot }) => {
      const packageRoot = path.join(
        stagingRoot,
        'node_modules',
        '@neteasecloudmusicapienhanced',
        'api',
      );
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({
          name: '@neteasecloudmusicapienhanced/api',
          version: '4.40.1',
          license: 'MIT',
          main: 'main.js',
        }),
      );
      fs.writeFileSync(
        path.join(packageRoot, 'main.js'),
        'module.exports = {}',
      );
    });
    const provisioner = createNeteaseRuntimeProvisioner({
      projectRoot,
      templateRoot: path.resolve('scripts/lyrics-provider-netease-runtime'),
      installRuntime,
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });

    const activation = await provisioner.provision();
    const paths = createNeteaseRuntimePaths(projectRoot);

    expect(activation).toMatchObject({
      schemaVersion: 1,
      profileId: 'netease-yrc-evaluation-v1',
      packageVersion: '4.40.1',
      activatedAt: '2026-08-28T00:00:00.000Z',
    });
    expect(activation.generationId).toMatch(
      /^netease-yrc-evaluation-v1-4\.40\.1-[a-f0-9]{16}$/u,
    );
    expect(activation.runtimeRoot).toBe(
      path.join(paths.generationsDir, activation.generationId),
    );
    expect(installRuntime).toHaveBeenCalledOnce();
    expect(loadCurrentNeteaseRuntimeActivation(projectRoot)).toEqual(
      activation,
    );
    expect(fs.readdirSync(paths.stagingDir)).toEqual([]);

    await expect(provisioner.provision()).resolves.toEqual(activation);
    expect(installRuntime).toHaveBeenCalledOnce();
  });

  it('leaves no activation or staged payload after an install failure', async () => {
    const projectRoot = makeTemporaryRoot();
    const provisioner = createNeteaseRuntimeProvisioner({
      projectRoot,
      templateRoot: path.resolve('scripts/lyrics-provider-netease-runtime'),
      installRuntime: vi
        .fn()
        .mockRejectedValue(new Error('private npm output')),
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });

    await expect(provisioner.provision()).rejects.toThrow(
      'NetEase runtime provisioning failed',
    );
    const paths = createNeteaseRuntimePaths(projectRoot);
    expect(fs.existsSync(paths.currentActivationPath)).toBe(false);
    expect(fs.readdirSync(paths.stagingDir)).toEqual([]);
  });

  it('drives the default npm installer with ignored output and a fixed registry', async () => {
    const projectRoot = makeTemporaryRoot();
    const installer = new EventEmitter();
    const spawnImpl = vi.fn(() => installer);
    const provisioner = createNeteaseRuntimeProvisioner({
      projectRoot,
      templateRoot: path.resolve('scripts/lyrics-provider-netease-runtime'),
      npmCliPath: path.join(projectRoot, 'npm-cli.js'),
      nodePath: process.execPath,
      spawnImpl,
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });

    const pending = provisioner.provision();
    await Promise.resolve();
    expect(spawnImpl).toHaveBeenCalledOnce();
    const stagingRoot = spawnImpl.mock.calls[0][1].at(-1);
    const packageRoot = path.join(
      stagingRoot,
      'node_modules',
      '@neteasecloudmusicapienhanced',
      'api',
    );
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@neteasecloudmusicapienhanced/api',
        version: '4.40.1',
        license: 'MIT',
        main: 'main.js',
      }),
    );
    fs.writeFileSync(path.join(packageRoot, 'main.js'), 'module.exports = {}');
    installer.emit('close', 0);

    await expect(pending).resolves.toMatchObject({ packageVersion: '4.40.1' });
    expect(spawnImpl.mock.calls[0][2]).toMatchObject({
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: {
        npm_config_registry: 'https://registry.npmjs.org/',
      },
    });
  });
});

describe('real isolated NetEase worker boundary', () => {
  it('contains noisy package output and returns only the normalized observation', async () => {
    const runtimeRoot = makeTemporaryRoot();
    const packageRoot = path.join(
      runtimeRoot,
      'node_modules',
      '@neteasecloudmusicapienhanced',
      'api',
    );
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeRoot, 'package.json'),
      JSON.stringify({ name: 'fixture-runtime', private: true }),
    );
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@neteasecloudmusicapienhanced/api',
        version: '4.40.1',
        main: 'main.js',
      }),
    );
    fs.writeFileSync(
      path.join(packageRoot, 'main.js'),
      [
        "console.log('PRIVATE PROVIDER BODY')",
        "console.error('PRIVATE PROVIDER ERROR')",
        'module.exports = {',
        '  cloudsearch: async () => ({ body: { code: 200, result: { songs: [{',
        "    id: 1001, name: 'Synthetic Example', ar: [{ name: 'Example Artist' }],",
        "    al: { name: 'Example Album' }, dt: 180000, alia: [], tns: []",
        '  }] } } }),',
        '  lyric_new: async () => ({ body: { code: 200,',
        "    yrc: { lyric: '[1000,1000](1000,500,0)Syn(1500,500,0)thetic' },",
        "    lrc: { lyric: '[00:01.000]Synthetic' }",
        '  } })',
        '}',
      ].join('\n'),
    );
    const runner = createNeteaseWorkerRunner({
      runtimeRoot,
      profileRoot: path.join(runtimeRoot, 'profile'),
      workerPath: path.resolve('scripts/lyrics-provider-netease-worker.mjs'),
      deadlineMs: 5000,
    });

    await expect(runner.probe(reference())).resolves.toEqual({
      providerId: 'netease',
      request: {
        status: 'ok',
        durationMs: expect.any(Number),
        failureCode: null,
      },
      catalogStatus: 'match',
      matchBand: 'exact',
      reviewVerdict: 'unreviewed',
      capability: 'T2',
      timingValidation: 'valid',
    });
  });
});
