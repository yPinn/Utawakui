import { expect, it } from 'vitest';
import { assessLine, qualityRules } from './quality.cjs';
it('keeps untimed repeated text in the ambiguity graph without counting it as support', () => {
  const e = evidence();
  e.asrSpans = [
    { text: '海', start: 1, end: 1, boundary: true },
    { text: '春', start: 1, end: 1, boundary: false },
    { text: '春', start: 2, end: 2, boundary: true },
  ];
  const r = assessLine(
    { ...line, text: '海春', endMs: 4000 },
    new Map([
      [0, 1000],
      [1, 2000],
    ]),
    e,
    'combined-time',
  );
  expect(r.starts.has(1)).toBe(false);
  expect(r.contentCoverage).toBe(0.5);
});
const line = { lineId: 'l', text: '春天花開鳥飛', startMs: 1000, endMs: 5000 };
const starts = new Map([
  [0, 1000],
  [2, 2500],
  [4, 4000],
]);
const evidence = () => ({
  language: 'zh',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 6000,
  probabilities: Array(Math.ceil(6000 / 32)).fill(0.9),
  asrSpans: [
    { text: '春天', start: 1, end: 1, boundary: true },
    { text: '花開', start: 2.5, end: 2.5, boundary: true },
    { text: '鳥飛', start: 4, end: 4, boundary: true },
  ],
});
it('preserves supported original boundaries without retiming or rewriting text', () => {
  const r = assessLine(line, starts, evidence(), 'combined-time');
  expect([...r.starts]).toEqual([...starts]);
  expect(r.contentCoverage).toBe(1);
  expect(r.activeRatio).toBeCloseTo(1);
  expect(line.text).toBe('春天花開鳥飛');
});
it('rejects wrong content independently of loud voiced activity', () => {
  const e = evidence();
  e.asrSpans = [{ text: '海洋沙漠遠方', start: 1, end: 1, boundary: true }];
  expect(assessLine(line, starts, e, 'activity').starts.size).toBe(3);
  expect(assessLine(line, starts, e, 'content').starts.size).toBe(0);
});
it('rejects unsupported speech frames and cuts, while keeping baseline unchanged', () => {
  const e = evidence();
  e.probabilities.fill(0);
  expect(assessLine(line, starts, e, 'activity').starts.size).toBe(0);
  expect(assessLine(line, starts, e, 'baseline').starts.size).toBe(3);
  const good = evidence();
  for (let i = 65; i < 95; i++) good.probabilities[i] = 0;
  expect(assessLine(line, starts, good, 'activity').starts.has(2)).toBe(false);
  expect(assessLine(line, starts, good, 'activity').starts.has(4)).toBe(true);
});
it('requires positive independent clock support, not a clamp or DTW fallback', () => {
  const e = evidence();
  e.asrSpans[1].start = 3.3;
  e.asrSpans[1].end = 3.3;
  const r = assessLine(line, starts, e, 'combined-time');
  expect(r.starts.has(2)).toBe(false);
  expect(r.starts.get(4)).toBe(4000);
  e.asrSpans[1].boundary = false;
  expect(assessLine(line, starts, e, 'content').contentCoverage).toBeLessThan(
    1,
  );
});
it('uses the lyric offset exactly once and preserves separate occurrences', () => {
  const e = evidence();
  e.offsetMs = 100;
  e.windowStartMs = 500;
  const shifted = { ...line, startMs: 1600, endMs: 5600 };
  const m = new Map([...starts].map(([k, v]) => [k, v + 600]));
  expect([...assessLine(shifted, m, e, 'combined-time').starts]).toEqual([
    ...m,
  ]);
  const other = { ...line, lineId: 'other', startMs: 4500, endMs: 5500 };
  expect(
    assessLine(
      other,
      new Map([
        [0, 4500],
        [2, 4800],
        [4, 5200],
      ]),
      e,
      'content',
    ).starts.size,
  ).toBe(0);
});
it('declines ambiguous repeats and supports kana normalization only for comparison', () => {
  const e = evidence();
  e.language = 'ja';
  e.asrSpans = [{ text: 'ハナハナ', start: 1, end: 1, boundary: true }];
  expect(
    assessLine({ ...line, text: 'はな' }, new Map([[0, 1000]]), e, 'content')
      .contentCoverage,
  ).toBe(0);
  e.asrSpans = [{ text: 'ハナ', start: 1, end: 1, boundary: true }];
  expect(
    assessLine({ ...line, text: 'はな' }, new Map([[0, 1000]]), e, 'content')
      .contentCoverage,
  ).toBe(1);
});
it('fails closed on malformed or oversized evidence and unknown profile', () => {
  const e = evidence();
  e.probabilities[0] = NaN;
  expect(() => assessLine(line, starts, e, 'combined')).toThrow('evidence');
  const b = evidence();
  b.probabilities.pop();
  expect(() => assessLine(line, starts, b, 'combined')).toThrow('evidence');
  expect(() => assessLine(line, starts, evidence(), 'unknown')).toThrow(
    'profile',
  );
  const t = evidence();
  t.asrSpans[0].text = 'x'.repeat(40000);
  expect(() => assessLine(line, starts, t, 'content')).toThrow('budget');
  expect(qualityRules).toMatchObject({
    speechThreshold: 0.5,
    minActiveRatio: 0.1,
    minContentCoverage: 0.5,
    clockToleranceMs: 600,
  });
});
it('keeps the decoded 16k sample clock without rounding partial milliseconds', () => {
  const e = evidence();
  e.durationMs = 5999.9375;
  expect(assessLine(line, starts, e, 'activity').starts.size).toBe(3);
  e.durationMs = 5999.93;
  expect(() => assessLine(line, starts, e, 'activity')).toThrow('evidence');
});
