import { describe, expect, it } from 'vitest';

import {
  ornateVerticalEnterPose,
  ornateVerticalScriptMotionEnabled,
  ornateVerticalRevealDelaySeconds,
} from './ornateVerticalMotion.mjs';

describe('Ornate Vertical motion contract', () => {
  it('keeps the reveal sequential, short, and bounded across long lines', () => {
    const delays = Array.from({ length: 20 }, (_value, index) =>
      ornateVerticalRevealDelaySeconds(index),
    );

    expect(delays.slice(0, 6)).toEqual([0, 0.045, 0.09, 0.135, 0.18, 0.225]);
    expect(delays.at(-1)).toBe(0.27);
  });

  it('opts in one Japanese track only', () => {
    expect(ornateVerticalScriptMotionEnabled('test', 'test', 'ja-JP')).toBe(
      true,
    );
    expect(ornateVerticalScriptMotionEnabled('test', 'other', 'ja')).toBe(
      false,
    );
    expect(ornateVerticalScriptMotionEnabled('test', 'test', 'zh-Hant')).toBe(
      false,
    );
    expect(ornateVerticalScriptMotionEnabled('', '', 'ja')).toBe(false);
  });

  it('slides Han from the column side and uncovers kana downward in the trial', () => {
    expect(
      ornateVerticalEnterPose('han', { scriptMotion: true, columnIndex: 0 }),
    ).toEqual({ xPercent: 18 });
    expect(
      ornateVerticalEnterPose('han', { scriptMotion: true, columnIndex: 1 }),
    ).toEqual({ xPercent: -18 });
    expect(ornateVerticalEnterPose('kana', { scriptMotion: true })).toEqual({
      clipPath: 'inset(0 0 100% 0)',
    });
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
