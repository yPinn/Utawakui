import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setlistHistoryChange, setlistHistoryIdentity } from './setlist.mjs';
import { setlistHistoryPageOffsets } from './setlistMotion.mjs';

const runtime = readFileSync(new URL('./setlist.mjs', import.meta.url), 'utf8');

describe('Setlist completed-song rendering', () => {
  it('keeps a fitting history on one static page', () => {
    expect(
      setlistHistoryPageOffsets({
        contentHeight: 320,
        viewportHeight: 320,
        rowOffsets: [0, 64, 128, 192, 256],
      }),
    ).toEqual([0]);
  });

  it('derives readable row-aligned pages from actual overflow', () => {
    expect(
      setlistHistoryPageOffsets({
        contentHeight: 640,
        viewportHeight: 200,
        rowOffsets: [0, 64, 128, 192, 256, 320, 384, 448, 512, 576],
      }),
    ).toEqual([0, 128, 256, 384, 440]);
  });

  it('uses stable track identity to avoid rebuilding unchanged history', () => {
    const initial = [
      { trackId: 'track-1', title: 'Song', artist: 'Singer' },
      { trackId: 'track-2', title: 'Song', artist: 'Singer' },
    ];
    const advanced = [
      ...initial,
      { trackId: 'track-3', title: 'Song', artist: 'Singer' },
    ];

    expect(setlistHistoryIdentity(initial)).not.toBe(
      setlistHistoryIdentity(advanced),
    );
    expect(setlistHistoryChange(initial, [...initial])).toEqual({
      advanced: false,
      changed: false,
    });
    expect(setlistHistoryChange([], initial)).toEqual({
      advanced: false,
      changed: true,
    });
    expect(setlistHistoryChange(initial, advanced)).toEqual({
      advanced: true,
      changed: true,
    });
    expect(runtime).toContain('if (historyChange.changed)');
    expect(runtime).toContain('historyMeasurement.schedule');
    expect(runtime).toContain('historyMotion.refresh');
    expect(runtime).toContain('ResizeObserver');
    expect(runtime).not.toContain('historyCopy');
  });
});
