import { describe, expect, it, vi } from 'vitest';
import { createAudioProcessingService } from './service.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeService(overrides = {}) {
  const prepareJob = overrides.prepareJob || vi.fn(async () => ({ token: 1 }));
  const createEngineJob =
    overrides.createEngineJob ||
    vi.fn(() => ({ result: Promise.resolve({ stemsPath: 'result.wav' }) }));
  const service = createAudioProcessingService({
    resolveRecipe:
      overrides.resolveRecipe ||
      vi.fn((recipeId) => ({
        id: recipeId,
        engineId: 'onnx-mdx',
        modelIds: ['kara2'],
      })),
    prepareJob,
    createEngineJob,
    createJobId: overrides.createJobId || (() => 'job-1'),
  });
  return { service, prepareJob, createEngineJob };
}

describe('AudioProcessingService', () => {
  it('resolves and prepares a recipe before starting its engine job', async () => {
    const { service, prepareJob, createEngineJob } = makeService();

    await expect(
      service.run({ trackId: 'track-1', recipeId: 'quick' }),
    ).resolves.toEqual({ stemsPath: 'result.wav' });

    expect(prepareJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      trackId: 'track-1',
      recipe: {
        id: 'quick',
        engineId: 'onnx-mdx',
        modelIds: ['kara2'],
      },
    });
    expect(createEngineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        trackId: 'track-1',
        recipeId: 'quick',
        engineId: 'onnx-mdx',
        prepared: { token: 1 },
      }),
    );
  });

  it('normalizes engine progress with stable product and job fields', async () => {
    const onProgress = vi.fn();
    const createEngineJob = vi.fn(({ emitProgress }) => {
      emitProgress({ stage: 'separating', percent: 42 });
      return { result: Promise.resolve({ ok: true }) };
    });
    const { service } = makeService({ createEngineJob });

    await service.run({
      trackId: 'track-1',
      recipeId: 'general',
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({
      jobId: 'job-1',
      trackId: 'track-1',
      recipeId: 'general',
      stage: 'separating',
      percent: 42,
    });
  });

  it('rejects a second job while one is active and releases the lock', async () => {
    const firstJob = deferred();
    const createEngineJob = vi
      .fn()
      .mockReturnValueOnce({ result: firstJob.promise })
      .mockReturnValueOnce({ result: Promise.resolve({ ok: true }) });
    const { service } = makeService({ createEngineJob });

    const firstRun = service.run({
      trackId: 'track-1',
      recipeId: 'quick',
    });
    await vi.waitFor(() => expect(service.getActiveJob()).not.toBeNull());

    await expect(
      service.run({ trackId: 'track-2', recipeId: 'general' }),
    ).rejects.toThrow(/already running/i);

    firstJob.resolve({ ok: true });
    await firstRun;
    expect(service.getActiveJob()).toBeNull();
    await expect(
      service.run({ trackId: 'track-2', recipeId: 'general' }),
    ).resolves.toEqual({ ok: true });
  });

  it('releases the active job after preparation or engine failure', async () => {
    const preparationFailure = makeService({
      prepareJob: vi.fn(async () => {
        throw new Error('prepare failed');
      }),
    });
    await expect(
      preparationFailure.service.run({
        trackId: 'track-1',
        recipeId: 'quick',
      }),
    ).rejects.toThrow('prepare failed');
    expect(preparationFailure.service.getActiveJob()).toBeNull();

    const engineFailure = makeService({
      createEngineJob: vi.fn(() => ({
        result: Promise.reject(new Error('engine failed')),
      })),
    });
    await expect(
      engineFailure.service.run({
        trackId: 'track-1',
        recipeId: 'quick',
      }),
    ).rejects.toThrow('engine failed');
    expect(engineFailure.service.getActiveJob()).toBeNull();
  });

  it('cancels the owned engine job and leaves no active lock', async () => {
    const engineResult = deferred();
    const cancel = vi.fn(async () => {
      engineResult.reject(new Error('cancelled'));
    });
    const { service } = makeService({
      createEngineJob: vi.fn(() => ({ result: engineResult.promise, cancel })),
    });
    const run = service.run({ trackId: 'track-1', recipeId: 'quick' });
    await vi.waitFor(() => expect(service.getActiveJob()).not.toBeNull());

    await expect(service.cancelActiveJob()).resolves.toBe(true);
    await expect(run).rejects.toThrow('cancelled');
    expect(cancel).toHaveBeenCalledOnce();
    expect(service.getActiveJob()).toBeNull();
    await expect(service.cancelActiveJob()).resolves.toBe(false);
  });
});
