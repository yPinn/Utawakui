import { describe, expect, it } from 'vitest';
import {
  candidateImportMessage,
  capabilityLabel,
  warningLabels,
} from './lrclibPresentation.js';

describe('LRCLIB candidate presentation', () => {
  it('describes timing capability without exposing parser vocabulary', () => {
    expect(
      capabilityLabel({ capability: { level: 'T2', partial: false } }),
    ).toBe('逐字同步');
    expect(
      capabilityLabel({ capability: { level: 'T2', partial: true } }),
    ).toBe('部分逐字同步');
    expect(capabilityLabel({ capability: { level: 'T1' } })).toBe('逐行同步');
    expect(capabilityLabel({ capability: { level: 'T0' } })).toBe('純文字歌詞');
    expect(capabilityLabel({ capability: { level: 'instrumental' } })).toBe(
      '純音樂',
    );
    expect(capabilityLabel({ capability: { level: 'unsupported' } })).toBe(
      '格式不支援',
    );
  });

  it('explains candidates that cannot be imported', () => {
    expect(
      candidateImportMessage({ capability: { level: 'instrumental' } }),
    ).toBe('這筆來源標示為純音樂，沒有可匯入的歌詞。');
    expect(
      candidateImportMessage({ capability: { level: 'unsupported' } }),
    ).toBe('這筆來源格式目前不支援，無法安全匯入。');
    expect(candidateImportMessage({ capability: { level: 'T0' } })).toBeNull();
  });

  it('maps bounded warnings to user-facing labels', () => {
    expect(
      warningLabels([
        'partial-word-timing',
        'overlapping-words',
        'unsupported-lyricsfile-version',
        'invalid-lyricsfile',
        'unsupported-lyricsfile-version-fallback',
        'invalid-lyricsfile-fallback',
        'invalid-yrc',
        'normalized-boundary-jitter',
        'version-mismatch',
        'lyricsfile-missing',
      ]),
    ).toEqual([
      '部分歌詞缺少逐字時間',
      '逐字時間有重疊，將保留來源但不直接套用',
      '逐字格式版本尚未支援',
      '逐字資料無法安全讀取',
      '逐字格式版本尚未支援，已改用逐行或純文字歌詞',
      '逐字資料無法安全讀取，已改用逐行或純文字歌詞',
      '網易逐字資料無法安全讀取，已改用逐行或純文字歌詞',
      '來源有 1ms 邊界誤差，已對齊相鄰逐字時間',
      '可能是不同版本',
    ]);
  });
});
