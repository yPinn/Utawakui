import { describe, expect, it, vi } from 'vitest';
import { createSeparationQueueService } from './separationQueueService.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function createHarness(overrides = {}) {
  let nextId = 0;
  const runs = [];
  const runTrack = vi.fn(({ trackId, recipeId, onProgress }) => {
    const task = deferred();
    runs.push({ trackId, recipeId, onProgress, task });
    return task.promise;
  });
  const hasCurrentResult = vi.fn(async () => false);
  const cancelActiveTrack = vi.fn(async () => true);
  const updates = [];
  const service = createSeparationQueueService({
    resolveRecipe: (recipeId) => {
      if (!['quick', 'general'].includes(recipeId)) {
        throw new Error('recipe unavailable');
      }
      return { id: recipeId };
    },
    runTrack,
    hasCurrentResult,
    cancelActiveTrack,
    createItemId: () => `item-${++nextId}`,
    onUpdate: (status) => updates.push(status),
    ...overrides,
  });
  return {
    service,
    runTrack,
    hasCurrentResult,
    cancelActiveTrack,
    runs,
    updates,
  };
}

describe('separation queue service', () => {
  it('deduplicates track/recipe work and runs accepted items in order', async () => {
    const harness = createHarness();

    const enqueued = harness.service.enqueue({
      trackIds: ['track-1', 'track-1', 'track-2'],
      recipeId: 'general',
    });

    expect(enqueued.itemIds).toEqual(['item-1', 'item-2']);
    expect(enqueued.queue.items.map(({ trackId }) => trackId)).toEqual([
      'track-1',
      'track-2',
    ]);
    await flush();
    expect(harness.runs.map(({ trackId }) => trackId)).toEqual(['track-1']);

    harness.runs[0].onProgress({ stage: 'separating', percent: 42 });
    expect(harness.service.getStatus().queue.items[0]).toMatchObject({
      status: 'running',
      stage: 'separating',
      percent: 42,
    });

    harness.runs[0].task.resolve({ ok: true });
    await flush();
    expect(harness.runs.map(({ trackId }) => trackId)).toEqual([
      'track-1',
      'track-2',
    ]);
    harness.runs[1].task.resolve({ ok: true });
    await flush();

    expect(harness.service.getStatus().queue).toMatchObject({
      status: 'idle',
      completed: 2,
      failed: 0,
    });
  });

  it('skips a current result by default and still processes the next item', async () => {
    const harness = createHarness({
      hasCurrentResult: vi.fn(async ({ trackId }) => trackId === 'current'),
      runTrack: vi.fn(async () => ({ ok: true })),
    });

    harness.service.enqueue({
      trackIds: ['current', 'fresh'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.getStatus().queue.items).toMatchObject([
      { trackId: 'current', status: 'skipped' },
      { trackId: 'fresh', status: 'completed' },
    ]);
  });

  it('regenerates an existing result only when explicitly requested', async () => {
    const runTrack = vi.fn(async () => ({ ok: true }));
    const harness = createHarness({
      hasCurrentResult: vi.fn(async () => true),
      runTrack,
    });

    harness.service.enqueue({
      trackIds: ['track-1'],
      recipeId: 'quick',
      regenerate: true,
    });
    await flush();

    expect(runTrack).toHaveBeenCalledOnce();
    expect(harness.service.getStatus().queue.items[0].status).toBe('completed');
  });

  it('keeps draining after one item fails without exposing its private error', async () => {
    const runTrack = vi
      .fn()
      .mockRejectedValueOnce(new Error('C:\\private\\song.wav exploded'))
      .mockResolvedValueOnce({ ok: true });
    const harness = createHarness({ runTrack });

    harness.service.enqueue({
      trackIds: ['broken', 'healthy'],
      recipeId: 'general',
    });
    await flush();

    const status = harness.service.getStatus().queue;
    expect(status.items).toMatchObject([
      { trackId: 'broken', status: 'failed', reason: 'processing-failed' },
      { trackId: 'healthy', status: 'completed' },
    ]);
    expect(JSON.stringify(status)).not.toContain('C:\\private');
  });

  it('pauses after the active item and resumes the pending order', async () => {
    const harness = createHarness();
    harness.service.enqueue({
      trackIds: ['track-1', 'track-2'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.pause().queue.status).toBe('pausing');
    harness.runs[0].task.resolve({ ok: true });
    await flush();
    expect(harness.runs).toHaveLength(1);
    expect(harness.service.getStatus().queue).toMatchObject({
      status: 'paused',
      paused: true,
    });

    harness.service.resume();
    await flush();
    expect(harness.runs).toHaveLength(2);
  });

  it('cancels only the active item and leaves later work available', async () => {
    const harness = createHarness();
    harness.service.enqueue({
      trackIds: ['track-1', 'track-2'],
      recipeId: 'general',
    });
    await flush();

    const cancellation = harness.service.cancelActive();
    harness.runs[0].task.reject(new Error('audio-processing job cancelled'));
    await expect(cancellation).resolves.toBe(true);
    await flush();

    expect(harness.cancelActiveTrack).toHaveBeenCalledOnce();
    expect(harness.service.getStatus().queue.items[0].status).toBe('cancelled');
    expect(harness.runs[1].trackId).toBe('track-2');
  });

  it('cancels during the result check without starting the engine', async () => {
    const currentResult = deferred();
    const harness = createHarness({
      hasCurrentResult: vi.fn(() => currentResult.promise),
    });
    harness.service.enqueue({
      trackIds: ['track-1'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.getStatus().queue.items[0].status).toBe('checking');
    await expect(harness.service.cancelActive()).resolves.toBe(true);
    currentResult.resolve(false);
    await flush();

    expect(harness.runTrack).not.toHaveBeenCalled();
    expect(harness.cancelActiveTrack).not.toHaveBeenCalled();
    expect(harness.service.getStatus().queue.items[0].status).toBe('cancelled');
  });

  it('moves and removes pending items without mutating active work', async () => {
    const harness = createHarness();
    harness.service.enqueue({
      trackIds: ['track-1', 'track-2', 'track-3', 'track-4'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.move('item-4', -2)).toBe(true);
    expect(
      harness.service
        .getStatus()
        .queue.items.filter(({ status }) => status === 'pending')
        .map(({ trackId }) => trackId),
    ).toEqual(['track-4', 'track-2', 'track-3']);
    expect(harness.service.move('item-4', -500)).toBe(false);
    expect(harness.service.remove('item-1')).toBe(false);
    expect(harness.service.remove('item-2')).toBe(true);
    expect(
      harness.service.getStatus().queue.items.map(({ trackId }) => trackId),
    ).toEqual(['track-1', 'track-4', 'track-3']);
  });

  it('retries failed work and clears only successful terminal items', async () => {
    const runTrack = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue({ ok: true });
    const harness = createHarness({ runTrack });
    harness.service.enqueue({
      trackIds: ['broken', 'done'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.retry('item-1')).toBe(true);
    await flush();
    expect(harness.service.getStatus().queue.items[0].status).toBe('completed');

    expect(harness.service.clearCompleted()).toBe(2);
    expect(harness.service.getStatus()).toEqual({ queue: null });
  });

  it('lets the operator dismiss failed or cancelled history', async () => {
    const harness = createHarness({
      runTrack: vi.fn(async () => {
        throw new Error('failed');
      }),
    });
    harness.service.enqueue({
      trackIds: ['broken'],
      recipeId: 'general',
    });
    await flush();

    expect(harness.service.remove('item-1')).toBe(true);
    expect(harness.service.getStatus()).toEqual({ queue: null });
  });

  it('keeps the retained public queue within its 500-item contract', async () => {
    const harness = createHarness({
      runTrack: vi.fn(async () => ({ ok: true })),
    });
    const trackIds = Array.from(
      { length: 500 },
      (_, index) => `track-${index}`,
    );

    const queued = harness.service.enqueue({
      trackIds,
      recipeId: 'general',
    });
    await harness.service.waitForItem(queued.itemIds.at(-1));

    expect(() =>
      harness.service.enqueue({
        trackIds: ['track-over-limit'],
        recipeId: 'general',
      }),
    ).toThrow('separation queue is full');
  });

  it('rejects unbounded, unsafe, or unavailable queue intent', () => {
    const harness = createHarness();

    expect(() =>
      harness.service.enqueue({ trackIds: [], recipeId: 'general' }),
    ).toThrow('invalid separation queue track ids');
    expect(() =>
      harness.service.enqueue({
        trackIds: ['C:\\private'],
        recipeId: 'general',
      }),
    ).toThrow('invalid separation queue track ids');
    expect(() =>
      harness.service.enqueue({ trackIds: ['track-1'], recipeId: 'refined' }),
    ).toThrow('recipe unavailable');
    expect(() =>
      harness.service.enqueue({
        trackIds: ['track-1'],
        recipeId: 'general',
        regenerate: 'yes',
      }),
    ).toThrow('invalid separation queue options');
  });
});
