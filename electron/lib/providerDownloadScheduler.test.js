import { describe, expect, it, vi } from 'vitest';
import providerDownloadSchedulerModule from './providerDownloadScheduler.js';

const { createProviderDownloadScheduler } = providerDownloadSchedulerModule;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('provider download scheduler', () => {
  it('runs at most two provider jobs while preserving admission order', async () => {
    const scheduler = createProviderDownloadScheduler();
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const started = [];

    const jobs = [first, second, third].map((gate, index) =>
      scheduler.schedule(`track-${index + 1}`, () => {
        started.push(`track-${index + 1}`);
        return gate.promise;
      }),
    );

    await Promise.resolve();
    expect(started).toEqual(['track-1', 'track-2']);
    expect(scheduler.snapshot()).toEqual({ active: 2, pending: 1 });

    first.resolve('one');
    await first.promise;
    await Promise.resolve();
    expect(started).toEqual(['track-1', 'track-2', 'track-3']);

    second.resolve('two');
    third.resolve('three');
    await expect(Promise.all(jobs)).resolves.toEqual(['one', 'two', 'three']);
    expect(scheduler.snapshot()).toEqual({ active: 0, pending: 0 });
  });

  it('deduplicates the same track across queued and active requests', async () => {
    const scheduler = createProviderDownloadScheduler();
    const gate = deferred();
    const start = vi.fn(() => gate.promise);

    const first = scheduler.schedule('same-track', start);
    const duplicate = scheduler.schedule('same-track', start);

    expect(duplicate).toBe(first);
    expect(start).toHaveBeenCalledOnce();

    gate.resolve('done');
    await expect(first).resolves.toBe('done');
  });

  it('cancels an active job through its AbortSignal', async () => {
    const scheduler = createProviderDownloadScheduler();
    const started = deferred();
    const job = scheduler.schedule('active-track', ({ signal }) => {
      started.resolve(signal);
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(providerDownloadSchedulerModule.cancellationError()),
          { once: true },
        );
      });
    });

    const signal = await started.promise;
    expect(signal.aborted).toBe(false);
    expect(scheduler.cancel('active-track')).toBe(true);
    expect(signal.aborted).toBe(true);
    await expect(job).rejects.toMatchObject({
      code: 'IMPORT_DOWNLOAD_CANCELLED',
    });
  });

  it('removes a queued job without starting it', async () => {
    const scheduler = createProviderDownloadScheduler({ concurrency: 1 });
    const active = deferred();
    const queuedStart = vi.fn();
    const first = scheduler.schedule('active-track', () => active.promise);
    const queued = scheduler.schedule('queued-track', queuedStart);

    expect(scheduler.cancel('queued-track')).toBe(true);
    await expect(queued).rejects.toMatchObject({
      code: 'IMPORT_DOWNLOAD_CANCELLED',
    });
    expect(queuedStart).not.toHaveBeenCalled();

    active.resolve('done');
    await first;
  });
});
