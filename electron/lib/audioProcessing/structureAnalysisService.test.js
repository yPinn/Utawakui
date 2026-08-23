import { describe, expect, it, vi } from 'vitest';
import { createHeavyJobScheduler } from './heavyJobScheduler.js';
import { createStructureAnalysisService } from './structureAnalysisService.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function activation(capability = {}) {
  return {
    generationId: 'generation-1',
    capabilities: {
      'structure-analysis': {
        runtime: { familyId: 'cpython-3.13.x', artifactHash: HASH_A },
        environment: { id: 'analysis-structure', lockHash: HASH_B },
        model: {
          kind: 'analysis',
          id: 'all-in-one-harmonix-fold0',
          version: 'harmonix-fold0-v1',
          manifestHash: HASH_C,
        },
        worker: { protocolVersion: 1 },
        ...capability,
      },
    },
  };
}

function createHarness(overrides = {}) {
  const release = vi.fn();
  const host = {
    acquireCurrentGeneration: vi.fn(() => ({
      generation: activation(),
      release,
    })),
  };
  const prepareSource = vi.fn(async () => ({
    inputPath: 'C:\\library\\tracks\\track-1\\audio.webm',
    ffmpegPath: 'C:\\deps\\ffmpeg.exe',
    sourceSha256: HASH_A,
    libraryDir: 'C:\\library',
  }));
  const publishDocument = vi.fn(async ({ trackId }) => ({ trackId }));
  const createJob = vi.fn((input) => ({
    result: Promise.resolve({ document: 'worker-result' }).then(() =>
      input.publishDocument(
        {},
        {
          sourceSha256: HASH_A,
          sourceDurationMs: 180000,
        },
      ),
    ),
    cancel: vi.fn(),
  }));
  const service = createStructureAnalysisService({
    host,
    scheduler: createHeavyJobScheduler(),
    createJobId: () => 'analysis-job-1',
    prepareSource,
    publishDocument,
    createJob,
    ...overrides,
  });
  return {
    service,
    host,
    release,
    prepareSource,
    publishDocument,
    createJob,
  };
}

describe('createStructureAnalysisService', () => {
  it('pins the current structure capability only when scheduled and publishes for the same track', async () => {
    const harness = createHarness();
    const onProgress = vi.fn();

    await expect(
      harness.service.run({ trackId: 'track-1', onProgress }),
    ).resolves.toEqual({ trackId: 'track-1' });

    expect(harness.prepareSource).toHaveBeenCalledWith({ trackId: 'track-1' });
    expect(harness.host.acquireCurrentGeneration).toHaveBeenCalledOnce();
    expect(harness.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'generation-1',
        jobId: 'analysis-job-1',
        trackId: 'track-1',
        runtimeRef: expect.objectContaining({ familyId: 'cpython-3.13.x' }),
        environmentRef: expect.objectContaining({ id: 'analysis-structure' }),
        modelRef: expect.objectContaining({
          id: 'all-in-one-harmonix-fold0',
        }),
      }),
    );
    expect(harness.publishDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: 'track-1',
        libraryDir: 'C:\\library',
      }),
    );
  });

  it('rejects a missing capability and releases its generation lease', async () => {
    const release = vi.fn();
    const harness = createHarness({
      host: {
        acquireCurrentGeneration: () => ({
          generation: { generationId: 'generation-1', capabilities: {} },
          release,
        }),
      },
    });

    await expect(harness.service.run({ trackId: 'track-1' })).rejects.toThrow(
      /not activated/i,
    );
    expect(release).toHaveBeenCalledOnce();
    expect(harness.createJob).not.toHaveBeenCalled();
  });

  it('normalizes a missing activation pointer without exposing filesystem details', async () => {
    const harness = createHarness({
      host: {
        acquireCurrentGeneration: () => {
          throw Object.assign(
            new Error('ENOENT: C:\\Users\\name\\AppData\\Roaming\\secret'),
            { code: 'ENOENT' },
          );
        },
      },
    });

    await expect(harness.service.run({ trackId: 'track-1' })).rejects.toThrow(
      'structure-analysis capability is not activated',
    );
    expect(harness.createJob).not.toHaveBeenCalled();
  });

  it('exposes one active analysis and cancels it through the shared scheduler', async () => {
    let rejectJob;
    const cancel = vi.fn(() => rejectJob(new Error('cancelled')));
    const harness = createHarness({
      createJob: vi.fn(() => ({
        result: new Promise((_resolve, reject) => {
          rejectJob = reject;
        }),
        cancel,
      })),
    });

    const result = harness.service.run({ trackId: 'track-1' });
    await vi.waitFor(() =>
      expect(harness.service.getActiveJob()).toMatchObject({
        jobId: 'analysis-job-1',
        trackId: 'track-1',
      }),
    );
    await expect(harness.service.run({ trackId: 'track-2' })).rejects.toThrow(
      /already running/i,
    );
    await expect(harness.service.cancelActiveJob()).resolves.toBe(true);
    await expect(result).rejects.toThrow(/cancelled/i);
    expect(cancel).toHaveBeenCalledOnce();
    expect(harness.service.getActiveJob()).toBeNull();
  });

  it('latches cancellation while source preparation is still running', async () => {
    let resolvePreparation;
    const prepareSource = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePreparation = resolve;
        }),
    );
    const harness = createHarness({ prepareSource });

    const result = harness.service.run({ trackId: 'track-1' });
    await vi.waitFor(() => expect(prepareSource).toHaveBeenCalledOnce());
    await expect(harness.service.cancelActiveJob()).resolves.toBe(true);
    resolvePreparation({
      inputPath: 'C:\\library\\tracks\\track-1\\audio.webm',
      ffmpegPath: 'C:\\deps\\ffmpeg.exe',
      sourceSha256: HASH_A,
      libraryDir: 'C:\\library',
    });

    await expect(result).rejects.toThrow(/cancelled/i);
    expect(harness.host.acquireCurrentGeneration).not.toHaveBeenCalled();
    expect(harness.createJob).not.toHaveBeenCalled();
    expect(harness.service.getActiveJob()).toBeNull();
  });
});
