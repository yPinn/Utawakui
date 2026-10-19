import { expect, it } from 'vitest';
import { assessCompleteness } from './completeness.cjs';

const line = { text: '任憑無用的將我淹沒', startMs: 1000, endMs: 6000 };
const evidence = (text, boundary = true) => ({
  language: 'zh',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 10000,
  spans: [{ text, start: 2, boundary }],
});
it('warns on uniquely anchored internal extra singing without rejecting or retiming', () => {
  const e = evidence('任凭无用的勇敢将我淹没');
  const before = JSON.stringify({ line, e });
  const result = assessCompleteness(line, e);
  expect(result.insertionWarning).toBe(true);
  expect(result.insertionCharacters).toBe(2);
  expect(result.reject).toBe(false);
  expect(JSON.stringify({ line, e })).toBe(before);
});
it('does not treat neighboring text, ambiguous repeated text or weak ASR as a confirmed omission', () => {
  expect(
    assessCompleteness(line, evidence('任凭无用的将我淹没下一句'))
      .insertionWarning,
  ).toBe(false);
  expect(
    assessCompleteness({ ...line, text: '你好你好' }, evidence('你好你好你好'))
      .insertionWarning,
  ).toBe(false);
  expect(
    assessCompleteness(line, evidence('任凭无用的勇敢将我淹没', false))
      .insertionWarning,
  ).toBe(false);
  expect(
    assessCompleteness(line, evidence('无用勇敢将我')).insertionWarning,
  ).toBe(false);
});
it('keeps unsupported/missing evidence unknown and bounds clocks and size through the existing validator', () => {
  const r = assessCompleteness(line, { ...evidence(''), spans: [] });
  expect(r.insertionState).toBe('unknown');
  expect(
    assessCompleteness(line, evidence('任凭无用的勇敢将我淹没')).insertionState,
  ).toBe('possible-missing-text');
  expect(() =>
    assessCompleteness(line, {
      ...evidence('x'),
      spans: [{ text: 'x', start: 11 }],
    }),
  ).toThrow();
  expect(() => assessCompleteness(line, evidence('x'.repeat(32769)))).toThrow();
});
it('same-script control avoids Latin-only contradictions but retains substantial CJK mismatch', () => {
  const source = { ...line, text: '只因為你總說' };
  expect(
    assessCompleteness(
      source,
      evidence('everything will be fine'),
      'script-fold',
    ).reject,
  ).toBe(true);
  expect(
    assessCompleteness(
      source,
      evidence('everything will be fine'),
      'same-script',
    ).reject,
  ).toBe(false);
  expect(
    assessCompleteness(source, evidence('完全不同的歌詞'), 'same-script')
      .reject,
  ).toBe(true);
  expect(() =>
    assessCompleteness(source, evidence('x'), 'unbounded'),
  ).toThrow();
});
