import { expect, it } from 'vitest';
import { leadingCropMs } from './cropLeading.cjs';
it('crops only leading audio before supported text with two seconds of context and no reference clocks', () => {
  const lines = [
    { text: 'HATE ME', startMs: 4000, endMs: 6000 },
    { text: '愛憎渦巻いて', startMs: 13463, endMs: 16014 },
  ];
  expect(leadingCropMs(lines, 'ja', 0, 30000)).toBe(11463);
  expect(
    leadingCropMs(
      [{ text: 'こんにちは', startMs: 410, endMs: 2500 }],
      'ja',
      0,
      30000,
    ),
  ).toBe(0);
  expect(() => leadingCropMs(lines, 'ja', 20000, 30000)).toThrow();
});
