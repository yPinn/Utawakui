import { describe, expect, it } from 'vitest';
import { rubySegmentGaps as layout } from './rubyLayout.js';

// Synthetic font metrics exercise geometry independently of CSS font choices.
const rubySegmentGaps = (segments) => layout(segments, 0.6);

describe('rubySegmentGaps', () => {
  it('lets a wide reading hang one ruby character over neighbouring kana', () => {
    // じゅんじょう is 3.6em over 2em of 純情: 0.8em per side, 0.6em hangs.
    expect(
      rubySegmentGaps([
        { t: 'の' },
        { t: '純情', r: 'じゅんじょう' },
        { t: 'み' },
      ]),
    ).toEqual([0, 0.2, 0.2]);
  });

  it('keeps neighbouring readings apart without spreading the words', () => {
    expect(
      rubySegmentGaps([
        { t: '部外', r: 'ぶがい' },
        { t: '秘', r: 'ひ' },
        { t: '扱', r: 'あつか' },
        { t: 'い' },
      ]),
    ).toEqual([0, 0, 0.35, 0]);
  });

  it('hangs half a ruby character into the line start, never over punctuation', () => {
    expect(
      rubySegmentGaps([
        { t: '扱', r: 'あつか' },
        { t: '？' },
        { t: ' ' },
        { t: '扱', r: 'あつか' },
      ]),
    ).toEqual([0.1, 0.4, 0, 0.4]);
    expect(rubySegmentGaps([{ t: '隠', r: 'かく' }, { t: 'す' }])).toEqual([
      0, 0,
    ]);
  });

  it('leaves narrow readings and plain text untouched', () => {
    expect(
      rubySegmentGaps([{ t: '一方', r: 'いっぽう' }, { t: 'で' }]),
    ).toEqual([0, 0]);
    expect(rubySegmentGaps([{ t: 'しかし' }])).toEqual([0]);
    expect(rubySegmentGaps(null)).toEqual([]);
  });

  it('uses the measured sizes of independently selected font tiers', () => {
    const segments = [
      { t: 'の' },
      { t: '純情', r: 'じゅんじょう' },
      { t: 'み' },
    ];
    expect(layout(segments, 14 / 18)).toEqual([0, 0.556, 0.556]);
    expect(layout(segments, 14 / 24)).toEqual([0, 0.167, 0.167]);
    expect(layout(segments, 16 / 28)).toEqual([0, 0.143, 0.143]);
  });
});
