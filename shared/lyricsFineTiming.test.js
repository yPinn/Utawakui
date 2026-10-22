import { describe, expect, it } from 'vitest';
import {
  fineTimingLimits,
  validateLyricsFineTiming,
} from './lyricsFineTiming.mjs';
import canonicalLimits from './lyricsTimingValues.json' with { type: 'json' };

const line = { text: '你👩‍🎤好世界', startMs: 1000, endMs: 5000 };
const fine = () => ({
  version: 1,
  units: [
    { unitId: 'fine-0', from: 0, to: 1, startMs: 1100, endMs: 1400 },
    { unitId: 'fine-1', from: 6, to: 7, startMs: 2200, endMs: 2600 },
  ],
});

describe('independent fine interval evidence', () => {
  it('keeps the browser-safe v1 caps consistent with canonical limits', () => {
    for (const [key, value] of Object.entries(fineTimingLimits))
      expect(value).toBe(canonicalLimits[key]);
    expect(Object.isFrozen(fineTimingLimits)).toBe(true);
  });
  it('preserves partial source ranges and actual ends without filling gaps', () => {
    const value = fine();
    expect(validateLyricsFineTiming(value, line)).toEqual(value);
    expect(validateLyricsFineTiming(value, line)).not.toBe(value);
  });
  it.each([
    (f) => {
      f.version = 2;
    },
    (f) => {
      f.units[0].endMs = f.units[0].startMs;
    },
    (f) => {
      f.units[0].startMs = 999;
    },
    (f) => {
      f.units[1].endMs = 5001;
    },
    (f) => {
      f.units[1].startMs = 1399;
    },
    (f) => {
      f.units[1].from = 2;
    },
    (f) => {
      f.units[1].unitId = f.units[0].unitId;
    },
    (f) => {
      f.units[0].endMs = NaN;
    },
    (f) => {
      f.units[0].privatePath = 'private';
    },
    (f) => {
      f.units = [];
    },
  ])(
    'rejects malformed evidence instead of inventing or clipping times',
    (mutate) => {
      const value = fine();
      mutate(value);
      expect(() => validateLyricsFineTiming(value, line)).toThrow();
    },
  );
});
