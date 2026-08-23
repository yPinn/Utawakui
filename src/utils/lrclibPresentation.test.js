import { describe, expect, it } from 'vitest';
import {
  capabilityLabel,
  matchReasonLabels,
  warningLabels,
} from './lrclibPresentation.js';

describe('LRCLIB candidate presentation', () => {
  it('describes timing capability without exposing parser vocabulary', () => {
    expect(
      capabilityLabel({ capability: { level: 'T2', partial: false } }),
    ).toBe('T2 逐字');
    expect(
      capabilityLabel({ capability: { level: 'T2', partial: true } }),
    ).toBe('T2 部分逐字');
    expect(capabilityLabel({ capability: { level: 'T1' } })).toBe('T1 逐行');
    expect(capabilityLabel({ capability: { level: 'T0' } })).toBe('T0 無時間');
    expect(capabilityLabel({ capability: { level: 'instrumental' } })).toBe(
      '純音樂',
    );
  });

  it('maps bounded warnings and match reasons to user-facing labels', () => {
    expect(
      warningLabels([
        'partial-word-timing',
        'overlapping-words',
        'unsupported-lyricsfile-version',
        'invalid-lyricsfile',
        'version-mismatch',
        'lyricsfile-missing',
      ]),
    ).toEqual([
      '部分歌詞缺少逐字時間',
      '逐字時間有重疊，將保留來源但不直接套用',
      '逐字格式版本尚未支援',
      '逐字資料無法安全讀取',
      '可能是不同版本',
    ]);
    expect(matchReasonLabels(['title-exact', 'artist-close'])).toEqual([
      '曲名完全相同',
      '歌手名稱相近',
    ]);
  });
});
