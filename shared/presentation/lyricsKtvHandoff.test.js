import { describe, expect, it } from 'vitest';
import { ktvHandoffEndMs } from './lyricsKtvHandoff.mjs';
import {
  nextPresentationBoundaryDelayMs,
  selectLyricsOverlayFrame,
} from './state.mjs';

const nowMs = Date.parse('2026-10-23T00:00:00Z');
const line = () => ({
  lineId: 'long',
  text: '甲乙丙丁',
  startMs: 1000,
  endMs: 16000,
  endInferred: true,
  estimatedStarts: {
    version: 1,
    segments: [
      { segmentId: 'a', text: '甲乙', startMs: 1000 },
      { segmentId: 'b', text: '丙丁', startMs: 3000 },
    ],
  },
  estimatedFineTiming: {
    version: 1,
    units: [
      { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 1200 },
      { unitId: 'b', from: 1, to: 2, startMs: 1300, endMs: 1600 },
      { unitId: 'c', from: 2, to: 3, startMs: 3000, endMs: 3500 },
      { unitId: 'd', from: 3, to: 4, startMs: 13000, endMs: 14800 },
    ],
  },
});
const unit = () => ({
  text: '甲乙丙丁',
  sourceStart: 0,
  sourceEnd: 4,
  timingSource: 'model-starts',
  startMs: 1000,
  endMs: 7000,
  segments: [
    { segmentId: 'a:p0', text: '甲乙', startMs: 1000, endMs: 3000 },
    { segmentId: 'b:p0', text: '丙丁', startMs: 3000, endMs: 7000 },
  ],
});
function snapshot(positionMs) {
  return {
    revision: 1,
    generatedAt: new Date(nowMs).toISOString(),
    playback: {
      status: 'playing',
      track: { id: 'song' },
      positionMs,
      durationMs: 40000,
      rate: 1,
    },
    lyrics: {
      trackId: 'song',
      synced: true,
      offsetMs: 0,
      source: { language: 'zh' },
      lines: [
        line(),
        ...[16000, 20000, 24000, 28000, 32000].map((startMs, i) => ({
          lineId: `next-${i}`,
          text: '下一句歌詞',
          startMs,
          endMs: startMs + 4000,
          endInferred: true,
        })),
      ],
    },
  };
}
const options = { templateId: 'karaoke-stack', nowMs };

describe('KTV pending evidence protects presentation handoff only', () => {
  it('keeps the old effective line through pending fine despite next pre-roll', () => {
    const value = snapshot(12500),
      before = structuredClone(value);
    const frame = selectLyricsOverlayFrame(value, options);
    expect(frame.ktv.lineIndex).toBe(0);
    expect(frame.ktv.currentText).toBe('甲乙丙丁');
    expect(frame.ktv.currentFineTiming.units.at(-1)).toMatchObject({
      startMs: 13000,
      endMs: 14800,
      progress: 0,
    });
    // The original model-start projection end must not be rewritten as evidence.
    expect(frame.ktv.currentSourceRange.endMs).toBeLessThan(13000);
    expect(value).toEqual(before);
    value.playback.positionMs = 14000;
    expect(
      selectLyricsOverlayFrame(value, options).ktv.currentFineTiming.units.at(
        -1,
      ).progress,
    ).toBeCloseTo(1000 / 1800);
  });
  it('schedules protected completion, then pre-roll, and switches at the original next onset', () => {
    const value = snapshot(14500);
    expect(nextPresentationBoundaryDelayMs(value, options)).toBe(300);
    value.playback.positionMs = 14799;
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(0);
    value.playback.positionMs = 14800;
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(1);
    expect(selectLyricsOverlayFrame(value, options).ktv.lineProgress).toBe(0);
    value.playback.positionMs = 16000;
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(1);
    expect(selectLyricsOverlayFrame(value, options).lineIndex).toBe(1);
  });
  it('reads pause, seek and replay directly without adding a transport wait', () => {
    const value = snapshot(14000);
    value.playback.status = 'paused';
    expect(nextPresentationBoundaryDelayMs(value, options)).toBeNull();
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(0);
    value.playback.positionMs = 16000;
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(1);
    value.playback.positionMs = 12500;
    value.playback.status = 'playing';
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(0);
  });
  it('preserves unsupported T1 and native T2 presentation policies', () => {
    const value = snapshot(12500);
    delete value.lyrics.lines[0].estimatedStarts;
    delete value.lyrics.lines[0].estimatedFineTiming;
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(1);
    value.lyrics.lines[0].segments = [
      { segmentId: 'native', text: '甲乙丙丁', startMs: 1000, endMs: 14800 },
    ];
    expect(
      selectLyricsOverlayFrame(value, options).ktv.currentTimingSource,
    ).toBe('t2');
    expect(selectLyricsOverlayFrame(value, options).ktv.lineIndex).toBe(0);
  });
  it('protects fine and usable display-estimated completion without mutating units', () => {
    const l = line(),
      u = unit(),
      before = structuredClone({ l, u });
    expect(ktvHandoffEndMs(l, u, 16000, 16000)).toBe(14800);
    const incomplete = line();
    incomplete.estimatedFineTiming.units.pop();
    expect(ktvHandoffEndMs(incomplete, u, 16000, 16000)).toBe(7000);
    expect(
      ktvHandoffEndMs(incomplete, { ...u, endMs: 3600 }, 16000, 16000),
    ).toBe(3800);
    expect(u).toEqual(before.u);
    expect(l).toEqual(before.l);
  });
  it('does not use the whole line end to extend each phrase', () => {
    const u = {
      ...unit(),
      text: '甲乙',
      sourceEnd: 2,
      endMs: 2000,
      segments: unit().segments.slice(0, 1),
    };
    expect(ktvHandoffEndMs(line(), u, 16000, 3000)).toBe(2000);
  });
  it('declines range crossings, invalid evidence and conflicting next-onset protection', () => {
    const l = line(),
      u = unit();
    l.estimatedFineTiming.units = [
      { unitId: 'cross', from: 1, to: 3, startMs: 2000, endMs: 14500 },
    ];
    expect(ktvHandoffEndMs(l, u, 16000, 16000)).toBe(7000);
    expect(ktvHandoffEndMs(line(), u, 14000, 16000)).toBe(7000);
    expect(ktvHandoffEndMs(line(), u, 16000, 14000)).toBe(7000);
    expect(ktvHandoffEndMs(line(), { ...u, text: 'wrong' }, 16000, 16000)).toBe(
      7000,
    );
    const invalid = line();
    invalid.estimatedFineTiming.version = 99;
    expect(ktvHandoffEndMs(invalid, u, 16000, 16000)).toBe(7000);
  });
  it.each(['t2', 'line-estimate'])(
    'leaves %s units untouched',
    (timingSource) => {
      expect(
        ktvHandoffEndMs(line(), { ...unit(), timingSource }, 16000, 16000),
      ).toBe(7000);
    },
  );
});
