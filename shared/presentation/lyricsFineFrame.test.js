import { describe, expect, it } from 'vitest';
import {
  fineTextParts,
  projectLyricsFineFrame,
  mapLyricsFineText,
} from './lyricsFineFrame.mjs';
import {
  selectLyricsOverlayFrame,
  nextLyricsBoundaryDelayMs,
} from './state.mjs';

const fine = {
  version: 1,
  units: [
    { unitId: 'u1', from: 0, to: 1, startMs: 1100, endMs: 1300 },
    { unitId: 'u2', from: 1, to: 2, startMs: 1400, endMs: 2200 },
    { unitId: 'u3', from: 2, to: 4, startMs: 3000, endMs: 3700 },
  ],
};
const line = {
  lineId: 'line',
  text: '今日歌う',
  startMs: 1000,
  endMs: 5000,
  estimatedStarts: {
    version: 1,
    segments: [
      { segmentId: 'a', text: '今日', startMs: 1000 },
      { segmentId: 'b', text: '歌う', startMs: 3000 },
    ],
  },
  estimatedFineTiming: fine,
};

describe('model fine timing presentation', () => {
  it('maps only stable converted boundaries and declines length-changing or combining rewrites', () => {
    const evidence = {
      version: 1,
      units: [{ unitId: 'f', from: 0, to: 1, startMs: 1000, endMs: 2000 }],
    };
    const convert = (text) => text.replaceAll('发', '髮');
    expect(mapLyricsFineText('发型', '髮型', evidence, convert)).toEqual(
      evidence,
    );
    expect(mapLyricsFineText('发型', '髮型', evidence)).toBeNull();
    expect(
      mapLyricsFineText('发型', '髮型', evidence, (text) =>
        text.replaceAll('发', '發'),
      ),
    ).toBeNull();
    expect(mapLyricsFineText('发型', '新髮型', evidence)).toBeNull();
    expect(
      mapLyricsFineText('xy', 'a\u0301', evidence, (text) =>
        text === 'x' ? 'a' : '\u0301',
      ),
    ).toBeNull();
    expect(mapLyricsFineText('发型', '髮型', null)).toBeNull();
    expect(mapLyricsFineText('发型', '发型', evidence)).toBe(evidence);
  });
  it('fills real unit intervals continuously at their own speeds, preserving gaps and completion', () => {
    const at = (p) =>
      projectLyricsFineFrame(line, p, { rate: 2, playing: true });
    expect(at(1200).units[0]).toMatchObject({
      progress: 0.5,
      remainingMs: 50,
      delayMs: 0,
    });
    expect(at(1800).units[1]).toMatchObject({
      progress: 0.5,
      remainingMs: 200,
    });
    expect(at(1350).units[0].progress).toBe(1);
    expect(at(1350).units[1]).toMatchObject({
      progress: 0,
      delayMs: 25,
      remainingMs: 400,
    });
    expect(at(4000).units.every((u) => u.progress === 1)).toBe(true);
    expect(projectLyricsFineFrame(line, 1800).units[1].remainingMs).toBeNull();
  });
  it('preserves all source text and declines a unit split by a ruby or page boundary', () => {
    const units = projectLyricsFineFrame(line, 1800).units;
    expect(
      fineTextParts(line.text, units)
        .map((p) => p.text)
        .join(''),
    ).toBe(line.text);
    expect(fineTextParts(line.text, units, 2, 3)).toEqual([
      { from: 2, to: 3, text: '歌' },
    ]);
    const partial = fineTextParts(
      line.text,
      units.filter((u) => u.unitId !== 'u2'),
    );
    expect(partial.map((p) => p.text).join('')).toBe(line.text);
    expect(partial.find((p) => p.from === 1)).not.toHaveProperty('unitId');
    const word = fineTextParts('今日歌う', [fine.units[2]], 2, 4);
    expect(word.map((part) => part.text)).toEqual(['歌', 'う']);
    expect(word.map((part) => [part.paintFrom, part.paintTo])).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
    expect(word.map((part) => [part.startMs, part.endMs])).toEqual([
      [3000, 3700],
      [3000, 3700],
    ]);
  });
  it('rejects unsafe fine evidence without replacing starts and always prefers native T2', () => {
    expect(
      projectLyricsFineFrame(
        { ...line, segments: [{ text: line.text }] },
        1500,
      ),
    ).toBeNull();
    expect(
      projectLyricsFineFrame(
        { ...line, estimatedFineTiming: { ...fine, version: 2 } },
        1500,
      ),
    ).toBeNull();
    expect(
      projectLyricsFineFrame({ ...line, estimatedStarts: undefined }, 1500),
    ).toBeNull();
  });
  it('adds a separate fine projection to Focus without changing coarse onset states or deadlines', () => {
    const snapshot = {
      generatedAt: '2026-10-22T00:00:00Z',
      revision: 1,
      playback: {
        track: { id: 'song' },
        status: 'playing',
        positionMs: 1000,
        sampledAt: '2026-10-22T00:00:00Z',
        playbackRate: 1,
      },
      lyrics: { synced: true, trackId: 'song', offsetMs: 0, lines: [line] },
    };
    const options = {
      nowMs: Date.parse(snapshot.generatedAt),
      templateId: 'focus-line',
    };
    const frame = selectLyricsOverlayFrame(snapshot, options);
    expect(frame.currentTimingSource).toBe('model-starts');
    expect(frame.currentSegments[0]).toMatchObject({
      state: 'active',
      progress: null,
    });
    expect(frame.currentFineTiming.units[0]).toMatchObject({
      progress: 0,
      delayMs: 100,
    });
    expect(nextLyricsBoundaryDelayMs(snapshot, options)).toBe(2000);
    snapshot.displayDelayMs = 200;
    const held = selectLyricsOverlayFrame(snapshot, options).currentFineTiming;
    expect(held.positionMs).toBe(1000);
    expect(held.advanceAtMs).toBe(options.nowMs + 200);
    expect(
      selectLyricsOverlayFrame(snapshot, {
        ...options,
        nowMs: options.nowMs + 150,
      }).currentFineTiming.positionMs,
    ).toBe(1000);
  });
});
