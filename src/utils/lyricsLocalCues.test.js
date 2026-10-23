import { describe, expect, it } from 'vitest';
import {
  localLyricsCuePaused,
  prepareLocalLyricsCuePauses,
} from './lyricsLocalCues.js';

function fixture() {
  return {
    text: '甲乙丙丁',
    startMs: 1000,
    endMs: 5000,
    estimatedStarts: {
      version: 1,
      segments: [
        { text: '甲乙', startMs: 1000 },
        { text: '丙丁', startMs: 3000 },
      ],
    },
    estimatedFineTiming: {
      version: 1,
      units: [
        { unitId: 'a', from: 0, to: 1, startMs: 1100, endMs: 1200 },
        { unitId: 'b', from: 1, to: 2, startMs: 1700, endMs: 2000 },
        { unitId: 'c', from: 2, to: 3, startMs: 3100, endMs: 3200 },
        { unitId: 'd', from: 3, to: 4, startMs: 3700, endMs: 4000 },
      ],
    },
  };
}

describe('local evidenced cue pauses', () => {
  it('keeps local pauses independent across a maximum-unit document', () => {
    const line = {
      text: '甲乙'.repeat(500),
      startMs: 0,
      endMs: 50000,
      estimatedStarts: {
        version: 1,
        segments: Array.from({ length: 500 }, (_, i) => ({
          text: '甲乙',
          startMs: i * 100,
        })),
      },
      estimatedFineTiming: {
        version: 1,
        units: Array.from({ length: 1000 }, (_, i) => ({
          unitId: `u-${i}`,
          from: i,
          to: i + 1,
          startMs: Math.floor(i / 2) * 100 + (i % 2) * 60,
          endMs: Math.floor(i / 2) * 100 + (i % 2) * 60 + 20,
        })),
      },
    };
    expect(prepareLocalLyricsCuePauses(line)).toHaveLength(500);
    for (const i of [0, 249, 499]) {
      expect(localLyricsCuePaused(line, i, i * 100 + 40)).toBe(true);
      expect(localLyricsCuePaused(line, (i + 1) % 500, i * 100 + 40)).toBe(
        false,
      );
      expect(localLyricsCuePaused(line, i, i * 100)).toBe(false);
    }
  });
  it('keeps both original onsets immediate and isolates inner pauses without mutating retained data', () => {
    const line = fixture(),
      before = structuredClone(line);
    expect(prepareLocalLyricsCuePauses(line)).toEqual([
      { chunkIndex: 0, startMs: 1200, endMs: 1700 },
      { chunkIndex: 1, startMs: 3200, endMs: 3700 },
    ]);
    for (const [chunk, time, paused] of [
      [0, 1000, false],
      [0, 1200, true],
      [0, 1700, false],
      [1, 3000, false],
      [1, 3200, true],
      [1, 3700, false],
      [0, 1500, true],
      [1, 1500, false],
      [0, NaN, false],
    ]) {
      expect(localLyricsCuePaused(line, chunk, time)).toBe(paused);
    }
    expect(prepareLocalLyricsCuePauses(line)).toBe(
      prepareLocalLyricsCuePauses(line),
    );
    expect(line).toEqual(before);
  });
  it.each([
    'starts-only',
    'native',
    'invalid-end',
    'uncovered-text',
    'contradictory-onset',
    'different-chunks',
  ])('never interprets %s as an internal pause', (kind) => {
    const line = fixture();
    line.estimatedFineTiming.units = line.estimatedFineTiming.units.slice(0, 2);
    if (kind === 'starts-only') delete line.estimatedFineTiming;
    if (kind === 'native')
      line.segments = [{ text: line.text, startMs: 1000, endMs: 5000 }];
    if (kind === 'invalid-end') line.estimatedFineTiming.units[0].endMs = null;
    if (kind === 'uncovered-text') {
      line.estimatedFineTiming.units[1].from = 2;
      line.estimatedFineTiming.units[1].to = 3;
    }
    if (kind === 'contradictory-onset')
      line.estimatedStarts.segments[0].startMs = 1200;
    if (kind === 'different-chunks')
      line.estimatedStarts.segments = [
        { text: '甲', startMs: 1000 },
        { text: '乙丙丁', startMs: 1700 },
      ];
    expect(prepareLocalLyricsCuePauses(line)).toEqual([]);
  });
  it('rejects gaps beyond the next onset and refreshes evidence only with a new line revision', () => {
    const line = fixture();
    line.estimatedStarts.segments[1].startMs = 1600;
    expect(
      prepareLocalLyricsCuePauses(line).some((p) => p.chunkIndex === 0),
    ).toBe(false);
    const revised = fixture();
    expect(localLyricsCuePaused(revised, 0, 1500)).toBe(true);
    expect(prepareLocalLyricsCuePauses(null)).toEqual([]);
  });
});
