import fs from 'fs';
import os from 'os';
import path from 'path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUDIO_PYTHON_ENVIRONMENT_IDS,
  AUDIO_PYTHON_PROTOCOL_VERSION,
  AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH,
  AUDIO_PYTHON_STRUCTURE_WORKER_RELATIVE_PATH,
  AUDIO_PYTHON_WORKER_RELATIVE_PATH,
  createAudioPythonRuntimeHost,
} from './audioPythonRuntimeHost.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-audio-python-'));
  tempDirs.push(dir);
  return dir;
}

function makeGeneration(generationId, overrides = {}) {
  return {
    schemaVersion: 1,
    generationId,
    createdAt: '2026-08-23T00:00:00.000Z',
    capabilities: {
      refined: {
        runtime: { familyId: 'cpython-3.13.x', artifactHash: HASH_A },
        environment: { id: 'separation-cpu', lockHash: HASH_B },
        worker: { protocolVersion: 1 },
        model: {
          kind: 'separation',
          id: 'bs-roformer-baseline',
          version: '1.0.0',
          manifestHash: HASH_A,
        },
      },
    },
    ...overrides,
  };
}

describe('AudioPythonRuntimeHost', () => {
  it('derives the ADR 0014 family layout without a mutable community environment', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });
    const root = path.join(
      host.paths.userDataDir,
      'dependencies',
      'audio-python',
    );

    expect(host.paths).toEqual({
      userDataDir: host.paths.userDataDir,
      root,
      runtimesDir: path.join(root, 'runtimes'),
      environmentsDir: path.join(root, 'environments'),
      activationsDir: path.join(root, 'activations'),
      generationsDir: path.join(root, 'activations', 'generations'),
      currentActivationPath: path.join(root, 'activations', 'current.json'),
      modelsDir: path.join(root, 'models'),
      jobsDir: path.join(root, 'jobs'),
    });
    expect(AUDIO_PYTHON_ENVIRONMENT_IDS).toEqual([
      'separation-cpu',
      'analysis-structure',
      'combined-ml',
    ]);

    expect(host.getRuntimeArtifactPaths('cpython-3.13.x', HASH_A)).toEqual(
      expect.objectContaining({
        installDir: path.join(root, 'runtimes', 'cpython-3.13.x', HASH_A),
        pythonPath: path.join(
          root,
          'runtimes',
          'cpython-3.13.x',
          HASH_A,
          'python.exe',
        ),
      }),
    );
    expect(host.getEnvironmentPaths('separation-cpu', HASH_B).installDir).toBe(
      path.join(root, 'environments', 'separation-cpu', HASH_B),
    );
    expect(
      host.getModelPaths('separation', 'bs-roformer', '1.0.0').installDir,
    ).toBe(path.join(root, 'models', 'separation', 'bs-roformer', '1.0.0'));
  });

  it('rejects path injection and unknown locks, capabilities, or model families', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });

    for (const value of ['', '.', '..', '../escape', 'a/b', 'a\\b']) {
      expect(() => host.getRuntimeArtifactPaths(value, HASH_A)).toThrow();
      expect(() => host.getModelPaths('separation', value, '1.0.0')).toThrow();
    }
    expect(() =>
      host.getRuntimeArtifactPaths('cpython-3.13.x', 'not-a-hash'),
    ).toThrow(/hash/i);
    expect(() => host.getEnvironmentPaths('custom-env', HASH_A)).toThrow(
      /environment/i,
    );
    expect(() => host.getModelPaths('lyrics', 'model', '1.0.0')).toThrow(
      /model kind/i,
    );
  });

  it('publishes one immutable generation then atomically changes only current.json', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });
    const first = makeGeneration('generation-1');
    const second = makeGeneration('generation-2');

    host.publishActivation(first);
    const firstPath = path.join(host.paths.generationsDir, 'generation-1.json');
    const firstBytes = fs.readFileSync(firstPath, 'utf8');
    expect(host.getCurrentActivation()).toEqual(first);

    const lease = host.acquireCurrentGeneration();
    host.publishActivation(second);

    expect(lease.generation).toEqual(first);
    expect(host.getCurrentActivation()).toEqual(second);
    expect(fs.readFileSync(firstPath, 'utf8')).toBe(firstBytes);
    expect(host.canCollectGeneration('generation-1')).toBe(false);
    lease.release();
    expect(host.canCollectGeneration('generation-1')).toBe(true);
    expect(fs.existsSync(`${host.paths.currentActivationPath}.tmp`)).toBe(
      false,
    );
    expect(fs.existsSync(`${firstPath}.tmp`)).toBe(false);
  });

  it('rejects incompatible capability mappings and mutation of a published generation', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });
    host.publishActivation(makeGeneration('generation-1'));

    expect(() =>
      host.publishActivation(
        makeGeneration('generation-1', {
          createdAt: '2026-08-23T00:01:00.000Z',
        }),
      ),
    ).toThrow(/immutable/i);

    const invalidEnvironment = makeGeneration('bad-generation');
    invalidEnvironment.capabilities.refined.environment.id =
      'analysis-structure';
    expect(() => host.publishActivation(invalidEnvironment)).toThrow(
      /capability mapping/i,
    );

    const rendererPath = makeGeneration('path-generation');
    rendererPath.capabilities.refined.executablePath = 'C:\\bad\\python.exe';
    expect(() => host.publishActivation(rendererPath)).toThrow(/generation/i);
  });

  it('supports an independently verified remap and a generation with no enabled capability', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });
    const combined = makeGeneration('combined-generation');
    combined.capabilities.refined.environment.id = 'combined-ml';
    combined.capabilities['structure-analysis'] = {
      runtime: { familyId: 'cpython-3.13.x', artifactHash: HASH_A },
      environment: { id: 'combined-ml', lockHash: HASH_B },
      worker: { protocolVersion: 1 },
      model: {
        kind: 'analysis',
        id: 'structure-model',
        version: '1.0.0',
        manifestHash: HASH_B,
      },
    };
    host.publishActivation(combined);

    const splitCombined = JSON.parse(JSON.stringify(combined));
    splitCombined.generationId = 'split-combined-generation';
    splitCombined.capabilities['structure-analysis'].environment.lockHash =
      HASH_A;
    expect(() => host.publishActivation(splitCombined)).toThrow(
      /combined.*mapping/i,
    );

    const refinedOnly = makeGeneration('refined-only-generation');
    host.publishActivation(refinedOnly);
    expect(host.getCurrentActivation().capabilities).toEqual(
      refinedOnly.capabilities,
    );

    const disabled = makeGeneration('disabled-generation', {
      capabilities: {},
    });
    host.publishActivation(disabled);
    expect(host.getCurrentActivation().capabilities).toEqual({});
  });

  it('creates one capability workspace that records its pinned generation and lock', () => {
    const host = createAudioPythonRuntimeHost({ userDataDir: makeTempDir() });
    const workspace = host.createJobWorkspace({
      capabilityId: 'refined',
      jobId: 'job-123',
      generationId: 'generation-1',
      environmentHash: HASH_A,
    });

    expect(workspace.jobDir).toBe(
      path.join(host.paths.jobsDir, 'refined', 'job-123'),
    );
    expect(JSON.parse(fs.readFileSync(workspace.manifestPath, 'utf8'))).toEqual(
      {
        schemaVersion: 1,
        capabilityId: 'refined',
        jobId: 'job-123',
        generationId: 'generation-1',
        environmentHash: HASH_A,
      },
    );
    workspace.cleanup();
    expect(fs.existsSync(workspace.jobDir)).toBe(false);
    expect(fs.existsSync(path.join(host.paths.jobsDir, 'refined'))).toBe(true);
  });

  it('resolves and packages separate host and capability workers', () => {
    const appPath = path.resolve('.');
    const host = createAudioPythonRuntimeHost({
      userDataDir: makeTempDir(),
      appPath,
      isPackaged: false,
    });
    expect(host.resolveWorkerPath()).toBe(
      path.join(appPath, 'resources', AUDIO_PYTHON_WORKER_RELATIVE_PATH),
    );
    expect(host.resolveCapabilityWorkerPath('refined')).toBe(
      path.join(
        appPath,
        'resources',
        AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH,
      ),
    );
    expect(host.resolveCapabilityWorkerPath('structure-analysis')).toBe(
      path.join(
        appPath,
        'resources',
        AUDIO_PYTHON_STRUCTURE_WORKER_RELATIVE_PATH,
      ),
    );
    const config = yaml.load(fs.readFileSync('electron-builder.yml', 'utf8'));
    expect(config.extraResources).toContainEqual({
      from: 'resources/audio-processing/audio_python_worker.py',
      to: AUDIO_PYTHON_WORKER_RELATIVE_PATH.replaceAll('\\', '/'),
    });
    expect(config.extraResources).toContainEqual({
      from: 'resources/audio-processing/refined_worker.py',
      to: AUDIO_PYTHON_REFINED_WORKER_RELATIVE_PATH.replaceAll('\\', '/'),
    });
    expect(config.extraResources).toContainEqual({
      from: 'resources/audio-processing/structure_analysis_worker.py',
      to: AUDIO_PYTHON_STRUCTURE_WORKER_RELATIVE_PATH.replaceAll('\\', '/'),
    });
    expect(config.extraResources).toContainEqual({
      from: 'resources/audio-processing/analysis-structure-model.json',
      to: 'audio-processing/analysis-structure-model.json',
    });
    for (const filename of [
      'analysis-beat-this-small0-model.json',
      'analysis-beat-this-final0-model.json',
      'analysis-beat-this-py314-lock.json',
      'audio-python-runtime-3.14.7.json',
    ]) {
      expect(config.extraResources).toContainEqual({
        from: `resources/audio-processing/${filename}`,
        to: `audio-processing/${filename}`,
      });
    }
    expect(JSON.stringify(config.extraResources)).not.toMatch(
      /fixture|python\.exe|site-packages|\.onnx|\.ckpt|\.pth/i,
    );
    expect(AUDIO_PYTHON_PROTOCOL_VERSION).toBe(1);
  });
});
