import { describe, expect, it } from 'vitest';

import {
  ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
  ORNATE_VERTICAL_EXIT_DURATION_SECONDS,
  ornateVerticalEnterPose,
  ornateVerticalRevealDelaySeconds,
} from './ornateVerticalMotion.mjs';

describe('Ornate Vertical motion contract', () => {
  it('keeps the reveal sequential, short, and bounded across long lines', () => {
    const delays = Array.from({ length: 20 }, (_value, index) =>
      ornateVerticalRevealDelaySeconds(index),
    );

    expect(delays.slice(0, 6)).toEqual([0, 0.045, 0.09, 0.135, 0.18, 0.225]);
    expect(delays.at(-1)).toBe(0.27);
    expect(ORNATE_VERTICAL_EXIT_DURATION_SECONDS).toBeLessThan(
      ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
    );
  });

  it('distinguishes Han cut-in from kana without changing layout position', () => {
    expect(ornateVerticalEnterPose('han', 0)).toEqual({
      clipPath: 'inset(0 0 100% 0)',
    });
    expect(ornateVerticalEnterPose('kana', 1)).toEqual({
      clipPath: 'inset(0 0 0% 0)',
    });
  });
});
