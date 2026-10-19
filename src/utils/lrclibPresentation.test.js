import { describe, expect, it } from 'vitest';
import {
  candidateImportMessage,
  candidateTimelineDifference,
  capabilityLabel,
  warningLabels,
} from './lrclibPresentation.js';

describe('bounded timeline comparison presentation', () => {
  it('declines unverified metrics, pending updates and fingerprints rather than rendering a diagnosis', () => {
    const candidate = {
      candidateKey: 'netease:1',
      previewFingerprint: 'b'.repeat(64),
    };
    const reference = {
      candidateKey: 'lrclib:1',
      previewFingerprint: 'a'.repeat(64),
      providerId: 'lrclib',
    };
    const comparison = {
      candidateKey: candidate.candidateKey,
      referenceCandidateKey: reference.candidateKey,
      candidateFingerprint: 'b'.repeat(64),
      referenceFingerprint: 'a'.repeat(64),
      offsetMs: 2000,
      matchedLineCount: 8,
    };
    const group = {
      candidates: [candidate, reference],
      timelineDifferences: [comparison],
    };
    expect(candidateTimelineDifference(group, candidate)).toContain(
      '晚約 2 秒',
    );
    for (const patch of [
      { offsetMs: 999 },
      { offsetMs: 15001 },
      { offsetMs: 2000.5 },
      { matchedLineCount: 4 },
      { matchedLineCount: 129 },
      { matchedLineCount: Number.NaN },
      { candidateFingerprint: 'changed' },
      { referenceFingerprint: 'changed' },
    ])
      expect(
        candidateTimelineDifference(
          { ...group, timelineDifferences: [{ ...comparison, ...patch }] },
          candidate,
        ),
      ).toBeNull();
    expect(
      candidateTimelineDifference(
        group,
        candidate,
        new Map([['netease:1', {}]]),
      ),
    ).toBeNull();
    expect(candidateTimelineDifference({}, candidate)).toBeNull();
  });
});

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
      warningLabels(
        [
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
        ],
        { level: 'T1' },
      ),
    ).toEqual([
      '部分歌詞缺少逐字時間',
      '逐字時間有重疊，將保留來源但不直接套用',
      '逐字格式版本尚未支援',
      '逐字同步資料無法使用',
      '逐字格式版本尚未支援；仍可儲存逐行同步歌詞',
      '逐字同步資料無法使用；仍可儲存逐行同步歌詞',
      '網易逐字同步資料無法使用；仍可儲存逐行同步歌詞',
      '來源有 1ms 邊界誤差，已對齊相鄰逐字時間',
      '可能是不同版本',
    ]);
  });

  it('names the usable fallback capability instead of a generic downgrade', () => {
    expect(
      warningLabels(['invalid-lyricsfile-fallback'], { level: 'T0' }),
    ).toEqual(['逐字同步資料無法使用；仍可儲存純文字歌詞']);
  });
});
