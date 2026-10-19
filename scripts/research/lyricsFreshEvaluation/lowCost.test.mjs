import { expect, it } from 'vitest';
import { checkLowCost, splitTimedSpan, timingChunks } from './lowCost.cjs';
const evidence = {
  language: 'zh',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 30000,
  spans: [
    { text: '你曾说everything will be fine', start: 27.03, boundary: true },
  ],
};
it('folds Chinese only for content comparison and preserves original text', () => {
  const line = { text: '只因為你總說', startMs: 26770, endMs: 29130 },
    copy = JSON.stringify(line);
  expect(checkLowCost(line, evidence, 'baseline').reject).toBe(true);
  expect(checkLowCost(line, evidence, 'script-fold').reject).toBe(false);
  expect(JSON.stringify(line)).toBe(copy);
});
it('rescues a strong nearby phrase without treating it as retimed or confirmed', () => {
  const line = { text: '只因為你總說', startMs: 26770, endMs: 29130 },
    e = {
      ...evidence,
      spans: [
        { text: '只因为你总说', start: 25.48, boundary: true },
        { text: '完全不同文字', start: 28, boundary: true },
      ],
    };
  const r = checkLowCost(line, e, 'neighbor-rescue');
  expect(r.reject).toBe(false);
  expect(r.rescuedByNeighbor).toBe(true);
  expect(r.state).toBe('unknown');
});
it('retains a clear contradiction, keeps missing evidence unknown and bounds neighbor rescue', () => {
  const line = { text: '春天花開鳥飛', startMs: 10000, endMs: 13000 };
  expect(
    checkLowCost(
      line,
      {
        ...evidence,
        spans: [{ text: '完全不同文字', start: 11, boundary: true }],
      },
      'neighbor-rescue',
    ).reject,
  ).toBe(true);
  expect(
    checkLowCost(line, { ...evidence, spans: [] }, 'neighbor-rescue').reject,
  ).toBe(false);
  expect(() => checkLowCost(line, evidence, 'unbounded')).toThrow();
});
it('does not compound the neighbor radius with baseline padding or use untimed text as positive rescue', () => {
  const line = { text: '春天花開鳥飛', startMs: 10000, endMs: 13000 },
    spans = [
      { text: line.text, start: 8.1, boundary: true },
      { text: '完全不同文字', start: 11, boundary: true },
    ];
  expect(
    checkLowCost(line, { ...evidence, spans }, 'neighbor-rescue').reject,
  ).toBe(true);
  const r = checkLowCost(
    line,
    { ...evidence, spans: [{ ...spans[0], boundary: false }, spans[1]] },
    'neighbor-rescue',
  );
  expect(r.rescuedByNeighbor).toBe(false);
  expect(r.state).toBe('unknown');
});
it('splits only available model span duration into original grapheme starts without splitting supplementary characters', () => {
  const spans = splitTimedSpan({ text: '愛𠮷の', start: 1, end: 1.6 });
  expect(spans.map((s) => s.text)).toEqual(['愛', '𠮷', 'の']);
  expect(spans[0].start).toBe(1);
  expect(spans[1].start).toBeCloseTo(1.2);
  expect(spans[2].start).toBeCloseTo(1.4);
  expect(splitTimedSpan({ text: '東京', start: 1, end: 1 })).toEqual([
    { text: '東京', start: 1, end: 1 },
  ]);
  expect(() => splitTimedSpan({ text: 'x', start: 2, end: 1 })).toThrow();
});
it('recovers an internal textual cut only as interpolation and rejects mismatched raw text or window', () => {
  const line = {
      lineId: 'line-a',
      text: '春天花開',
      startMs: 1000,
      endMs: 5000,
    },
    canonical = { lines: [line] },
    captured = [
      {
        request: {
          prefix: 'w0',
          text: line.text,
          language: 'zh',
          durationSeconds: 6,
        },
        spans: [{ text: line.text, start: 1, end: 5 }],
      },
    ],
    recorded = [{ index: 0, startMs: 0, endMs: 6000, lineIds: ['line-a'] }];
  const result = timingChunks(
    canonical,
    'zh',
    captured,
    recorded,
    'span-interpolation',
    [new Map()],
    recorded,
  );
  expect(result[0].map((c) => c.startMs)).toEqual([1000, 3000]);
  const fallback = timingChunks(
    canonical,
    'zh',
    captured,
    recorded,
    'disagreement-fallback',
    [
      new Map([
        [0, 1000],
        [2, 1800.25],
      ]),
    ],
    recorded,
  );
  expect(fallback[0].map((c) => c.startMs)).toEqual([1000, 1800]);
  expect(() =>
    timingChunks(
      canonical,
      'zh',
      [{ ...captured[0], request: { ...captured[0].request, text: '不同' } }],
      recorded,
      'span-interpolation',
      [],
      recorded,
    ),
  ).toThrow('context');
  expect(() =>
    timingChunks(canonical, 'zh', captured, [], 'span-interpolation', []),
  ).toThrow();
});
