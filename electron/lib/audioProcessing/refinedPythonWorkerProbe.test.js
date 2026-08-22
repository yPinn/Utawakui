import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAudioPythonManifestHash } from './audioPythonManifest.js';
import { createAudioPythonRuntimeHost } from './audioPythonRuntimeHost.js';
import {
  REFINED_MODEL_ID,
  createRefinedPythonWorkerProbeJob,
} from './refinedPythonWorkerProbe.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-refined-probe-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function license({ blocked = false } = {}) {
  return {
    spdx: blocked ? null : 'MIT',
    evidenceUrl: blocked ? null : 'https://example.test/license',
    productUse: blocked ? 'blocked' : 'accepted',
    reason: blocked ? 'The checkpoint license is unresolved.' : null,
  };
}

function artifact(role, filename, bytes, { blocked = false } = {}) {
  return {
    role,
    filename,
    url: `https://downloads.example.test/${filename}`,
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    license: license({ blocked }),
  };
}

function prepareProbe() {
  const userDataDir = makeTempDir();
  const appPath = makeTempDir();
  const host = createAudioPythonRuntimeHost({
    userDataDir,
    appPath,
    isPackaged: false,
  });
  const runtimeRef = {
    familyId: 'cpython-3.13.x',
    artifactHash: HASH_A,
  };
  const environmentRef = {
    id: 'separation-cpu',
    lockHash: HASH_B,
  };
  const modelVersion = 'upstream-317';
  const runtimePaths = host.getRuntimeArtifactPaths(
    runtimeRef.familyId,
    runtimeRef.artifactHash,
  );
  const environmentPaths = host.getEnvironmentPaths(
    environmentRef.id,
    environmentRef.lockHash,
  );
  const modelPaths = host.getModelPaths(
    'separation',
    REFINED_MODEL_ID,
    modelVersion,
  );
  const workerPath = path.join(
    appPath,
    'resources',
    'audio-processing',
    'refined_worker.py',
  );
  fs.mkdirSync(path.dirname(runtimePaths.pythonPath), { recursive: true });
  fs.mkdirSync(environmentPaths.sitePackagesPath, { recursive: true });
  fs.mkdirSync(modelPaths.installDir, { recursive: true });
  fs.mkdirSync(path.dirname(workerPath), { recursive: true });
  fs.writeFileSync(runtimePaths.pythonPath, 'python');
  fs.writeFileSync(workerPath, '# refined worker');

  const catalogBytes = Buffer.from('{"scenario":"success"}\n');
  const configBytes = Buffer.from('model: fake\n');
  const checkpointBytes = Buffer.from('fake checkpoint');
  const catalogPath = path.join(modelPaths.installDir, 'download_checks.json');
  const configPath = path.join(
    modelPaths.installDir,
    'model_bs_roformer_ep_317_sdr_12.9755.yaml',
  );
  const checkpointPath = path.join(
    modelPaths.installDir,
    'model_bs_roformer_ep_317_sdr_12.9755.ckpt',
  );
  fs.writeFileSync(catalogPath, catalogBytes);
  fs.writeFileSync(configPath, configBytes);
  fs.writeFileSync(checkpointPath, checkpointBytes);

  const modelManifest = {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'separation',
    id: REFINED_MODEL_ID,
    version: modelVersion,
    architecture: 'bs-roformer',
    wrapper: {
      package: 'audio-separator',
      version: '0.44.5',
      modelFilename: path.basename(checkpointPath),
    },
    stems: ['instrumental', 'vocals'],
    files: [
      artifact('weights', path.basename(checkpointPath), checkpointBytes, {
        blocked: true,
      }),
      artifact('config', path.basename(configPath), configBytes),
    ],
    distribution: {
      status: 'benchmark-only',
      reason: 'The checkpoint license is unresolved.',
    },
  };
  fs.writeFileSync(
    modelPaths.manifestPath,
    `${JSON.stringify(modelManifest, null, 2)}\n`,
  );

  return {
    host,
    runtimeRef,
    environmentRef,
    modelRef: {
      version: modelVersion,
      manifestHash: computeAudioPythonManifestHash(modelManifest),
    },
    catalogSha256: sha256(catalogBytes),
    paths: {
      runtimePaths,
      environmentPaths,
      modelPaths,
      workerPath,
      catalogPath,
      configPath,
      checkpointPath,
    },
  };
}

function successfulResult() {
  return {
    protocolVersion: 1,
    probePassed: true,
    recipeId: 'refined',
    modelId: REFINED_MODEL_ID,
    implementation: 'new-roformer',
    offlineEnforced: true,
    noUserCache: true,
  };
}

describe('createRefinedPythonWorkerProbeJob', () => {
  it('derives one fixed Refined/Viperx request from host-owned paths', async () => {
    const prepared = prepareProbe();
    const createProcessJob = vi.fn(() => ({
      result: Promise.resolve(successfulResult()),
      cancel: vi.fn(),
    }));

    const job = createRefinedPythonWorkerProbeJob({
      ...prepared,
      jobId: 'probe-job-1',
      createProcessJob,
    });

    await expect(job.result).resolves.toEqual(successfulResult());
    expect(createProcessJob).toHaveBeenCalledOnce();
    const input = createProcessJob.mock.calls[0][0];
    expect(input.executablePath).toBe(prepared.paths.runtimePaths.pythonPath);
    expect(input.workerPath).toBe(prepared.paths.workerPath);
    expect(input.request).toEqual({
      operation: 'probe-refined',
      recipeId: 'refined',
      modelId: REFINED_MODEL_ID,
      environmentPath: prepared.paths.environmentPaths.sitePackagesPath,
      jobPath: expect.stringContaining(
        path.join('jobs', 'refined', 'probe-job-1'),
      ),
      modelPath: prepared.paths.modelPaths.installDir,
      files: {
        catalog: {
          path: prepared.paths.catalogPath,
          sha256: prepared.catalogSha256,
        },
        config: {
          path: prepared.paths.configPath,
          sha256: sha256(fs.readFileSync(prepared.paths.configPath)),
        },
        checkpoint: {
          path: prepared.paths.checkpointPath,
          sha256: sha256(fs.readFileSync(prepared.paths.checkpointPath)),
        },
      },
    });
    expect(JSON.stringify(input.request)).not.toMatch(
      /inputAudio|outputAudio|renderer|argument|command/i,
    );
  });

  it('fails before spawning on missing, wrong-sized, or mismatched model evidence', () => {
    const missing = prepareProbe();
    fs.rmSync(missing.paths.catalogPath);
    const missingSpawn = vi.fn();
    expect(() =>
      createRefinedPythonWorkerProbeJob({
        ...missing,
        jobId: 'missing-job',
        createProcessJob: missingSpawn,
      }),
    ).toThrow(/artifact is missing/i);
    expect(missingSpawn).not.toHaveBeenCalled();

    const wrongSize = prepareProbe();
    fs.writeFileSync(wrongSize.paths.checkpointPath, 'wrong size');
    const wrongSizeSpawn = vi.fn();
    expect(() =>
      createRefinedPythonWorkerProbeJob({
        ...wrongSize,
        jobId: 'wrong-size-job',
        createProcessJob: wrongSizeSpawn,
      }),
    ).toThrow(/artifact size mismatch/i);
    expect(wrongSizeSpawn).not.toHaveBeenCalled();

    const mismatched = prepareProbe();
    mismatched.modelRef.manifestHash = 'c'.repeat(64);
    expect(() =>
      createRefinedPythonWorkerProbeJob({
        ...mismatched,
        jobId: 'manifest-job',
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/manifest hash mismatch/i);
  });

  it('rejects any model, wrapper, environment, or result outside the fixed contract', async () => {
    const wrongModel = prepareProbe();
    const manifest = JSON.parse(
      fs.readFileSync(wrongModel.paths.modelPaths.manifestPath, 'utf8'),
    );
    manifest.id = 'different-model';
    fs.writeFileSync(
      wrongModel.paths.modelPaths.manifestPath,
      JSON.stringify(manifest),
    );
    wrongModel.modelRef.manifestHash = computeAudioPythonManifestHash(manifest);
    expect(() =>
      createRefinedPythonWorkerProbeJob({
        ...wrongModel,
        jobId: 'wrong-model-job',
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/fixed Refined model/i);

    const wrongEnvironment = prepareProbe();
    wrongEnvironment.environmentRef.id = 'analysis-structure';
    expect(() =>
      createRefinedPythonWorkerProbeJob({
        ...wrongEnvironment,
        jobId: 'wrong-environment-job',
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/Refined environment/i);

    const extraResult = prepareProbe();
    const job = createRefinedPythonWorkerProbeJob({
      ...extraResult,
      jobId: 'extra-result-job',
      createProcessJob: () => ({
        result: Promise.resolve({
          ...successfulResult(),
          localModelPath: 'C:\\private\\model.ckpt',
        }),
        cancel: vi.fn(),
      }),
    });
    await expect(job.result).rejects.toThrow(/probe protocol/i);
  });

  it('binds workspace and lease cleanup to the one-shot process lifecycle', () => {
    const prepared = prepareProbe();
    const releaseGenerationLease = vi.fn();
    const createProcessJob = vi.fn(() => ({
      result: new Promise(() => undefined),
      cancel: vi.fn(),
    }));

    createRefinedPythonWorkerProbeJob({
      ...prepared,
      jobId: 'cleanup-job',
      releaseGenerationLease,
      createProcessJob,
    });
    const { cleanup, request } = createProcessJob.mock.calls[0][0];
    expect(fs.existsSync(request.jobPath)).toBe(true);

    cleanup();
    cleanup();

    expect(fs.existsSync(request.jobPath)).toBe(false);
    expect(releaseGenerationLease).toHaveBeenCalledOnce();
  });
});
