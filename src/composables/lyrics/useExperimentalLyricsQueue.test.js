import { afterEach, expect, it, vi } from 'vitest';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
afterEach(() => vi.unstubAllGlobals());
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
