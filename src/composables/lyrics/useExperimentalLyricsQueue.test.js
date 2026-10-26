import { afterEach, expect, it, vi } from 'vitest';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
afterEach(() => vi.unstubAllGlobals());
it('refreshes on the bounded completion event without a library reload and emits job metadata once', async () => {
  let completed;
  const getStatus = vi.fn(async () => ({
    items: [
      {
        jobId: 'new-job',
        trackId: 'song',
        sourceFilename: 'a.lrc',
        sourceRevision: 'v2',
        status: 'ready',
      },
    ],
  }));
  const subscribe = vi.fn((callback) => {
    completed = callback;
    return vi.fn();
  });
  vi.stubGlobal('window', {
    Utawakui: {
      getExperimentalLyricsStatus: getStatus,
      onExperimentalLyricsCompleted: subscribe,
    },
  });
  const queue = useExperimentalLyricsQueue();
  useExperimentalLyricsQueue();
  expect(subscribe).toHaveBeenCalledTimes(1);
  completed();
  await Promise.resolve();
  expect(queue.completions.value).toMatchObject([
    { jobId: 'new-job', sourceFilename: 'a.lrc', sourceRevision: 'v2' },
  ]);
  const revision = queue.revision.value;
  completed();
  await Promise.resolve();
  expect(queue.revision.value).toBe(revision);
});
it('refreshes estimates on completion once, preserves stable polling, and reports a rejected enqueue', async () => {
  let status = {
    enabled: true,
    allowed: true,
    items: [{ trackId: 'song', status: 'running' }],
  };
  const retry = vi.fn(async () => ({ queued: false }));
  vi.stubGlobal('window', {
    Utawakui: {
      getExperimentalLyricsStatus: async () => status,
      retryExperimentalLyrics: retry,
    },
  });
  const queue = useExperimentalLyricsQueue();
  await queue.refresh();
  const before = queue.revision.value;
  status = { ...status, items: [{ trackId: 'song', status: 'ready' }] };
  await queue.refresh();
  expect(queue.revision.value).toBe(before + 1);
  await queue.refresh();
  expect(queue.revision.value).toBe(before + 1);
  await queue.retry('song', 'ja', 'active.lrc');
  expect(retry).toHaveBeenCalledWith('song', 'ja', 'active.lrc');
  expect(queue.error.value).toContain('操作未完成');
  expect(queue.revision.value).toBe(before + 1);
});

it('clears a recovered read failure without clearing an unsuccessful operation', async () => {
  vi.resetModules();
  const { useExperimentalLyricsQueue: createQueue } =
    await import('./useExperimentalLyricsQueue.js');
  const read = vi
    .fn()
    .mockRejectedValueOnce(Error('private read'))
    .mockResolvedValue({ enabled: false, allowed: true, items: [] });
  vi.stubGlobal('window', {
    Utawakui: {
      getExperimentalLyricsStatus: read,
      setExperimentalLyricsEnabled: vi
        .fn()
        .mockRejectedValueOnce(Error('private save'))
        .mockResolvedValue(undefined),
    },
  });
  const queue = createQueue();
  await queue.refresh();
  expect(queue.readError.value).toContain('無法讀取');
  await queue.refresh();
  expect(queue.error.value).toBe('');
  await queue.setEnabled(true);
  expect(queue.error.value).toContain('操作未完成');
  expect(queue.readError.value).toBe('');
  await queue.refresh();
  expect(queue.error.value).toContain('操作未完成');
  await queue.setEnabled(true);
  expect(queue.error.value).toBe('');
});

it('ignores a rejected old read after a newer status has recovered', async () => {
  vi.resetModules();
  const { useExperimentalLyricsQueue: createQueue } =
    await import('./useExperimentalLyricsQueue.js');
  let rejectOld;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    )
    .mockResolvedValue({ enabled: true, allowed: true, items: [] });
  vi.stubGlobal('window', { Utawakui: { getExperimentalLyricsStatus: read } });
  const queue = createQueue();
  const oldRead = queue.refresh();
  await queue.refresh();
  rejectOld(Error('stale private failure'));
  await oldRead;
  expect(queue.error.value).toBe('');
  expect(queue.state.value.enabled).toBe(true);
});
