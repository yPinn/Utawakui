import { describe, expect, it } from 'vitest';

import {
  ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
  ornateVerticalEntrancePlan,
  ornateVerticalRevealDelaySeconds,
  ornateVerticalRevealDelays,
} from './ornateVerticalMotion.mjs';

describe('Ornate Vertical motion contract', () => {
  it('keeps the reveal sequential, short, and bounded across long lines', () => {
    const delays = Array.from({ length: 20 }, (_value, index) =>
      ornateVerticalRevealDelaySeconds(index, 20),
    );

    expect(delays[0]).toBe(0);
    expect(
      delays.every((delay, index) => index === 0 || delay > delays[index - 1]),
    ).toBe(true);
    expect(delays.at(-1) + ORNATE_VERTICAL_ENTER_DURATION_SECONDS).toBeCloseTo(
      0.96,
    );
  });

  it('preserves a short interval between letters in short phrases', () => {
    expect(
      [0, 1, 2, 3].map((index) => ornateVerticalRevealDelaySeconds(index, 4)),
    ).toEqual([0, 0.12, 0.24, 0.36]);
    expect(ornateVerticalRevealDelaySeconds(0, 1)).toBe(0);
    expect(ornateVerticalRevealDelaySeconds(3, 4, 0.3)).toBe(0.18);
  });

  it('starts with one focus Han glyph and fills the other slots in reading order', () => {
    const units = [
      { kind: 'kana' },
      { kind: 'han' },
      { kind: 'han', emphasis: 'keyword' },
      { kind: 'kana' },
    ];
    expect(ornateVerticalRevealDelays(units, 1, true)).toEqual([
      0.12, 0.24, 0, 0.36,
    ]);
    expect(ornateVerticalRevealDelays(units, 1, false)).toEqual([
      0, 0.12, 0.24, 0.36,
    ]);
    expect(ornateVerticalRevealDelays(units.slice(0, 2), 1, true)).toEqual([
      0.12, 0,
    ]);
    expect(ornateVerticalRevealDelays(units.slice(0, 1), 1, true)).toEqual([0]);
  });

  it('keeps slide offsets stable per cue and unit across column rebuilds', () => {
    const units = Array.from({ length: 8 }, (_, index) => ({ index }));
    const plan = ornateVerticalEntrancePlan(units, 0.6, 'random-slide', '10');
    const shifted = ornateVerticalEntrancePlan(
      units.slice(3),
      0.6,
      'random-slide',
      '10',
    );
    expect(shifted.offsets).toEqual(plan.offsets.slice(3));
    expect(
      ornateVerticalEntrancePlan(units, 0.6, 'random-slide', '28').offsets,
    ).not.toEqual(plan.offsets);
    expect(plan.offsets.some(({ x }) => parseFloat(x) < 0)).toBe(true);
    expect(plan.offsets.some(({ x }) => parseFloat(x) > 0)).toBe(true);
    expect(plan.delays[0]).toBe(0);
    expect(plan.delays.at(-1) + plan.duration).toBeCloseTo(0.6);
    expect(
      ornateVerticalEntrancePlan(units, 0.2, 'random-slide', '10').duration,
    ).toBe(0.2);
  });
});
