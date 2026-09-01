import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setlistHistoryScrollMetrics } from './setlist.mjs';

const runtime = readFileSync(new URL('./setlist.mjs', import.meta.url), 'utf8');

describe('Setlist completed-song rendering', () => {
  it('keeps a fitting history still', () => {
    expect(
      setlistHistoryScrollMetrics({
        contentHeight: 320,
        viewportHeight: 320,
      }),
    ).toEqual({
      distance: 0,
      durationSeconds: 0,
      overflow: false,
    });
  });

  it('derives vertical travel from actual overflow', () => {
    expect(
      setlistHistoryScrollMetrics({
        contentHeight: 512.2,
        viewportHeight: 320,
      }),
    ).toEqual({
      distance: 193,
      durationSeconds: 14.8,
      overflow: true,
    });
  });

  it('renders history once and measures its viewport without a duplicate list', () => {
    expect(
      runtime.match(/renderHistory\(elements\.history, frame\.history\)/g),
    ).toHaveLength(1);
    expect(runtime).toContain('elements.historyViewport.scrollHeight');
    expect(runtime).toContain('elements.historyViewport.clientHeight');
    expect(runtime).toContain('dataset.historyOverflow');
    expect(runtime).toContain('ResizeObserver');
    expect(runtime).not.toContain('historyCopy');
  });
});
