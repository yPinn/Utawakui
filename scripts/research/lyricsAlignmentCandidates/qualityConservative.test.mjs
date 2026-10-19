import { expect, it } from 'vitest';
import {
  assessConservative,
  conservativeRules,
} from './qualityConservative.cjs';
it('treats compatible but ambiguous repeated lyrics as unknown instead of contradiction', () => {
  const e = evidence();
  e.probabilities.fill(0.9);
  e.asrSpans = [{ text: '春天春天春天', start: 1, end: 1, boundary: true }];
  const r = assessConservative(
    { ...line, text: '春天春天' },
    new Map([
      [0, 1000],
      [2, 2500],
    ]),
    e,
    e,
    'dual-contradiction',
  );
  expect(r.contentState).toBe('unknown');
  expect(r.rejectedContent).toBe(false);
  expect(r.starts.size).toBe(2);
});
const line = { lineId: 'l', text: '春天花開鳥飛', startMs: 1000, endMs: 5000 },
  starts = new Map([
    [0, 1000],
    [2, 2500],
    [4, 4000],
  ]);
const evidence = () => ({
  language: 'zh',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 6000,
  probabilities: Array(188).fill(0),
  asrSpans: [],
});
it('keeps unknown activity/content as unknown, never as a correctness claim', () => {
  const r = assessConservative(
    line,
    starts,
    evidence(),
    evidence(),
    'dual-contradiction',
  );
  expect([...r.starts]).toEqual([...starts]);
  expect(r.activityWarning).toBe(true);
  expect(r.contentState).toBe('unknown');
});
it('rejects sufficiently transcribed contradictory content, not empty ASR', () => {
  const a = evidence(),
    b = evidence();
  a.asrSpans = b.asrSpans = [
    { text: '海洋沙漠遠方', start: 1, end: 1, boundary: true },
  ];
  expect(
    assessConservative(line, starts, a, b, 'dual-contradiction').starts.size,
  ).toBe(0);
  expect(
    assessConservative(line, starts, a, evidence(), 'dual-contradiction').starts
      .size,
  ).toBe(3);
  expect(assessConservative(line, starts, a, b, 'advisory').starts.size).toBe(
    3,
  );
});
it('rejects a cut only on complete-word, corroborated large time disagreement', () => {
  const a = evidence(),
    b = evidence();
  a.asrSpans = [
    { text: '春天', start: 1, end: 1, boundary: true },
    { text: '花開', start: 1.3, end: 1.3, boundary: true },
    { text: '鳥飛', start: 4, end: 4, boundary: true },
  ];
  b.asrSpans = a.asrSpans.map((s) => ({
    ...s,
    start: s.start + 0.1,
    end: s.end + 0.1,
  }));
  const r = assessConservative(line, starts, a, b, 'dual-contradiction');
  expect(r.starts.has(2)).toBe(false);
  expect(r.starts.get(4)).toBe(4000);
  expect(r.starts.get(0)).toBe(1000);
  b.asrSpans[1].start = 2.4;
  b.asrSpans[1].end = 2.4;
  expect(
    assessConservative(line, starts, a, b, 'dual-contradiction').starts.has(2),
  ).toBe(true);
});
it('does not use an unmatched word suffix or untimed repeats as agreement', () => {
  const a = evidence();
  a.asrSpans = [
    { text: '春天花', start: 1, end: 1, boundary: true },
    { text: '鳥飛', start: 4, end: 4, boundary: true },
  ];
  const r = assessConservative(line, starts, a, a, 'dual-contradiction');
  expect(r.starts.has(2)).toBe(true);
  expect(() => assessConservative(line, starts, a, a, 'bad')).toThrow(
    'profile',
  );
  expect(conservativeRules).toMatchObject({
    maxContradictionCoverage: 0.2,
    minAsrCharacters: 4,
    minStrongCoverage: 0.8,
    asrAgreementMs: 300,
    minTimeDisagreementMs: 1000,
  });
});
