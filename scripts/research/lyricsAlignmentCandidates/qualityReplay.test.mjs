import { expect, it } from 'vitest';
import {
  validateCachedWindows,
  assertCacheSeed,
  assertMissingAsrWindow,
} from './qualityReplay.cjs';
import { sha } from './assets.cjs';
it('requires the original Qwen/base/small receipt bytes for cached activity', () => {
  const q = Buffer.from('q'),
    a = { base: Buffer.from('b'), small: Buffer.from('s') },
    cache = {
      methodSeed: sha(JSON.stringify([sha(q), sha(a.base), sha(a.small)])),
    };
  expect(() => assertCacheSeed(cache, q, a)).not.toThrow();
  expect(() =>
    assertCacheSeed(cache, Buffer.from('different audio receipt'), a),
  ).toThrow('seed');
});
it('handles a silent window beside a different voiced window without dropping the case', () => {
  expect(() => assertMissingAsrWindow([{ index: 1 }], 0, [])).not.toThrow();
  expect(() => assertMissingAsrWindow([{ index: 0 }], 0, [])).toThrow(
    'missing',
  );
  expect(() => assertMissingAsrWindow([], 0, [{}])).toThrow('missing');
});
it('binds every replay window, occurrence order, duration and probability budget', () => {
  const planned = [{ index: 0, startMs: 0, endMs: 1000, lineIds: ['a', 'b'] }],
    recorded = [
      {
        ...planned[0],
        durationMs: 1000,
        vad: { probabilities: Array(32).fill(0.5) },
      },
    ];
  expect(validateCachedWindows(planned, recorded)).toEqual(recorded);
  for (const change of [
    { index: 1 },
    { startMs: 500 },
    { endMs: 1100 },
    { lineIds: ['b', 'a'] },
    { durationMs: 500 },
    { vad: { probabilities: [NaN] } },
  ])
    expect(() =>
      validateCachedWindows(planned, [{ ...recorded[0], ...change }]),
    ).toThrow('windows');
  expect(() => validateCachedWindows(planned, [])).toThrow('windows');
});
