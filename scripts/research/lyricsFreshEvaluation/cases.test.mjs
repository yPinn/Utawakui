import { expect, it } from 'vitest';
import { omitInteriorWord, replaceInterval, outerVtt } from './cases.cjs';
it('omits one interior word with reversible original UTF16 offsets, preserving all other text', () => {
  const r = omitInteriorWord('春天 花開 鳥飛', 'zh');
  expect(r.text).toBe('春天 鳥飛');
  expect(r.removed).toEqual({ from: 3, to: 6 });
  expect(r.mapFrom(6)).toBe(3);
  expect(r.mapFrom(4)).toBe(null);
  expect(r.mapFrom(0)).toBe(0);
});
it('does not split supplementary characters or invent enough words', () => {
  expect(() => omitInteriorWord('春', 'zh')).toThrow('words');
  const r = omitInteriorWord('春天 鳥飛 天空', 'zh');
  expect(r.text).toBe('春天 天空');
});
it('makes a known silent interval and preserves sample count and outside audio', () => {
  const input = Buffer.from(new Float32Array(16000).fill(0.25).buffer),
    r = replaceInterval(input, 200, 700, null);
  expect(r.length).toBe(input.length);
  expect(r.readFloatLE(4 * 3199)).toBe(0.25);
  expect(r.readFloatLE(4 * 3200)).toBe(0);
  expect(r.readFloatLE(4 * 11199)).toBe(0);
  expect(r.readFloatLE(4 * 11200)).toBe(0.25);
  expect(input.readFloatLE(4 * 5000)).toBe(0.25);
});
it('replaces only the declared span, padding a short donor with exact silence', () => {
  const input = Buffer.from(new Float32Array(16000).fill(0.25).buffer),
    donor = Buffer.from(new Float32Array(1600).fill(0.5).buffer),
    r = replaceInterval(input, 200, 700, donor);
  expect(r.readFloatLE(3200 * 4)).toBe(0.5);
  expect(r.readFloatLE(5000 * 4)).toBe(0);
  expect(() => replaceInterval(input, -1, 500, donor)).toThrow();
  expect(() => replaceInterval(input, 200, 1500, donor)).toThrow();
});
it('exports bounded precise coarse clocks without dropping repeated occurrences', () => {
  const v = outerVtt([
    { text: '你好', startMs: 1000, endMs: 2000 },
    { text: '你好', startMs: 2000, endMs: 3000 },
  ]);
  expect(v.match(/你好/g)).toHaveLength(2);
  expect(v).toContain('00:00:01.000 --> 00:00:02.000');
  expect(() =>
    outerVtt([{ text: 'x\n\n00:00:01 --> 00:00:02', startMs: 0, endMs: 2000 }]),
  ).toThrow();
});
