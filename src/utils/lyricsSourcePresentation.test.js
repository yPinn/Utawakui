import { describe, expect, it } from 'vitest';
import {
  describeLyricsSourceTier,
  formatLyricsSourceLabel,
  formatLyricsSourceTier,
} from './lyricsSourcePresentation.js';
describe('renderer source labels', () => {
  it('labels a persisted Kugou source without changing existing source formatting', () => {
    expect(
      formatLyricsSourceLabel({
        kind: 'kugou',
        language: 'und',
        label: 'Artist',
      }),
    ).toBe('酷狗音樂 / Artist');
    expect(
      formatLyricsSourceLabel({
        kind: 'lrclib',
        language: 'und',
        label: 'Album',
      }),
    ).toBe('LRCLIB / Album');
  });
});

describe('formatLyricsSourceTier', () => {
  it.each([
    ['T0', 'T0 純文字'],
    ['T1', 'T1 逐行'],
    ['T1+', 'T1+ 逐行估計'],
    ['T2', 'T2 逐字'],
    [undefined, '待確認'],
    ['unsupported', '待確認'],
  ])('formats source tier %s as %s', (tier, expected) => {
    expect(formatLyricsSourceTier(tier)).toBe(expected);
  });

  it.each([
    ['T0', '沒有同步時間，無法跟隨播放。'],
    ['T1', '歌詞可逐行跟隨播放。'],
    ['T2', '含歌詞分段時間，部分句子可能仍按整句顯示。'],
    [undefined, '尚未確認同步方式。'],
  ])(
    'describes source tier %s without implying a display style',
    (tier, expected) => {
      expect(describeLyricsSourceTier(tier)).toBe(expected);
    },
  );
});
