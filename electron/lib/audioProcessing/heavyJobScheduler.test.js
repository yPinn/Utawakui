import { describe, expect, it, vi } from 'vitest';
import { createHeavyJobScheduler } from './heavyJobScheduler.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('HeavyJobScheduler', () => {
  it('runs one CPU-heavy job at a time and starts the next after release', async () => {
    const first = deferred();
    const order = [];
    const scheduler = createHeavyJobScheduler();
    const firstResult = scheduler.schedule({
      jobId: 'job-1',
      start: () => {
        order.push('job-1');
        return { result: first.promise, cancel: vi.fn() };
      },
    });
    const secondResult = scheduler.schedule({
      jobId: 'job-2',
      start: () => {
        order.push('job-2');
        return { result: Promise.resolve('second'), cancel: vi.fn() };
      },
    });

    await vi.waitFor(() => expect(order).toEqual(['job-1']));
    first.resolve('first');
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
    expect(order).toEqual(['job-1', 'job-2']);
  });

  it('cancels queued and active jobs without starting cancelled work', async () => {
    const active = deferred();
    const activeCancel = vi.fn(async () =>
      active.reject(new Error('cancelled')),
    );
    const queuedStart = vi.fn();
    const scheduler = createHeavyJobScheduler();
    const activeResult = scheduler.schedule({
      jobId: 'job-1',
      start: () => ({ result: active.promise, cancel: activeCancel }),
    });
    const queuedResult = scheduler.schedule({
      jobId: 'job-2',
      start: queuedStart,
    });

    await expect(scheduler.cancel('job-2')).resolves.toBe(true);
    await expect(queuedResult).rejects.toThrow(/cancelled/i);
    expect(queuedStart).not.toHaveBeenCalled();
    await expect(scheduler.cancel('job-1')).resolves.toBe(true);
    await expect(activeResult).rejects.toThrow(/cancelled/i);
    expect(activeCancel).toHaveBeenCalledOnce();
  });

  it('shuts down the active process and rejects all pending jobs', async () => {
    const active = deferred();
    const cancel = vi.fn(async () => active.reject(new Error('cancelled')));
    const scheduler = createHeavyJobScheduler();
    const first = scheduler.schedule({
      jobId: 'job-1',
      start: () => ({ result: active.promise, cancel }),
    });
    const second = scheduler.schedule({
      jobId: 'job-2',
      start: vi.fn(),
    });

    await scheduler.shutdown();
    await expect(first).rejects.toThrow(/cancelled/i);
    await expect(second).rejects.toThrow(/shutdown/i);
    expect(cancel).toHaveBeenCalledOnce();
    expect(() =>
      scheduler.schedule({ jobId: 'job-3', start: vi.fn() }),
    ).toThrow(/shut down/i);
  });

  it('reports finalizing active work as non-cancellable', async () => {
    const finalizing = deferred();
    const cancel = vi.fn(async () => false);
    const scheduler = createHeavyJobScheduler();
    const result = scheduler.schedule({
      jobId: 'job-1',
      start: () => ({ result: finalizing.promise, cancel }),
    });

    await expect(scheduler.cancel('job-1')).resolves.toBe(false);
    finalizing.resolve('published');
    await expect(result).resolves.toBe('published');
  });

  it('rejects duplicate or unsafe main-owned job ids', () => {
    const scheduler = createHeavyJobScheduler();
    const active = deferred();
    scheduler.schedule({
      jobId: 'job-1',
      start: () => ({ result: active.promise, cancel: vi.fn() }),
    });

    expect(() =>
      scheduler.schedule({ jobId: 'job-1', start: vi.fn() }),
    ).toThrow(/job id/i);
    expect(() =>
      scheduler.schedule({ jobId: '../escape', start: vi.fn() }),
    ).toThrow(/job id/i);
    active.resolve();
  });
});
