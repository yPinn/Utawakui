import { describe, expect, it, vi } from 'vitest';
import {
  normalizeSeparationQueueStatus,
  useSeparationQueue,
} from './useSeparationQueue.js';

function runningQueue() {
  return {
    queue: {
      status: 'running',
      paused: false,
      total: 3,
      done: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      pending: 1,
      activeItemId: 'item-2',
      items: [
        {
          itemId: 'item-1',
          trackId: 'track-1',
          recipeId: 'general',
          status: 'completed',
          percent: 100,
        },
        {
          itemId: 'item-2',
          trackId: 'track-2',
          recipeId: 'general',
          status: 'running',
          stage: 'separating',
          percent: 42,
        },
        {
          itemId: 'item-3',
          trackId: 'track-3',
          recipeId: 'general',
          status: 'pending',
        },
      ],
    },
  };
}

function createHarness() {
  let listener;
  const unsubscribe = vi.fn();
  const bridge = {
    getSeparationQueueStatus: vi.fn().mockResolvedValue({ queue: null }),
    enqueueSeparations: vi.fn().mockResolvedValue(runningQueue()),
    pauseSeparationQueue: vi.fn().mockResolvedValue(runningQueue()),
    resumeSeparationQueue: vi.fn().mockResolvedValue(runningQueue()),
    moveSeparationQueueItem: vi.fn().mockResolvedValue({ moved: true }),
    removeSeparationQueueItem: vi.fn().mockResolvedValue({ removed: true }),
    retrySeparationQueueItem: vi.fn().mockResolvedValue({ retried: true }),
    clearCompletedSeparations: vi.fn().mockResolvedValue({ removed: 1 }),
    cancelSeparation: vi.fn().mockResolvedValue({ cancelled: true }),
    onSeparationQueueProgress: vi.fn((callback) => {
      listener = callback;
      return unsubscribe;
    }),
  };
  const separationQueue = useSeparationQueue({ bridge });
  return {
    bridge,
    separationQueue,
    emit: (payload) => listener?.(payload),
    unsubscribe,
  };
}

describe('normalizeSeparationQueueStatus', () => {
  it('accepts a bounded cloneable queue snapshot', () => {
    expect(normalizeSeparationQueueStatus(runningQueue())).toMatchObject({
      status: 'running',
      total: 3,
      activeItemId: 'item-2',
      items: [{ status: 'completed' }, { percent: 42 }, { status: 'pending' }],
    });
  });

  it('rejects private paths, unknown states, and inconsistent counts', () => {
    expect(() =>
      normalizeSeparationQueueStatus({
        queue: {
          ...runningQueue().queue,
          items: [
            ...runningQueue().queue.items.slice(0, 2),
            {
              itemId: 'item-3',
              trackId: 'E:\\private\\song.wav',
              recipeId: 'general',
              status: 'pending',
            },
          ],
        },
      }),
    ).toThrow('invalid separation queue status');

    expect(() =>
      normalizeSeparationQueueStatus({
        queue: { ...runningQueue().queue, done: 3 },
      }),
    ).toThrow('invalid separation queue status');

    expect(() =>
      normalizeSeparationQueueStatus({
        queue: { ...runningQueue().queue, activeItemId: null },
      }),
    ).toThrow('invalid separation queue status');
  });
});

describe('useSeparationQueue', () => {
  it('restores status, listens for progress, and cleans up', async () => {
    const harness = createHarness();
    harness.bridge.getSeparationQueueStatus.mockResolvedValue(runningQueue());

    await harness.separationQueue.initialize();
    expect(harness.separationQueue.active.value).toBe(true);
    expect(harness.separationQueue.queue.value?.items[1]).toMatchObject({
      trackId: 'track-2',
      percent: 42,
    });

    harness.emit({
      queue: {
        ...runningQueue().queue,
        status: 'paused',
        paused: true,
        pending: 2,
        activeItemId: null,
        items: [
          runningQueue().queue.items[0],
          { ...runningQueue().queue.items[1], status: 'pending', percent: 0 },
          runningQueue().queue.items[2],
        ],
      },
    });
    expect(harness.separationQueue.queue.value?.status).toBe('paused');

    harness.separationQueue.dispose();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('sends only ordered ids and product choices when adding songs', async () => {
    const harness = createHarness();

    await harness.separationQueue.enqueue(
      ['track-2', 'track-1', 'track-2'],
      'quick',
      true,
    );

    expect(harness.bridge.enqueueSeparations).toHaveBeenCalledWith(
      ['track-2', 'track-1'],
      'quick',
      true,
    );
    expect(harness.separationQueue.queue.value?.total).toBe(3);
  });

  it('forwards queue controls and refreshes actions without progress payloads', async () => {
    const harness = createHarness();
    harness.bridge.getSeparationQueueStatus
      .mockResolvedValueOnce({ queue: null })
      .mockResolvedValue(runningQueue());

    await harness.separationQueue.pause();
    await harness.separationQueue.resume();
    await harness.separationQueue.move('item-3', -1);
    await harness.separationQueue.remove('item-3');
    await harness.separationQueue.retry('item-2');
    await harness.separationQueue.clearCompleted();
    await harness.separationQueue.cancelActive();

    expect(harness.bridge.pauseSeparationQueue).toHaveBeenCalledOnce();
    expect(harness.bridge.resumeSeparationQueue).toHaveBeenCalledOnce();
    expect(harness.bridge.moveSeparationQueueItem).toHaveBeenCalledWith(
      'item-3',
      -1,
    );
    expect(harness.bridge.removeSeparationQueueItem).toHaveBeenCalledWith(
      'item-3',
    );
    expect(harness.bridge.retrySeparationQueueItem).toHaveBeenCalledWith(
      'item-2',
    );
    expect(harness.bridge.clearCompletedSeparations).toHaveBeenCalledOnce();
    expect(harness.bridge.cancelSeparation).toHaveBeenCalledOnce();
    expect(harness.bridge.getSeparationQueueStatus).toHaveBeenCalledTimes(5);
  });

  it('uses short recovery text and drops malformed main snapshots', async () => {
    const harness = createHarness();
    harness.bridge.getSeparationQueueStatus.mockResolvedValue({
      queue: { ...runningQueue().queue, total: 9999 },
    });

    await harness.separationQueue.initialize();

    expect(harness.separationQueue.queue.value).toBeNull();
    expect(harness.separationQueue.error.value).toBe(
      '處理清單暫時無法讀取，請重新開啟後再試。',
    );
  });
});
