import { expect, it, vi } from 'vitest';
import { createExperimentalLyricsQueue } from './automatic.js';

function setup() {
  let preferred = 'a.lrc',
    version = 'v1';
  const research = {
    status: () => ({ status: 'ready', busy: true }),
    prepareAnalysis: vi.fn(async (_track, _language, source) => ({
      sourceFilename: source ?? preferred,
      sourceRevision: version,
    })),
    analyze: vi.fn(async () => ({ status: 'ready' })),
    cancel: vi.fn(),
  };
  const queue = createExperimentalLyricsQueue({
    getConfig: () => ({ experimentalLyricsAfterSeparation: true }),
    updateConfig: vi.fn(),
    isAllowed: () => true,
    research,
  });
  return {
    queue,
    research,
    prefer: (v) => {
      preferred = v;
    },
    revise: (v) => {
      version = v;
    },
  };
}

it('freezes source/version at admission, deduplicates only that version, and cancels one job', async () => {
  const { queue, research, prefer, revise } = setup();
  expect(await queue.enqueue('song')).toBe(true);
  prefer('b.lrc');
  expect(await queue.enqueue('song')).toBe(true);
  expect(await queue.enqueue('song', 'auto', 'a.lrc')).toBe(false);
  revise('v2');
  expect(await queue.enqueue('song', 'auto', 'a.lrc')).toBe(true);
  const items = queue.status().items;
  expect(items.map((i) => [i.sourceFilename, i.sourceRevision])).toEqual([
    ['a.lrc', 'v1'],
    ['b.lrc', 'v1'],
    ['a.lrc', 'v2'],
  ]);
  expect(new Set(items.map((i) => i.jobId)).size).toBe(3);
  await queue.cancel('song', items[0].jobId);
  expect(queue.status().items.map((i) => i.status)).toEqual([
    'cancelled',
    'pending',
    'pending',
  ]);
  research.status = () => ({ status: 'ready', busy: false });
  // Enqueue wakes the existing bounded drain without waiting for a retry tick.
  await queue.enqueue('next', 'auto', 'c.lrc');
  await vi.waitFor(() => expect(research.analyze).toHaveBeenCalledTimes(3));
  expect(research.analyze.mock.calls[0]).toEqual([
    'song',
    'auto',
    'b.lrc',
    'v1',
  ]);
  expect(research.analyze.mock.calls[1]).toEqual([
    'song',
    'auto',
    'a.lrc',
    'v2',
  ]);
  await queue.cancel();
});

it('does not admit after disable/cancel while source capture is pending', async () => {
  const { queue, research } = setup();
  let finish;
  research.prepareAnalysis.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const admission = queue.enqueue('song', 'auto', 'a.lrc');
  await queue.cancel('song');
  finish({ sourceFilename: 'a.lrc', sourceRevision: 'v1' });
  expect(await admission).toBe(false);
  expect(queue.status().items).toEqual([]);
});

it('isolates concurrent duplicate admissions and contains capture failures', async () => {
  const { queue, research } = setup();
  expect(
    await Promise.all([queue.enqueue('song'), queue.enqueue('song')]),
  ).toEqual([true, false]);
  research.prepareAnalysis.mockRejectedValueOnce(Error('private-path'));
  expect(await queue.enqueue('other')).toBe(false);
  expect(JSON.stringify(queue.status())).not.toContain('private-path');
  await queue.cancel();
});
