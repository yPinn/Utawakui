import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAudioPythonManifestHash } from './audioPythonManifest.js';
import { createAudioPythonRuntimeHost } from './audioPythonRuntimeHost.js';
import {
  STRUCTURE_ANALYZER_ID,
  STRUCTURE_MODEL_ID,
  STRUCTURE_PROFILE_ID,
  SUPPORTED_STRUCTURE_ANALYSIS_MODELS,
  createStructureAnalysisJob,
  normalizeWorkerResult,
} from './structureAnalysisJob.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SOURCE_SHA256 = 'c'.repeat(64);
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-analysis-job-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function license(blocked = false) {
  return {
    spdx: blocked ? 'CC-BY-NC-SA-4.0' : 'MIT',
    evidenceUrl: 'https://example.test/license',
    productUse: blocked ? 'blocked' : 'accepted',
    reason: blocked
      ? 'The checkpoint is restricted to non-commercial use.'
      : null,
  };
}

function prepareJob() {
  const userDataDir = makeTempDir();
  const appPath = makeTempDir();
  const host = createAudioPythonRuntimeHost({
    userDataDir,
    appPath,
    isPackaged: false,
  });
  const runtimeRef = {
    familyId: 'cpython-3.14.x',
    artifactHash: HASH_A,
  };
  const environmentLock = {
    schemaVersion: 1,
    manifestKind: 'environment-lock',
    environmentId: 'analysis-structure',
    runtime: {
      familyId: runtimeRef.familyId,
      pythonVersion: '3.14.7',
    },
    platform: 'win32',
    arch: 'x64',
    resolver: { name: 'pip', version: '26.2.1' },
    requirements: [{ name: 'beat-this', version: '1.1.0' }],
    packages: [
      {
        name: 'beat-this',
        version: '1.1.0',
        artifact: {
          filename: 'beat_this-1.1.0-py3-none-any.whl',
          url: 'https://downloads.example.test/beat-this.whl',
          sizeBytes: 100,
          sha256: HASH_B,
        },
        resolvedDependencies: [],
        license: license(),
      },
    ],
    probeImports: ['beat_this'],
  };
  const environmentRef = {
    id: 'analysis-structure',
    lockHash: computeAudioPythonManifestHash(environmentLock),
  };
  const modelVersion = '1.1.0-small0';
  const runtimePaths = host.getRuntimeArtifactPaths(
    runtimeRef.familyId,
    runtimeRef.artifactHash,
  );
  const environmentPaths = host.getEnvironmentPaths(
    environmentRef.id,
    environmentRef.lockHash,
  );
  const modelPaths = host.getModelPaths(
    'analysis',
    STRUCTURE_MODEL_ID,
    modelVersion,
  );
  const workerPath = path.join(
    appPath,
    'resources',
    'audio-processing',
    'structure_analysis_worker.py',
  );
  const inputPath = path.join(makeTempDir(), 'decoded-input.wav');
  const ffmpegPath = path.join(makeTempDir(), 'ffmpeg.exe');
  const weightsBytes = Buffer.from('beat-this small0 checkpoint');

  fs.mkdirSync(path.dirname(runtimePaths.pythonPath), { recursive: true });
  fs.mkdirSync(environmentPaths.sitePackagesPath, { recursive: true });
  fs.mkdirSync(modelPaths.installDir, { recursive: true });
  fs.mkdirSync(path.dirname(workerPath), { recursive: true });
  fs.writeFileSync(runtimePaths.pythonPath, 'python');
  fs.writeFileSync(
    runtimePaths.manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      manifestKind: 'runtime-artifact',
      familyId: runtimeRef.familyId,
      version: '3.14.7',
      platform: 'win32',
      arch: 'x64',
      entryPoint: 'python.exe',
      artifact: {
        filename: 'python-3.14.7-embed-amd64.zip',
        url: 'https://downloads.example.test/python.zip',
        sizeBytes: 100,
        sha256: runtimeRef.artifactHash,
      },
      license: license(),
    }),
  );
  fs.writeFileSync(
    environmentPaths.manifestPath,
    JSON.stringify(environmentLock),
  );
  fs.writeFileSync(workerPath, '# structure analysis worker');
  fs.writeFileSync(inputPath, 'decoded audio');
  fs.writeFileSync(ffmpegPath, 'ffmpeg');
  fs.writeFileSync(
    path.join(modelPaths.installDir, 'small0.ckpt'),
    weightsBytes,
  );

  const artifact = (role, filename, bytes, blocked = false) => ({
    role,
    filename,
    url: `https://downloads.example.test/${filename}`,
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    license: license(blocked),
  });
  const modelManifest = {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'analysis',
    id: STRUCTURE_MODEL_ID,
    version: modelVersion,
    architecture: 'beat-this',
    wrapper: {
      package: 'beat-this',
      version: '1.1.0',
      model: 'small0',
    },
    signals: ['tempo', 'beats', 'downbeats'],
    files: [artifact('weights', 'small0.ckpt', weightsBytes)],
    distribution: {
      status: 'product-downloadable',
      reason: null,
    },
  };
  fs.writeFileSync(modelPaths.manifestPath, JSON.stringify(modelManifest));

  return {
    host,
    runtimeRef,
    environmentRef,
    modelRef: {
      kind: 'analysis',
      id: STRUCTURE_MODEL_ID,
      version: modelVersion,
      manifestHash: computeAudioPythonManifestHash(modelManifest),
    },
    generationId: 'generation-1',
    jobId: 'analysis-job-1',
    trackId: 'track-1',
    inputPath,
    ffmpegPath,
    sourceSha256: SOURCE_SHA256,
    paths: { runtimePaths, environmentPaths, modelPaths, workerPath },
  };
}

function decodeFactory() {
  return vi.fn(({ outputPath }) => {
    fs.writeFileSync(outputPath, 'decoded wav');
    return { result: Promise.resolve(outputPath), cancel: vi.fn() };
  });
}

function workerResult() {
  return {
    protocolVersion: 1,
    analyzerId: STRUCTURE_ANALYZER_ID,
    profileId: STRUCTURE_PROFILE_ID,
    modelId: STRUCTURE_MODEL_ID,
    offlineEnforced: true,
    noUserCache: true,
    durationMs: 180000,
    tempo: { bpm: 120, confidence: 0.78 },
    beats: [
      { timeMs: 500, positionInBar: 1, downbeat: true, confidence: 0.9 },
      { timeMs: 1000, positionInBar: 2, downbeat: false, confidence: 0.82 },
    ],
    sections: [],
  };
}

function semanticWorkerResult(sectionOverrides = {}) {
  return {
    ...workerResult(),
    analyzerId: 'all-in-one-structure',
    profileId: 'all-in-one-cpu-v1',
    modelId: 'all-in-one-harmonix-fold0',
    sections: [
      {
        sectionId: 'section_01',
        startMs: 0,
        endMs: 12000,
        role: 'intro',
        rawLabel: 'intro',
        confidence: 0.82,
      },
      {
        sectionId: 'section_02',
        startMs: 12000,
        endMs: 180000,
        role: 'chorus',
        rawLabel: 'chorus',
        confidence: 0.76,
        ...sectionOverrides,
      },
    ],
  };
}

function semanticProvenance() {
  return {
    sourceSha256: SOURCE_SHA256,
    environmentLock: HASH_B,
    modelId: 'all-in-one-harmonix-fold0',
    completedAt: '2026-08-24T00:00:00.000Z',
  };
}

describe('createStructureAnalysisJob', () => {
  it('publishes only complete confident semantic sections from the M2 runtime path', () => {
    const profile =
      SUPPORTED_STRUCTURE_ANALYSIS_MODELS['all-in-one-harmonix-fold0'];
    const accepted = normalizeWorkerResult(
      semanticWorkerResult(),
      semanticProvenance(),
      profile,
    );

    expect(accepted.document.sections).toHaveLength(2);

    for (const sectionOverrides of [
      { confidence: 0.49 },
      { role: 'unknown', rawLabel: 'other' },
      { startMs: 13000 },
    ]) {
      const downgraded = normalizeWorkerResult(
        semanticWorkerResult(sectionOverrides),
        semanticProvenance(),
        profile,
      );
      expect(downgraded.document.tempo?.bpm).toBe(120);
      expect(downgraded.document.beats).toHaveLength(2);
      expect(downgraded.document.sections).toEqual([]);
    }
  });

  it('derives a fixed offline CPU request and publishes only a validated document', async () => {
    expect(STRUCTURE_PROFILE_ID).toBe('beat-this-small0-cpu-v3');
    const prepared = prepareJob();
    const publishDocument = vi.fn(async (document, identity) => ({
      trackId: prepared.trackId,
      document,
      identity,
    }));
    const releaseGenerationLease = vi.fn();
    const createProcessJob = vi.fn(() => ({
      result: Promise.resolve(workerResult()),
      cancel: vi.fn(),
    }));
    const createDecodeJob = decodeFactory();

    const job = createStructureAnalysisJob({
      ...prepared,
      completedAt: () => '2026-08-24T00:00:00.000Z',
      publishDocument,
      releaseGenerationLease,
      createDecodeJob,
      createProcessJob,
    });

    await expect(job.result).resolves.toMatchObject({ trackId: 'track-1' });
    expect(createProcessJob).toHaveBeenCalledOnce();
    expect(createDecodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        ffmpegPath: prepared.ffmpegPath,
        inputPath: prepared.inputPath,
        outputPath: expect.stringContaining(
          path.join(
            'jobs',
            'structure-analysis',
            'analysis-job-1',
            'input.wav',
          ),
        ),
      }),
    );
    const processInput = createProcessJob.mock.calls[0][0];
    expect(processInput.executablePath).toBe(
      prepared.paths.runtimePaths.pythonPath,
    );
    expect(processInput.workerPath).toBe(prepared.paths.workerPath);
    expect(processInput.maxMessageBytes).toBeGreaterThan(64 * 1024);
    expect(processInput.request).toMatchObject({
      operation: 'analyze-structure',
      analyzerId: STRUCTURE_ANALYZER_ID,
      profileId: STRUCTURE_PROFILE_ID,
      modelId: STRUCTURE_MODEL_ID,
      modelName: 'small0',
      environmentPath: prepared.paths.environmentPaths.sitePackagesPath,
      inputPath: expect.stringContaining(
        path.join('jobs', 'structure-analysis', 'analysis-job-1', 'input.wav'),
      ),
      jobPath: expect.stringContaining(
        path.join('jobs', 'structure-analysis', 'analysis-job-1'),
      ),
      modelFiles: [expect.objectContaining({ role: 'weights' })],
    });
    expect(processInput.request).not.toHaveProperty('trackId');
    expect(publishDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: { sha256: SOURCE_SHA256, durationMs: 180000 },
        analyzer: {
          contractVersion: 1,
          id: STRUCTURE_ANALYZER_ID,
          profileId: STRUCTURE_PROFILE_ID,
          environmentLock: prepared.environmentRef.lockHash,
          modelIds: [STRUCTURE_MODEL_ID],
          completedAt: '2026-08-24T00:00:00.000Z',
        },
        tempo: { bpm: 120, confidence: 0.78 },
      }),
      { sourceSha256: SOURCE_SHA256, sourceDurationMs: 180000 },
    );
    expect(releaseGenerationLease).toHaveBeenCalledOnce();
  });

  it('rejects invalid or confidence-free output before publication', async () => {
    for (const mutate of [
      (value) => (value.durationMs = Infinity),
      (value) => delete value.beats[0].confidence,
      (value) => (value.beats[0].downbeat = 'yes'),
      (value) => (value.localPath = 'C:\\private\\model'),
    ]) {
      const prepared = prepareJob();
      const value = workerResult();
      mutate(value);
      const publishDocument = vi.fn();
      const job = createStructureAnalysisJob({
        ...prepared,
        completedAt: () => '2026-08-24T00:00:00.000Z',
        publishDocument,
        createDecodeJob: decodeFactory(),
        createProcessJob: () => ({
          result: Promise.resolve(value),
          cancel: vi.fn(),
        }),
      });

      await expect(job.result).rejects.toThrow();
      expect(publishDocument).not.toHaveBeenCalled();
    }
  });

  it('fails before spawning for missing artifacts or incompatible activation references', () => {
    const missing = prepareJob();
    fs.rmSync(path.join(missing.paths.modelPaths.installDir, 'small0.ckpt'));
    const createMissingProcess = vi.fn();
    expect(() =>
      createStructureAnalysisJob({
        ...missing,
        publishDocument: vi.fn(),
        createDecodeJob: decodeFactory(),
        createProcessJob: createMissingProcess,
      }),
    ).toThrow(/artifact is missing/i);
    expect(createMissingProcess).not.toHaveBeenCalled();

    const wrongEnvironment = prepareJob();
    wrongEnvironment.environmentRef.id = 'separation-cpu';
    expect(() =>
      createStructureAnalysisJob({
        ...wrongEnvironment,
        publishDocument: vi.fn(),
        createDecodeJob: decodeFactory(),
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/environment/i);

    const tamperedEnvironment = prepareJob();
    fs.writeFileSync(
      tamperedEnvironment.paths.environmentPaths.manifestPath,
      '{}',
    );
    expect(() =>
      createStructureAnalysisJob({
        ...tamperedEnvironment,
        publishDocument: vi.fn(),
        createDecodeJob: decodeFactory(),
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/environment/i);

    const wrongModelVersion = prepareJob();
    const mismatchedModelPaths = wrongModelVersion.host.getModelPaths(
      'analysis',
      STRUCTURE_MODEL_ID,
      'other-version',
    );
    fs.cpSync(
      wrongModelVersion.paths.modelPaths.installDir,
      mismatchedModelPaths.installDir,
      { recursive: true },
    );
    wrongModelVersion.modelRef.version = 'other-version';
    expect(() =>
      createStructureAnalysisJob({
        ...wrongModelVersion,
        publishDocument: vi.fn(),
        createDecodeJob: decodeFactory(),
        createProcessJob: vi.fn(),
      }),
    ).toThrow(/model/i);
  });

  it('refuses a benchmark-only model even if an invalid activation points at it', () => {
    const prepared = prepareJob();
    const manifest = JSON.parse(
      fs.readFileSync(prepared.paths.modelPaths.manifestPath, 'utf8'),
    );
    manifest.files[0].license = license(true);
    manifest.distribution = {
      status: 'benchmark-only',
      reason: 'The Harmonix checkpoint is restricted to non-commercial use.',
    };
    fs.writeFileSync(
      prepared.paths.modelPaths.manifestPath,
      JSON.stringify(manifest),
    );
    prepared.modelRef.manifestHash = computeAudioPythonManifestHash(manifest);
    const createProcessJob = vi.fn();

    expect(() =>
      createStructureAnalysisJob({
        ...prepared,
        publishDocument: vi.fn(),
        createDecodeJob: decodeFactory(),
        createProcessJob,
      }),
    ).toThrow(/benchmark-only/i);
    expect(createProcessJob).not.toHaveBeenCalled();
  });

  it('keeps the generation lease through sidecar publication and cleans every terminal path', async () => {
    const prepared = prepareJob();
    const events = [];
    const publishDocument = vi.fn(async () => {
      events.push('published');
      throw new Error('save failed');
    });
    const releaseGenerationLease = vi.fn(() => events.push('released'));
    const job = createStructureAnalysisJob({
      ...prepared,
      completedAt: () => '2026-08-24T00:00:00.000Z',
      publishDocument,
      releaseGenerationLease,
      createDecodeJob: decodeFactory(),
      createProcessJob: () => {
        return { result: Promise.resolve(workerResult()), cancel: vi.fn() };
      },
    });

    await expect(job.result).rejects.toThrow(/save failed/i);
    expect(events).toEqual(['published', 'released']);
    expect(
      fs.existsSync(
        path.join(
          prepared.host.paths.jobsDir,
          'structure-analysis',
          prepared.jobId,
        ),
      ),
    ).toBe(false);
  });

  it('releases the generation lease even when workspace cleanup fails', async () => {
    const prepared = prepareJob();
    const originalCreateWorkspace = prepared.host.createJobWorkspace;
    const releaseGenerationLease = vi.fn();
    prepared.host.createJobWorkspace = vi.fn((input) => {
      const workspace = originalCreateWorkspace(input);
      return {
        ...workspace,
        cleanup: vi.fn(() => {
          throw new Error('workspace cleanup failed');
        }),
      };
    });
    const job = createStructureAnalysisJob({
      ...prepared,
      publishDocument: vi.fn(async () => ({ ok: true })),
      releaseGenerationLease,
      createDecodeJob: decodeFactory(),
      createProcessJob: () => ({
        result: Promise.resolve(workerResult()),
        cancel: vi.fn(),
      }),
    });

    await expect(job.result).rejects.toThrow(/cleanup failed/i);
    expect(releaseGenerationLease).toHaveBeenCalledOnce();
  });

  it('reports sidecar publication finalization as non-cancellable', async () => {
    const prepared = prepareJob();
    let resolvePublication;
    const publishStarted = vi.fn();
    const publishDocument = vi.fn(
      () =>
        new Promise((resolve) => {
          publishStarted();
          resolvePublication = resolve;
        }),
    );
    const job = createStructureAnalysisJob({
      ...prepared,
      publishDocument,
      createDecodeJob: decodeFactory(),
      createProcessJob: () => ({
        result: Promise.resolve(workerResult()),
        cancel: vi.fn(),
      }),
    });
    await vi.waitFor(() => expect(publishStarted).toHaveBeenCalledOnce());

    await expect(job.cancel()).resolves.toBe(false);
    resolvePublication({ trackId: prepared.trackId });
    await expect(job.result).resolves.toEqual({
      trackId: prepared.trackId,
    });
  });
});
