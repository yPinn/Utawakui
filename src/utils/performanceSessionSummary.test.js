import { describe, expect, it } from 'vitest';
import { performanceSessionSummary } from './performanceSessionSummary.js';

const item = (itemId, progress = 'queued', fields = {}) => ({
  itemId,
  progress,
  mode: 'library-track',
  trackId: 'song',
  ...fields,
});
describe('arrangement summary projection', () => {
  it('counts each occurrence and separates completed, skipped and interrupted', () => {
    const items = [
      item('q'),
      item('np', 'playing'),
      item('done', 'completed'),
      item('skip', 'skipped'),
      item('stop', 'interrupted'),
    ];
    expect(
      performanceSessionSummary(items, [{ id: 'song', duration: 120 }], 'np'),
    ).toEqual({
      total: 5,
      pending: 1,
      current: 1,
      completed: 1,
      skipped: 1,
      interrupted: 1,
      knownDuration: 600,
      unknownDurationCount: 0,
    });
    expect(items.map((i) => i.progress)).toEqual([
      'queued',
      'playing',
      'completed',
      'skipped',
      'interrupted',
    ]);
  });
  it('does not count a loading current twice or override its already saved result', () => {
    expect(
      performanceSessionSummary([item('loading')], [], 'loading'),
    ).toMatchObject({ pending: 0, current: 1 });
    expect(
      performanceSessionSummary([item('done', 'completed')], [], 'done'),
    ).toMatchObject({ current: 0, completed: 1 });
    expect(
      performanceSessionSummary([item('q')], [], 'ordinary-player'),
    ).toMatchObject({ pending: 1, current: 0 });
  });
  it('distinguishes unknown manual, deleted and invalid lengths without treating availability as duration', () => {
    const items = [
      item('known', 'queued', { ready: false }),
      item('manual', 'queued', { mode: 'manual' }),
      item('gone', 'completed', { trackId: 'gone' }),
      ...['zero', 'negative', 'nan', 'infinity', 'string'].map((id) =>
        item(id, 'queued', { trackId: id }),
      ),
    ];
    const tracks = [
      { id: 'song', duration: 65.5 },
      { id: 'zero', duration: 0 },
      { id: 'negative', duration: -1 },
      { id: 'nan', duration: NaN },
      { id: 'infinity', duration: Infinity },
      { id: 'string', duration: '100' },
    ];
    expect(performanceSessionSummary(items, tracks)).toMatchObject({
      total: 8,
      knownDuration: 65.5,
      unknownDurationCount: 7,
    });
  });
  it('recomputes from removal and preserves totals on reorder, including long arrangements', () => {
    const items = [item('one'), item('two')],
      tracks = [{ id: 'song', duration: 3700 }];
    expect(performanceSessionSummary(items, tracks)).toEqual(
      performanceSessionSummary([...items].reverse(), tracks),
    );
    expect(
      performanceSessionSummary(items.slice(1), tracks).knownDuration,
    ).toBe(3700);
    expect(performanceSessionSummary([], [])).toEqual({
      total: 0,
      pending: 0,
      current: 0,
      completed: 0,
      skipped: 0,
      interrupted: 0,
      knownDuration: 0,
      unknownDurationCount: 0,
    });
  });
});
