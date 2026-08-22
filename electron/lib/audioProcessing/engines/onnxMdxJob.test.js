import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { createOnnxMdxJob } from './onnxMdxJob.js';

class FakeWorker extends EventEmitter {
  static instances = [];

  constructor(workerPath, options) {
    super();
    this.workerPath = workerPath;
    this.options = options;
    this.terminate = vi.fn(async () => 1);
    FakeWorker.instances.push(this);
  }
}

function startJob(overrides = {}) {
  FakeWorker.instances = [];
  const emitProgress = vi.fn();
  const job = createOnnxMdxJob({
    WorkerCtor: FakeWorker,
    workerPath: 'worker.js',
    workerData: { recipeId: 'quick' },
    emitProgress,
    ...overrides,
  });
  return { job, worker: FakeWorker.instances[0], emitProgress };
}

describe('createOnnxMdxJob', () => {
  it('starts the worker with prepared data and relays progress', async () => {
    const { job, worker, emitProgress } = startJob();
    expect(worker.workerPath).toBe('worker.js');
    expect(worker.options).toEqual({
      workerData: { recipeId: 'quick' },
    });

    worker.emit('message', {
      type: 'progress',
      stage: 'separating',
      percent: 25,
    });
    worker.emit('message', { type: 'done', result: { stemsPath: 'x.wav' } });

    expect(emitProgress).toHaveBeenCalledWith({
      stage: 'separating',
      percent: 25,
    });
    await expect(job.result).resolves.toEqual({ stemsPath: 'x.wav' });
  });

  it('rejects explicit worker errors and abnormal exits', async () => {
    const explicit = startJob();
    explicit.worker.emit('message', {
      type: 'error',
      error: 'inference failed',
    });
    await expect(explicit.job.result).rejects.toThrow('inference failed');

    const abnormal = startJob();
    abnormal.worker.emit('exit', 9);
    await expect(abnormal.job.result).rejects.toThrow(
      'separation worker exited with code 9',
    );
  });

  it('rejects a clean worker exit that never published a done result', async () => {
    const { job, worker } = startJob();

    worker.emit('exit', 0);

    await expect(job.result).rejects.toThrow(/without a result/i);
  });

  it('settles as cancelled after terminating the worker', async () => {
    const { job, worker } = startJob();

    await expect(job.cancel()).resolves.toBeUndefined();
    await expect(job.result).rejects.toThrow(/cancelled/i);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
