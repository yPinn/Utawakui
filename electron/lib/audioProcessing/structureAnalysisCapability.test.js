import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAudioPythonManifestHash } from './audioPythonManifest.js';
import { createAudioPythonRuntimeHost } from './audioPythonRuntimeHost.js';
import {
  STRUCTURE_ANALYSIS_CAPABILITY_ID,
  createStructureAnalysisCapabilityService,
  loadStructureAnalysisCapabilityCatalog,
} from './structureAnalysisCapability.js';

const runtimeManifest = JSON.parse(
  fs.readFileSync(
    'resources/audio-processing/audio-python-runtime-3.14.7.json',
    'utf8',
  ),
);
const environmentLock = JSON.parse(
  fs.readFileSync(
    'resources/audio-processing/analysis-beat-this-py314-lock.json',
    'utf8',
  ),
);
const modelManifest = JSON.parse(
  fs.readFileSync(
    'resources/audio-processing/analysis-beat-this-small0-model.json',
    'utf8',
  ),
);
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-analysis-cap-'));
  tempDirs.push(dir);
  return dir;
}

function makeGeneration(capabilities = {}) {
  return {
    schemaVersion: 1,
    generationId: crypto.randomUUID(),
    createdAt: '2026-08-24T00:00:00.000Z',
    capabilities,
  };
}

function createHarness(overrides = {}) {
  const userDataDir = makeTempDir();
  const appPath = makeTempDir();
  const host = createAudioPythonRuntimeHost({
    userDataDir,
    appPath,
    isPackaged: false,
  });
  const prepareArtifacts = vi.fn(async ({ refs, emitProgress }) => {
    const runtimePaths = host.getRuntimeArtifactPaths(
      refs.runtime.familyId,
      refs.runtime.artifactHash,
    );
    const environmentPaths = host.getEnvironmentPaths(
      refs.environment.id,
      refs.environment.lockHash,
    );
    const modelPaths = host.getModelPaths(
      refs.model.kind,
      refs.model.id,
      refs.model.version,
    );
    fs.mkdirSync(path.dirname(runtimePaths.pythonPath), { recursive: true });
    fs.mkdirSync(environmentPaths.sitePackagesPath, { recursive: true });
    fs.mkdirSync(modelPaths.installDir, { recursive: true });
    fs.writeFileSync(runtimePaths.pythonPath, 'python');
    fs.writeFileSync(
      runtimePaths.manifestPath,
      JSON.stringify(runtimeManifest),
    );
    fs.writeFileSync(
      environmentPaths.manifestPath,
      JSON.stringify(environmentLock),
    );
    fs.writeFileSync(modelPaths.manifestPath, JSON.stringify(modelManifest));
    fs.writeFileSync(
      path.join(modelPaths.installDir, modelManifest.files[0].filename),
      'weights',
    );
    emitProgress({ stage: 'verifying-environment', percent: 80 });
  });
  const service = createStructureAnalysisCapabilityService({
    host,
    runtimeManifest,
    environmentLock,
    modelManifest,
    prepareArtifacts,
    now: () => '2026-08-24T00:00:00.000Z',
    createGenerationId: () => 'analysis-generation-1',
    ...overrides,
  });
  return { host, prepareArtifacts, service };
}

function refinedCapability() {
  return {
    runtime: {
      familyId: runtimeManifest.familyId,
      artifactHash: 'a'.repeat(64),
    },
    environment: { id: 'separation-cpu', lockHash: 'b'.repeat(64) },
    worker: { protocolVersion: 1 },
    model: {
      kind: 'separation',
      id: 'refined-model',
      version: '1.0.0',
      manifestHash: 'c'.repeat(64),
    },
  };
}

describe('structure-analysis capability lifecycle', () => {
  it('loads the checked-in development catalog from the app resource root', () => {
    const catalog = loadStructureAnalysisCapabilityCatalog({
      isPackaged: false,
      appPath: process.cwd(),
    });

    expect(catalog.runtimeManifest.version).toBe('3.14.7');
    expect(catalog.environmentLock.packages).toHaveLength(16);
    expect(catalog.modelManifest.id).toBe('beat-this-small0');
  });

  it('reports a bounded missing state with the fixed small0 preparation cost', () => {
    const { service } = createHarness();

    expect(service.getStatus()).toEqual({
      status: 'missing',
      installed: false,
      busy: false,
      canPrepare: true,
      canRepair: false,
      canRemove: false,
      modelName: 'Beat This! small0',
      modelVersion: '1.1.0',
      downloadBytes: 159368729,
      installedBytesEstimate: 557000000,
    });
  });

  it('prepares exact artifacts and atomically preserves other capabilities', async () => {
    const { host, prepareArtifacts, service } = createHarness();
    host.publishActivation(makeGeneration({ refined: refinedCapability() }));
    const progress = [];

    await expect(
      service.prepare({ onProgress: (item) => progress.push(item) }),
    ).resolves.toMatchObject({ status: 'ready', installed: true });

    const activation = host.getCurrentActivation();
    expect(activation.capabilities.refined).toEqual(refinedCapability());
    expect(activation.capabilities[STRUCTURE_ANALYSIS_CAPABILITY_ID]).toEqual({
      runtime: {
        familyId: runtimeManifest.familyId,
        artifactHash: runtimeManifest.artifact.sha256,
      },
      environment: {
        id: environmentLock.environmentId,
        lockHash: computeAudioPythonManifestHash(environmentLock),
      },
      worker: { protocolVersion: 1 },
      model: {
        kind: 'analysis',
        id: modelManifest.id,
        version: modelManifest.version,
        manifestHash: computeAudioPythonManifestHash(modelManifest),
      },
    });
    expect(prepareArtifacts).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toEqual({ stage: 'ready', percent: 100 });
  });

  it('does not publish activation when preparation fails and unlocks retry', async () => {
    const prepareArtifacts = vi
      .fn()
      .mockRejectedValueOnce(new Error('download failed'))
      .mockResolvedValueOnce(undefined);
    const { host, service } = createHarness({ prepareArtifacts });

    await expect(service.prepare()).rejects.toThrow('download failed');
    expect(() => host.getCurrentActivation()).toThrow();
    expect(service.getStatus().busy).toBe(false);

    await expect(service.prepare()).resolves.toMatchObject({
      status: 'damaged',
    });
    expect(prepareArtifacts).toHaveBeenCalledTimes(2);
  });

  it('repairs or removes a damaged current activation without trusting it', async () => {
    const repairHarness = createHarness();
    fs.mkdirSync(path.dirname(repairHarness.host.paths.currentActivationPath), {
      recursive: true,
    });
    fs.writeFileSync(
      repairHarness.host.paths.currentActivationPath,
      '{ damaged',
    );

    expect(repairHarness.service.getStatus().status).toBe('damaged');
    await expect(repairHarness.service.repair()).resolves.toMatchObject({
      status: 'ready',
    });

    const removeHarness = createHarness();
    fs.mkdirSync(path.dirname(removeHarness.host.paths.currentActivationPath), {
      recursive: true,
    });
    fs.writeFileSync(
      removeHarness.host.paths.currentActivationPath,
      '{ damaged',
    );

    await expect(removeHarness.service.remove()).resolves.toMatchObject({
      status: 'missing',
      installed: false,
      busy: false,
      canPrepare: true,
    });
  });

  it('rejects concurrent lifecycle work and removal while analysis is active', async () => {
    let finish;
    const prepareArtifacts = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let activeJob = null;
    const { service } = createHarness({
      prepareArtifacts,
      getActiveJob: () => activeJob,
    });

    const preparation = service.prepare();
    await expect(service.prepare()).rejects.toThrow(/already running/i);
    activeJob = { jobId: 'job-1', trackId: 'track-1' };
    await expect(service.remove()).rejects.toThrow(/analysis job/i);
    finish();
    await preparation;
  });

  it('removes only structure analysis from the next activation generation', async () => {
    const { host, service } = createHarness();
    host.publishActivation(
      makeGeneration({
        refined: refinedCapability(),
        [STRUCTURE_ANALYSIS_CAPABILITY_ID]: service.capabilityReference,
      }),
    );

    await expect(service.remove()).resolves.toMatchObject({
      status: 'missing',
      installed: false,
    });

    expect(host.getCurrentActivation().capabilities).toEqual({
      refined: refinedCapability(),
    });
  });
});
