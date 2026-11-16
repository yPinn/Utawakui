import { describe, expect, it } from 'vitest';
import {
  describeLyricsSourceTier,
  formatLyricsSourceLabel,
  formatLyricsSourceTier,
} from './lyricsSourcePresentation.js';
describe('renderer source labels', () => {
  it('shows saved lyrics by version and source code', () => {
    expect(
      formatLyricsSourceLabel({
        kind: 'kugou',
        language: 'und',
        label: 'Artist',
      }),
    ).toBe('Artist · 來源 C');
    expect(
      formatLyricsSourceLabel({
        kind: 'lrclib',
        language: 'und',
        label: 'Album',
      }),
    ).toBe('Album · 來源 A');
  });

  it('removes provider prefixes and bare legacy defaults at display time', () => {
    expect(
      formatLyricsSourceLabel({
        kind: 'netease',
        label: '網易雲音樂 / 飛ぶ時 / 飛ぼうよ',
      }),
    ).toBe('飛ぶ時 / 飛ぼうよ · 來源 B');
    expect(
      formatLyricsSourceLabel({ kind: 'betterlyrics', label: 'Better Lyrics' }),
    ).toBe('歌詞 · 來源 D');
    expect(
      formatLyricsSourceLabel({ kind: 'unknown-provider', label: 'Acoustic' }),
    ).toBe('Acoustic · 來源 X');
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
