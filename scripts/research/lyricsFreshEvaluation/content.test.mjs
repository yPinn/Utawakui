import { expect, it } from 'vitest';
import { checkContent } from './content.cjs';
const line = { text: '春天花開鳥飛', startMs: 1000, endMs: 6000 };
const evidence = (text, boundary = true) => ({
  language: 'zh',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 10000,
  spans: [{ text, start: 2, boundary }],
});
it('keeps a compatible phrase and exposes extra sung content as a warning, not a retime', () => {
  const r = checkContent(line, evidence('春天花開鳥飛還有後續'));
  expect(r.reject).toBe(false);
  expect(r.compatibility).toBe(1);
  expect(r.extraContentWarning).toBe(true);
});
it('rejects strong contradiction, but does not reject weak or missing ASR evidence', () => {
  expect(checkContent(line, evidence('完全不同語句')).reject).toBe(true);
  expect(checkContent(line, evidence('不同')).reject).toBe(false);
  expect(checkContent(line, evidence('完全不同語句', false)).reject).toBe(
    false,
  );
  expect(checkContent(line, { ...evidence(''), spans: [] }).reject).toBe(false);
});
it('uses maximum compatibility rather than ambiguous LCS uniqueness for repeated phrases', () => {
  expect(
    checkContent({ ...line, text: '你好你好' }, evidence('你好你好你好'))
      .reject,
  ).toBe(false);
});
it('normalizes Japanese kana for comparison only and bounds raw evidence', () => {
  expect(
    checkContent(
      { ...line, text: 'アイシテル' },
      { ...evidence('あいしてる'), language: 'ja' },
    ).compatibility,
  ).toBe(1);
  expect(() =>
    checkContent(line, { ...evidence('x'), spans: new Array(4097) }),
  ).toThrow();
  expect(() => checkContent(line, evidence('x'.repeat(32769)))).toThrow();
  expect(() =>
    checkContent(line, { ...evidence('x'), spans: [{ text: 'x', start: 11 }] }),
  ).toThrow();
});
it('does not use text clearly outside the line to invent a content contradiction', () => {
  expect(
    checkContent(line, {
      ...evidence('完全不同語句'),
      spans: [{ text: '完全不同語句', start: 9, boundary: true }],
    }).reject,
  ).toBe(false);
});
