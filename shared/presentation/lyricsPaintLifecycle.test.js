import { describe, expect, it } from 'vitest';
import {
  prepareLocalLyricsPaintFrame,
  prepareLyricsPaintFrame,
  projectLyricsPaintLifecycle,
} from './lyricsFineFrame.mjs';
import {
  selectLyricsOverlayFrame,
  nextLyricsBoundaryDelayMs,
  nextPresentationBoundaryDelayMs,
} from './state.mjs';

const line = () => ({
  lineId: 'tail',
  text: '甲乙丙丁',
  startMs: 1000,
  endMs: 15000,
  endInferred: true,
  estimatedStarts: {
    version: 1,
    segments: [
      { segmentId: 'a', text: '甲乙', startMs: 1000 },
      { segmentId: 'b', text: '丙丁', startMs: 2000 },
    ],
  },
  estimatedFineTiming: {
    version: 1,
    units: [
      { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 1300 },
      { unitId: 'b', from: 1, to: 2, startMs: 1400, endMs: 1800 },
      { unitId: 'c', from: 2, to: 3, startMs: 2000, endMs: 2500 },
    ],
  },
});
const snapshot = (l, positionMs) => ({
  generatedAt: '2026-10-22T00:00:00Z',
  revision: 1,
  playback: {
    track: { id: 's' },
    status: 'playing',
    positionMs,
    sampledAt: '2026-10-22T00:00:00Z',
    playbackRate: 1,
  },
  lyrics: {
    synced: true,
    trackId: 's',
    offsetMs: 0,
    lines: [
      l,
      { lineId: 'next', text: '下一句', startMs: 15000, endMs: 18000 },
    ],
  },
});

describe('paint completion and source hold are separate', () => {
  it('keeps KTV completion boundaries bounded for 500 phrases in one legal line', () => {
    const chunks = Array.from({ length: 500 }, (_, i) => ({
      segmentId: `s${i}`,
      text: '甲，',
      startMs: 1000 + i * 100,
    }));
    const l = {
      lineId: 'capacity',
      text: chunks.map((c) => c.text).join(''),
      startMs: 1000,
      endMs: 52000,
      estimatedStarts: { version: 1, segments: chunks },
      estimatedFineTiming: {
        version: 1,
        units: chunks.map((c, i) => ({
          unitId: `u${i}`,
          from: i * 2,
          to: i * 2 + 2,
          startMs: c.startMs,
          endMs: c.startMs + 80,
        })),
      },
    };
    const s = snapshot(l, 1000);
    s.lyrics.lines = [l];
    expect(
      nextPresentationBoundaryDelayMs(s, {
        templateId: 'karaoke-stack',
        nowMs: Date.parse(s.generatedAt),
      }),
    ).toBe(80);
  });
  it('caps only an inferred missing tail using local cadence without changing evidence', () => {
    const l = line(),
      before = structuredClone(l);
    const plan = prepareLyricsPaintFrame(l);
    expect(plan.units.at(-1)).toMatchObject({
      from: 3,
      to: 4,
      startMs: 2500,
      endMs: 2900,
      timingSource: 'display-estimate',
    });
    expect(plan.paintEndMs).toBe(2900);
    expect(plan.holdUntilMs).toBe(15000);
    expect(plan.cueEnds).toEqual([1800, 2900]);
    expect(plan.quality).toContain('tail-capped');
    expect(l).toEqual(before);
    expect(prepareLyricsPaintFrame(l)).toBe(plan);
  });
  it('holds full text after completion, keeps pauses and seeks directly', () => {
    const l = line();
    expect(projectLyricsPaintLifecycle(l, 900).phase).toBe('upcoming');
    expect(projectLyricsPaintLifecycle(l, 1350).phase).toBe('painting');
    expect(projectLyricsPaintLifecycle(l, 3000)).toMatchObject({
      phase: 'holding',
      paintEndMs: 2900,
      holdUntilMs: 15000,
    });
    expect(projectLyricsPaintLifecycle(l, 15000).phase).toBe('past');
    expect(projectLyricsPaintLifecycle(l, 1200).phase).toBe('painting');
    expect(prepareLyricsPaintFrame(l).units.slice(0, 3)).toEqual(
      l.estimatedFineTiming.units,
    );
    expect(projectLyricsPaintLifecycle(l, NaN)).toBeNull();
  });
  it('keeps an unbounded or unsupported missing tail unknown instead of stretching or forcing completion', () => {
    const l = line();
    l.estimatedFineTiming.units = [l.estimatedFineTiming.units[0]];
    l.estimatedStarts.segments = [
      { segmentId: 'one', text: l.text, startMs: 1000 },
    ];
    const plan = prepareLyricsPaintFrame(l);
    expect(plan.units).toEqual(l.estimatedFineTiming.units);
    expect(plan.paintEndMs).toBeNull();
    expect(plan.quality).toContain('tail-unknown');
    expect(projectLyricsPaintLifecycle(l, 10000).phase).toBe('unknown');
    expect(
      prepareLocalLyricsPaintFrame({
        ...l,
        endMs: null,
        estimatedFineTiming: undefined,
      }),
    ).toBeNull();
  });
  it('uses coarse local intervals for starts-only tails and leaves Output starts-only alone', () => {
    const l = {
      ...line(),
      text: '甲乙丙',
      estimatedFineTiming: undefined,
      estimatedStarts: {
        version: 1,
        segments: [
          { text: '甲', startMs: 1000 },
          { text: '乙', startMs: 1500 },
          { text: '丙', startMs: 2000 },
        ],
      },
    };
    expect(prepareLocalLyricsPaintFrame(l).units.at(-1)).toMatchObject({
      startMs: 2000,
      endMs: 2500,
    });
    expect(prepareLyricsPaintFrame(l)).toBeNull();
    expect(projectLyricsPaintLifecycle(l, 2600, { local: true }).phase).toBe(
      'holding',
    );
    expect(projectLyricsPaintLifecycle(l, 2600)).toBeNull();
  });
  it('supplements uncovered text around a crossing fine unit without cutting the unit', () => {
    const l = line();
    l.estimatedFineTiming.units = [
      { unitId: 'cross', from: 1, to: 3, startMs: 1500, endMs: 2500 },
    ];
    // An explicit authored bound retains its existing display estimate policy.
    l.endInferred = false;
    const plan = prepareLyricsPaintFrame(l);
    expect(plan.units).toMatchObject([
      {
        from: 0,
        to: 1,
        startMs: 1000,
        endMs: 1500,
        timingSource: 'display-estimate',
      },
      l.estimatedFineTiming.units[0],
      {
        from: 3,
        to: 4,
        startMs: 2500,
        endMs: 15000,
        timingSource: 'display-estimate',
      },
    ]);
    expect(plan.cueEnds[0]).toBeNull();
  });
  it('does not retime short, long or separated model units to hide suspicious timing', () => {
    const l = line();
    l.estimatedFineTiming.units = [
      { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 1019 },
      { unitId: 'b', from: 1, to: 3, startMs: 1100, endMs: 5000 },
      { unitId: 'd', from: 3, to: 4, startMs: 10000, endMs: 14000 },
    ];
    const plan = prepareLyricsPaintFrame(l);
    expect(plan.units).toEqual(l.estimatedFineTiming.units);
    expect(plan.quality).toEqual(
      expect.arrayContaining(['short-unit', 'long-unit', 'timing-gap']),
    );
    expect(plan.paintEndMs).toBe(14000);
  });
  it.each(['focus-line', 'karaoke-stack'])(
    'stops the completed cue without changing the %s source switch',
    (templateId) => {
      const l = line(),
        s = snapshot(l, 3000),
        options = { templateId, nowMs: Date.parse(s.generatedAt) };
      const root = selectLyricsOverlayFrame(s, options),
        frame = templateId === 'karaoke-stack' ? root.ktv : root;
      expect(frame.currentText).toBe(l.text);
      expect(frame.currentSegments.every((c) => c.state === 'past')).toBe(true);
      s.playback.positionMs = 14999;
      const held = selectLyricsOverlayFrame(s, options);
      // KTV retains its existing next-lane pre-roll; canonical ownership stays.
      expect(held.currentText).toBe(l.text);
      s.playback.positionMs = 15000;
      expect(selectLyricsOverlayFrame(s, options).lineIndex).toBe(1);
    },
  );
  it('schedules completion from the media clock without delaying the next onset', () => {
    const s = snapshot(line(), 2500),
      options = { templateId: 'focus-line', nowMs: Date.parse(s.generatedAt) };
    expect(nextLyricsBoundaryDelayMs(s, options)).toBe(400);
    s.playback.positionMs = 3000;
    expect(nextLyricsBoundaryDelayMs(s, options)).toBe(12000);
  });

  it.each([
    { tail: '丁戊', budget: 90 },
    { tail: '丁戊', budget: 21 },
    { tail: '丁', budget: 61 },
    { tail: '丁戊', budget: 121 },
  ])(
    'keeps a $budget ms missing tail static instead of compressing a new sweep',
    ({ tail, budget }) => {
      const l = line();
      l.text = '甲乙丙' + tail;
      l.estimatedStarts.segments[1].text = '丙' + tail;
      l.endMs = 2500 + budget;
      const before = structuredClone(l),
        plan = prepareLyricsPaintFrame(l);
      expect(plan.units).toEqual(l.estimatedFineTiming.units);
      expect(plan.cueEnds).toEqual([1800, null]);
      expect(plan.paintEndMs).toBeNull();
      expect(plan.quality).toEqual(
        expect.arrayContaining(['tail-too-fast', 'tail-unknown']),
      );
      expect(projectLyricsPaintLifecycle(l, l.endMs - 1).phase).toBe('unknown');
      expect(l).toEqual(before);
      const value = snapshot(l, l.endMs - 1);
      value.lyrics.lines[1].startMs = l.endMs;
      const frame = selectLyricsOverlayFrame(value, {
        nowMs: Date.parse(value.generatedAt),
        templateId: 'focus-line',
      });
      expect(frame.currentText).toBe(l.text);
      expect(frame.currentFineTiming.units).toHaveLength(3);
      value.playback.positionMs = l.endMs;
      expect(
        selectLyricsOverlayFrame(value, {
          nowMs: Date.parse(value.generatedAt),
          templateId: 'focus-line',
        }).lineIndex,
      ).toBe(1);
    },
  );
  it.each([79, 80])(
    'uses the existing 80 ms visible-grapheme floor at %s ms',
    (budget) => {
      const l = line();
      l.endMs = 2500 + budget;
      const plan = prepareLyricsPaintFrame(l);
      expect(
        plan.units.filter((u) => u.timingSource === 'display-estimate'),
      ).toHaveLength(budget === 80 ? 1 : 0);
      expect(plan.paintEndMs).toBe(budget === 80 ? 2580 : null);
    },
  );
  it('handles trailing whitespace and punctuation without counting them as sung weight', () => {
    const l = line();
    l.text += '? \t';
    l.estimatedStarts.segments[1].text += '? \t';
    l.endMs = 2579;
    const plan = prepareLyricsPaintFrame(l);
    expect(plan.units).toEqual(l.estimatedFineTiming.units);
    expect(plan.quality).toContain('tail-too-fast');
    expect(l.text).toBe('甲乙丙丁? \t');
    const punctuation = line();
    punctuation.text = '甲乙丙?';
    punctuation.estimatedStarts.segments[1].text = '丙?';
    punctuation.endMs = 2579;
    const punctuationPlan = prepareLyricsPaintFrame(punctuation);
    expect(punctuationPlan.units).toEqual(
      punctuation.estimatedFineTiming.units,
    );
    expect(punctuationPlan.quality).not.toContain('tail-too-fast');
    expect(punctuationPlan.paintEndMs).toBeNull();
  });
  it('does not apply the display floor to actual 19 ms or 9.338 s fine, or fill their known pause', () => {
    const l = line();
    l.estimatedFineTiming.units = [
      { unitId: 'a', from: 0, to: 1, startMs: 1000, endMs: 1019 },
      { unitId: 'b', from: 1, to: 2, startMs: 1300, endMs: 1600 },
      { unitId: 'c', from: 2, to: 3, startMs: 2000, endMs: 2500 },
      { unitId: 'd', from: 3, to: 4, startMs: 5000, endMs: 14338 },
    ];
    const before = structuredClone(l),
      plan = prepareLyricsPaintFrame(l);
    expect(plan.units).toEqual(l.estimatedFineTiming.units);
    expect(plan.quality).not.toContain('tail-too-fast');
    expect(plan.cueEnds).toEqual([1600, 14338]);
    expect(l).toEqual(before);
  });
});
