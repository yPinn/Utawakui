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
    clearPendingSeparations: vi.fn().mockResolvedValue({ removed: 1 }),
    clearCompletedSeparations: vi.fn().mockResolvedValue({ removed: 1 }),
    cancelSeparation: vi.fn().mockResolvedValue({ cancelled: true }),
    onSeparationQueueProgress: vi.fn((callback) => {
      listener = callback;
      return unsubscribe;
    }),
  };
  const notify = vi.fn();
  const separationQueue = useSeparationQueue({ bridge, notify });
  return {
    bridge,
    separationQueue,
    emit: (payload) => listener?.(payload),
    unsubscribe,
    notify,
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
  it('preserves the latest push across fast enqueue replies and shows current operation failures', async () => {
    const h = createHarness();
    await h.separationQueue.initialize();
    const enqueued = Promise.withResolvers();
    h.bridge.enqueueSeparations.mockReturnValueOnce(enqueued.promise);
    const adding = h.separationQueue.enqueue(['track-0']);
    h.emit(snapshot(['running']));
    h.emit(snapshot(['completed']));
    enqueued.resolve(snapshot(['pending']));
    await adding;
    expect(h.separationQueue.queue.value.status).toBe('idle');
    expect(h.notify).toHaveBeenCalledOnce();
    h.bridge.enqueueSeparations.mockRejectedValueOnce(Error('private enqueue'));
    await h.separationQueue.enqueue(['track-1']);
    expect(h.separationQueue.error.value).toContain('歌曲目前無法加入');
    h.bridge.pauseSeparationQueue.mockRejectedValueOnce(Error('private pause'));
    await h.separationQueue.pause();
    expect(h.separationQueue.error.value).toBe(
      '目前無法更新處理清單，請再試一次。',
    );
    h.bridge.removeSeparationQueueItem.mockRejectedValueOnce(
      Error('private remove'),
    );
    await h.separationQueue.remove('item-0');
    expect(h.separationQueue.error.value).not.toContain('private');
    h.bridge.getSeparationQueueStatus.mockRejectedValueOnce(
      Error('private read'),
    );
    await h.separationQueue.refreshStatus();
    expect(h.separationQueue.error.value).toBe(
      '處理清單暫時無法讀取，請稍後再試。',
    );
  });
  it('keeps a known snapshot on malformed pushes and refuses actions after disposal', async () => {
    const h = createHarness();
    await h.separationQueue.initialize();
    h.emit(runningQueue());
    h.emit({ queue: { total: 9999 } });
    expect(h.separationQueue.queue.value.total).toBe(3);
    h.separationQueue.dispose();
    await h.separationQueue.initialize();
    await h.separationQueue.enqueue(['track-1']);
    await h.separationQueue.pause();
    await h.separationQueue.retry('item-1');
    expect(h.bridge.getSeparationQueueStatus).toHaveBeenCalledOnce();
    expect(h.bridge.enqueueSeparations).not.toHaveBeenCalled();
    expect(h.bridge.pauseSeparationQueue).not.toHaveBeenCalled();
    expect(h.bridge.retrySeparationQueueItem).not.toHaveBeenCalled();
  });
  function snapshot(statuses, paused = false) {
    const items = statuses.map((status, index) => ({
      itemId: `item-${index}`,
      trackId: `track-${index}`,
      recipeId: 'general',
      status,
    }));
    const count = (status) =>
      items.filter((item) => item.status === status).length;
    const active = items.find((item) =>
      ['checking', 'running'].includes(item.status),
    );
    const pending = count('pending');
    const completed = count('completed'),
      skipped = count('skipped'),
      failed = count('failed'),
      cancelled = count('cancelled');
    return {
      queue: {
        items,
        total: items.length,
        completed,
        skipped,
        failed,
        cancelled,
        done: completed + skipped + failed + cancelled,
        pending,
        activeItemId: active?.itemId ?? null,
        paused,
        status: paused
          ? active
            ? 'pausing'
            : 'paused'
          : active || pending
            ? 'running'
            : 'idle',
      },
    };
  }

  it('announces a completed round once after publication, not at writing 100 percent', async () => {
    const h = createHarness();
    await h.separationQueue.initialize();
    const working = snapshot(['running']);
    working.queue.items[0] = {
      ...working.queue.items[0],
      stage: 'writing',
      percent: 100,
    };
    h.emit(working);
    expect(h.notify).not.toHaveBeenCalled();
    const completed = snapshot(['completed']);
    h.emit(completed);
    h.emit(completed);
    h.bridge.getSeparationQueueStatus.mockResolvedValue(completed);
    await h.separationQueue.refreshStatus();
    expect(h.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: '伴奏處理完成',
        tone: 'success',
        lifecycle: 'transient',
      }),
    );
    expect(h.notify.mock.calls[0][0]).not.toHaveProperty('action');
  });

  it('ignores historical results and reports one mixed summary for the current round', async () => {
    const h = createHarness();
    h.bridge.getSeparationQueueStatus.mockResolvedValue(
      snapshot(['completed']),
    );
    await h.separationQueue.initialize();
    expect(h.notify).not.toHaveBeenCalled();
    h.emit(snapshot(['completed', 'running', 'pending']));
    h.emit(snapshot(['completed', 'completed', 'running']));
    expect(h.notify).not.toHaveBeenCalled();
    h.emit(snapshot(['completed', 'completed', 'failed']));
    expect(h.notify).toHaveBeenCalledOnce();
    expect(h.notify.mock.calls[0][0]).toMatchObject({
      tone: 'warning',
      message: '1 首完成，1 首失敗',
      lifecycle: 'persistent',
      actionLabel: '查看處理清單',
    });
    h.emit({ queue: null });
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('reports a same-item retry as a new round and a stopped round without success', async () => {
    const h = createHarness();
    await h.separationQueue.initialize();
    h.emit(snapshot(['running']));
    h.emit(snapshot(['failed']));
    expect(h.notify.mock.calls[0][0].tone).toBe('danger');
    h.emit(snapshot(['pending'], true));
    expect(h.notify).toHaveBeenCalledOnce();
    h.emit(snapshot(['cancelled'], true));
    h.emit(snapshot(['cancelled'], true));
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify.mock.calls[1][0]).toMatchObject({
      title: '伴奏處理已停止',
      tone: 'info',
      lifecycle: 'transient',
    });
  });

  it('keeps a newer completion push when the initial status read arrives late', async () => {
    const h = createHarness(),
      read = Promise.withResolvers();
    h.bridge.getSeparationQueueStatus.mockReturnValueOnce(read.promise);
    const initializing = h.separationQueue.initialize();
    h.emit(snapshot(['running']));
    h.emit(snapshot(['completed']));
    read.resolve(snapshot(['running']));
    await initializing;
    expect(h.separationQueue.queue.value.status).toBe('idle');
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('ignores older reads, late failures and controls after a newer push or disposal', async () => {
    const h = createHarness();
    await h.separationQueue.initialize();
    const old = Promise.withResolvers(),
      latest = Promise.withResolvers();
    h.bridge.getSeparationQueueStatus
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const first = h.separationQueue.refreshStatus(),
      second = h.separationQueue.refreshStatus();
    latest.resolve(snapshot(['running']));
    await second;
    old.reject(Error('stale read'));
    await first;
    expect(h.separationQueue.error.value).toBe('');
    const control = Promise.withResolvers();
    h.bridge.pauseSeparationQueue.mockReturnValueOnce(control.promise);
    const pause = h.separationQueue.pause();
    h.emit(snapshot(['completed']));
    control.resolve(snapshot(['pending'], true));
    await pause;
    expect(h.separationQueue.queue.value.status).toBe('idle');
    const last = Promise.withResolvers();
    h.bridge.getSeparationQueueStatus.mockReturnValueOnce(last.promise);
    const refreshing = h.separationQueue.refreshStatus();
    h.separationQueue.dispose();
    last.reject(Error('disposed'));
    await refreshing;
    expect(h.separationQueue.error.value).toBe('');
  });

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
    await harness.separationQueue.move('item-3', -2);
    await harness.separationQueue.remove('item-3');
    await harness.separationQueue.retry('item-2');
    await harness.separationQueue.clearPending();
    await harness.separationQueue.clearCompleted();
    await harness.separationQueue.cancelActive();

    expect(harness.bridge.pauseSeparationQueue).toHaveBeenCalledOnce();
    expect(harness.bridge.resumeSeparationQueue).toHaveBeenCalledOnce();
    expect(harness.bridge.moveSeparationQueueItem).toHaveBeenCalledWith(
      'item-3',
      -2,
    );
    expect(harness.bridge.removeSeparationQueueItem).toHaveBeenCalledWith(
      'item-3',
    );
    expect(harness.bridge.retrySeparationQueueItem).toHaveBeenCalledWith(
      'item-2',
    );
    expect(harness.bridge.clearPendingSeparations).toHaveBeenCalledOnce();
    expect(harness.bridge.clearCompletedSeparations).toHaveBeenCalledOnce();
    expect(harness.bridge.cancelSeparation).toHaveBeenCalledOnce();
    expect(harness.bridge.getSeparationQueueStatus).toHaveBeenCalledTimes(6);
  });

  it('rejects zero, fractional, and out-of-range reorder offsets', () => {
    const harness = createHarness();

    expect(harness.separationQueue.move('item-3', 0)).toBe(false);
    expect(harness.separationQueue.move('item-3', 1.5)).toBe(false);
    expect(harness.separationQueue.move('item-3', 500)).toBe(false);
    expect(harness.bridge.moveSeparationQueueItem).not.toHaveBeenCalled();
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
