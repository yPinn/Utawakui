import { describe, expect, it } from 'vitest';
import {
  projectLyricsDisplayFrame,
  lyricsDisplayBatchKey,
} from './lyricsDisplayFrame.mjs';
const line = { text: 'first second', startMs: 1000, endMs: 5000 };
const plan = {
  status: 'ready',
  sourceTiming: 'model-starts',
  pageTiming: 'model-starts',
  pages: [
    {
      text: 'first ',
      sourceStart: 0,
      sourceEnd: 6,
      startMs: 1000,
      endMs: 3000,
    },
    {
      text: 'second',
      sourceStart: 6,
      sourceEnd: 12,
      startMs: 3000,
      endMs: 5000,
    },
  ],
};
describe('capacity pages keep existing template projections', () => {
  it('clips role ranges independently for current and preview batches', () => {
    const source = {
      ...line,
      vocalParts: [
        { from: 0, to: 6, label: '男', role: 'male' },
        { from: 6, to: 12, label: '女', role: 'female' },
      ],
    };
    const base = {
      visible: true,
      lineIndex: 0,
      currentText: source.text,
      currentRole: 'male',
      nextRole: 'group',
    };
    const frame = projectLyricsDisplayFrame({ ktv: base }, source, plan, 1000, {
      templateId: 'karaoke-stack',
    }).ktv;
    expect(frame.currentVocalParts).toEqual([
      { from: 0, to: 6, label: '男', role: 'male' },
    ]);
    expect(frame.nextVocalParts).toEqual([
      { from: 0, to: 6, label: '女', role: 'female' },
    ]);
    expect(frame.currentRole).toBe('male');
    expect(frame.nextRole).toBe('female');
    expect(source.vocalParts[1].from).toBe(6);
  });

  it('gives identical text in different source ranges distinct batch identity and fresh progress', () => {
    const source = {
      text: 'OH OH ',
      lineId: 'source-line',
      startMs: 1000,
      endMs: 5000,
    };
    const repeated = {
      status: 'ready',
      sourceTiming: 'line-estimate',
      pageTiming: 'layout-estimate',
      pages: [
        {
          text: 'OH ',
          sourceStart: 0,
          sourceEnd: 3,
          startMs: 1000,
          endMs: 3000,
        },
        {
          text: 'OH ',
          sourceStart: 3,
          sourceEnd: 6,
          startMs: 3000,
          endMs: 5000,
        },
      ],
    };
    const frame = {
      visible: true,
      lineIndex: 0,
      lineProgress: 0.8,
      lineRemainingMs: 100,
      currentText: source.text,
    };
    const a = projectLyricsDisplayFrame(frame, source, repeated, 1000, {
      rate: 1,
    });
    const b = projectLyricsDisplayFrame(frame, source, repeated, 3000, {
      rate: 1,
      playing: true,
    });
    expect(a.currentText).toBe(b.currentText);
    expect(lyricsDisplayBatchKey(a)).not.toBe(lyricsDisplayBatchKey(b));
    expect(a.lineProgress).toBe(0);
    expect(b.lineProgress).toBe(0);
    expect(b.lineRemainingMs).toBe(2000);
    const tick = projectLyricsDisplayFrame(frame, source, repeated, 3500, {
      rate: 1,
    });
    expect(lyricsDisplayBatchKey(tick)).toBe(lyricsDisplayBatchKey(b));
    expect(tick.lineProgress).toBe(0.25);
    expect(source).toEqual({
      text: 'OH OH ',
      lineId: 'source-line',
      startMs: 1000,
      endMs: 5000,
    });
    expect(
      projectLyricsDisplayFrame(frame, source, repeated, 3500, {
        playing: false,
      }).lineRemainingMs,
    ).toBeNull();
  });

  it('previews the next KTV batch, alternates lanes and preserves canonical indices and fine intervals', () => {
    const base = {
      lineIndex: 4,
      currentVisibleLineIndex: 3,
      currentLaneIndex: 7,
      currentText: line.text,
      currentRole: 'duet',
      nextText: 'next source',
      nextRole: 'a',
      nextVisibleLineIndex: 4,
      currentFineTiming: {
        units: [{ unitId: 'u', from: 6, to: 12, startMs: 3200, endMs: 4800 }],
      },
    };
    const first = projectLyricsDisplayFrame({ ktv: base }, line, plan, 1500, {
      templateId: 'karaoke-stack',
    }).ktv;
    expect(first.currentLaneIndex).toBe(7);
    expect(first.nextLaneIndex).toBe(8);
    expect(first.nextText).toBe('second');
    expect(first.nextRole).toBe('duet');
    expect(first.nextFineTiming.units).toEqual([
      { unitId: 'u', from: 0, to: 6, startMs: 3200, endMs: 4800 },
    ]);
    const second = projectLyricsDisplayFrame({ ktv: base }, line, plan, 3500, {
      templateId: 'karaoke-stack',
    }).ktv;
    expect(second.currentLaneIndex).toBe(8);
    expect(second.nextText).toBe('next source');
    expect(second.nextDisplayBatchId).toBeUndefined();
    expect(second.lineIndex).toBe(4);
    expect(second.currentVisibleLineIndex).toBe(3);
    expect(second.currentFineTiming.units).toEqual(first.nextFineTiming.units);
  });

  it('keeps only complete fine units within a KTV page and clears the other lane', () => {
    const base = {
      currentText: line.text,
      currentTimingSource: 'model-starts',
      currentFineTiming: {
        units: [
          { unitId: 'cross', from: 5, to: 8, startMs: 1000, endMs: 4000 },
          { unitId: 'last', from: 8, to: 12, startMs: 4000, endMs: 5000 },
        ],
      },
      nextFineTiming: { units: [{ unitId: 'other' }] },
    };
    const result = projectLyricsDisplayFrame({ ktv: base }, line, plan, 4500, {
      templateId: 'karaoke-stack',
    }).ktv;
    expect(result.currentFineTiming.units).toEqual([
      { unitId: 'last', from: 2, to: 6, startMs: 4000, endMs: 5000 },
    ]);
    expect(result.nextFineTiming).toBeUndefined();
    expect(result.nextText).toBe('');
  });
  it.each([
    'focus-line',
    'karaoke-stack',
    'manga-frame',
    'kinetic-pop',
    'ornate-vertical',
    'live-stage',
  ])('projects %s without changing the input frame', (templateId) => {
    const base = {
      currentText: line.text,
      nextText: 'next',
      currentTimingSource: 'model-starts',
      currentSegments: [
        { text: 'first ', state: 'past', progress: 1 },
        { text: 'second', state: 'active', progress: null },
      ],
      kineticPop: {},
      lineIndex: 0,
    };
    const frame = { ...base, ktv: { ...base } },
      before = structuredClone(frame);
    const result = projectLyricsDisplayFrame(frame, line, plan, 3500, {
      templateId,
    });
    const current = templateId === 'karaoke-stack' ? result.ktv : result;
    expect(current.currentText).toBe('second');
    expect(current.currentSegments).toEqual([
      { text: 'second', state: 'active', progress: null },
    ]);
    expect(current.displayFit.pageTiming).toBe('model-starts');
    if (templateId === 'kinetic-pop')
      expect(current.kineticPop.displayText).toBe('second');
    if (templateId === 'live-stage')
      expect(current.liveStageDisplayLines).toEqual(['second']);
    if (templateId === 'ornate-vertical')
      expect(current.ornateVertical.segments).toHaveLength(1);
    expect(frame).toEqual(before);
  });
});
