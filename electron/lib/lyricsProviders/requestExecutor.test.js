import { expect, it, vi } from 'vitest';
import { createLyricsRequestExecutor } from './requestExecutor.js';
it('bounds concurrent operations and gives queued interactive work priority over background', async () => {
  const executor = createLyricsRequestExecutor();
  const finish = [];
  const starts = [];
  const task = (name) => () =>
    new Promise((resolve) => {
      starts.push(name);
      finish.push(resolve);
    });
  const a = executor.run(task('a'));
  const b = executor.run(task('b'));
  const bg = executor.run(task('background'), { priority: 'background' });
  const manual = executor.run(task('manual'));
  await vi.waitFor(() => expect(starts).toEqual(['a', 'b']));
  finish.shift()();
  await vi.waitFor(() => expect(starts).toEqual(['a', 'b', 'manual']));
  finish.shift()();
  await vi.waitFor(() => expect(starts).toHaveLength(4));
  for (const resolve of finish) resolve();
  await Promise.all([a, b, bg, manual]);
});
it('rejects cancelled queued work without starting it', async () => {
  const executor = createLyricsRequestExecutor({ maximum: 1 });
  let finish;
  const first = executor.run(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const work = vi.fn();
  const next = executor.run(work, { signal: controller.signal });
  controller.abort();
  await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  finish();
  await first;
  expect(work).not.toHaveBeenCalled();
});
it('reserves one active slot for interactive work when background tasks are waiting', async () => {
  const executor = createLyricsRequestExecutor();
  const finish = [];
  const started = [];
  const start = (name) => () =>
    new Promise((resolve) => {
      started.push(name);
      finish.push(resolve);
    });
  const a = executor.run(start('bg1'), { priority: 'background' });
  const b = executor.run(start('bg2'), { priority: 'background' });
  await vi.waitFor(() => expect(started).toEqual(['bg1']));
  const manual = executor.run(start('manual'));
  await vi.waitFor(() => expect(started).toEqual(['bg1', 'manual']));
  finish.shift()();
  await vi.waitFor(() => expect(started).toContain('bg2'));
  for (const resolve of finish) resolve();
  await Promise.all([a, b, manual]);
});
