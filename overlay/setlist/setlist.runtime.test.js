import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createHistoryMeasurementController,
  setlistHistoryChange,
  setlistHistoryIdentity,
} from './setlist.mjs';
import { setlistHistoryPageOffsets } from './setlistMotion.mjs';

const runtime = readFileSync(new URL('./setlist.mjs', import.meta.url), 'utf8');

describe('Setlist completed-song rendering', () => {
  it('cancels measurements while inactive and after disposal, then remeasures without old reveal', () => {
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    try {
      const refresh = vi.fn();
      const measurement = createHistoryMeasurementController(
        { history: {}, historyViewport: {} },
        { refresh },
      );
      measurement.schedule({ revealLatest: true });
      measurement.suspend();
      expect(cancel).toHaveBeenCalledWith(7);
      measurement.schedule({ revealLatest: true });
      expect(request).toHaveBeenCalledOnce();
      measurement.resume();
      request.mock.calls.at(-1)[0]();
      expect(refresh).toHaveBeenLastCalledWith({
        force: true,
        revealLatest: false,
      });
      measurement.stop();
      measurement.schedule();
      measurement.resume();
      expect(request).toHaveBeenCalledTimes(2);
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
