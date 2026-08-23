import { describe, expect, it, vi } from 'vitest';
import { createLrclibRequestScheduler } from './scheduler.js';

describe('createLrclibRequestScheduler', () => {
  it('serializes requests and spaces their start times', async () => {
    let currentTime = 0;
    const waitCalls = [];
    const scheduler = createLrclibRequestScheduler({
      intervalMs: 250,
      now: () => currentTime,
      wait: async (delayMs) => {
        waitCalls.push(delayMs);
        currentTime += delayMs;
      },
    });
    const starts = [];

    await Promise.all([
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
    ]);

    expect(starts).toEqual([0, 250, 500]);
    expect(waitCalls).toEqual([250, 250]);
  });

  it('holds the shared queue until a provider retry window expires', async () => {
    let currentTime = 100;
    const wait = vi.fn(async (delayMs) => {
      currentTime += delayMs;
    });
    const scheduler = createLrclibRequestScheduler({
      intervalMs: 250,
      now: () => currentTime,
      wait,
    });

    await scheduler.schedule(async () => undefined);
    scheduler.deferFor(900);
    await scheduler.schedule(async () => undefined);

    expect(wait).toHaveBeenCalledWith(900);
    expect(currentTime).toBe(1000);
  });

  it('continues the queue after a scheduled operation rejects', async () => {
    const scheduler = createLrclibRequestScheduler({
      intervalMs: 0,
      wait: vi.fn(),
    });
    const second = vi.fn().mockResolvedValue('ok');

    await expect(
      scheduler.schedule(async () => {
        throw new Error('first failed');
      }),
    ).rejects.toThrow('first failed');
    await expect(scheduler.schedule(second)).resolves.toBe('ok');
    expect(second).toHaveBeenCalledOnce();
  });
});
