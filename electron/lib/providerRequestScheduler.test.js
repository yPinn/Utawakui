import { describe, expect, it, vi } from 'vitest';
import { createProviderRequestScheduler } from './providerRequestScheduler.js';

describe('createProviderRequestScheduler', () => {
  it('serializes operations and enforces a finite interval', async () => {
    let currentTime = 0;
    const wait = vi.fn(async (delayMs) => {
      currentTime += delayMs;
    });
    const scheduler = createProviderRequestScheduler({
      intervalMs: 100,
      now: () => currentTime,
      wait,
    });
    const starts = [];

    await Promise.all([
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
    ]);

    expect(starts).toEqual([0, 100, 200]);
    expect(wait.mock.calls).toEqual([[100], [100]]);
  });

  it('uses zero for invalid intervals and ignores invalid deferrals', async () => {
    const wait = vi.fn();
    const scheduler = createProviderRequestScheduler({
      intervalMs: Number.NaN,
      now: () => 50,
      wait,
    });

    scheduler.deferFor(Number.POSITIVE_INFINITY);
    scheduler.deferFor(0);
    await scheduler.schedule(async () => undefined);
    await scheduler.schedule(async () => undefined);

    expect(wait).not.toHaveBeenCalled();
  });

  it('continues after rejection and rejects an aborted queued operation', async () => {
    const scheduler = createProviderRequestScheduler({ intervalMs: 0 });
    const first = scheduler.schedule(async () => {
      throw new Error('provider failed');
    });

    await expect(first).rejects.toThrow('provider failed');
    await expect(scheduler.schedule(async () => 'recovered')).resolves.toBe(
      'recovered',
    );

    const controller = new AbortController();
    const secondOperation = vi.fn();
    const second = scheduler.schedule(secondOperation, {
      signal: controller.signal,
    });
    controller.abort(
      Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    );

    await expect(second).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancelled',
    });
    expect(secondOperation).not.toHaveBeenCalled();
  });

  it('uses an AbortError when an aborted signal has no Error reason', async () => {
    const scheduler = createProviderRequestScheduler({ intervalMs: 0 });
    const signal = { aborted: true, reason: 'cancelled' };

    await expect(
      scheduler.schedule(async () => undefined, { signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects new work when the bounded pending queue is full', async () => {
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const scheduler = createProviderRequestScheduler({
      intervalMs: 0,
      maxPending: 2,
    });
    const first = scheduler.schedule(() => firstGate);
    const secondOperation = vi.fn(async () => 'second');
    const second = scheduler.schedule(secondOperation);

    await expect(
      scheduler.schedule(async () => 'overflow'),
    ).rejects.toMatchObject({ name: 'QueueFullError' });

    releaseFirst('first');
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(secondOperation).toHaveBeenCalledOnce();

    await expect(scheduler.schedule(async () => 'recovered')).resolves.toBe(
      'recovered',
    );
  });

  it('releases bounded queue capacity immediately when queued work is aborted', async () => {
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const scheduler = createProviderRequestScheduler({
      intervalMs: 0,
      maxPending: 2,
    });
    const first = scheduler.schedule(() => firstGate);
    const controller = new AbortController();
    const cancelledOperation = vi.fn();
    const cancelled = scheduler.schedule(cancelledOperation, {
      signal: controller.signal,
    });
    await expect(
      scheduler.schedule(async () => 'blocked'),
    ).rejects.toMatchObject({ name: 'QueueFullError' });

    controller.abort();
    const replacement = scheduler.schedule(async () => 'replacement');
    releaseFirst('first');

    await expect(first).resolves.toBe('first');
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await expect(replacement).resolves.toBe('replacement');
    expect(cancelledOperation).not.toHaveBeenCalled();
  });

  it('removes and settles aborted queue nodes while the head remains blocked', async () => {
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const scheduler = createProviderRequestScheduler({
      intervalMs: 0,
      maxPending: 2,
    });
    const first = scheduler.schedule(() => firstGate);

    for (let index = 0; index < 100; index += 1) {
      const controller = new AbortController();
      const cancelled = scheduler.schedule(async () => index, {
        signal: controller.signal,
      });
      controller.abort();
      const outcome = await Promise.race([
        cancelled.catch((error) => error.name),
        new Promise((resolve) =>
          setTimeout(() => resolve('still-pending'), 10),
        ),
      ]);
      expect(outcome).toBe('AbortError');
    }

    const replacement = scheduler.schedule(async () => 'replacement');
    releaseFirst('first');
    await expect(first).resolves.toBe('first');
    await expect(replacement).resolves.toBe('replacement');
  });
});
