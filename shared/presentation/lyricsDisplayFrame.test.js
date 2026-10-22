import { describe, expect, it } from 'vitest';
import { projectLyricsDisplayFrame } from './lyricsDisplayFrame.mjs';
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
    expect(frame).toEqual(before);
  });
});
