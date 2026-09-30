import { describe, expect, it } from 'vitest';
import { projectArtworkCandidate } from './artworkCandidateDisplay.js';

describe('artwork candidate display projection', () => {
  it('keeps only decision-useful localized release details', () => {
    expect(
      projectArtworkCandidate({
        releaseTitle: 'RASEN',
        artistCredit: '9Lana',
        firstReleaseYear: 2026,
        primaryType: 'EP',
        secondaryTypes: ['Live'],
        status: 'Official',
        country: 'XW',
        confidence: 'high',
        recommended: true,
        matchKind: 'original',
        reasons: ['title-exact', 'artist-exact', 'type-ep', 'front-available'],
      }),
    ).toEqual({
      title: 'RASEN',
      artist: '9Lana',
      releaseMeta: '2026 · EP · 現場版',
      decisionLabel: '建議',
      decisionTone: 'success',
      reason: '',
    });
  });

  it('prioritizes a version warning over generic confidence', () => {
    expect(
      projectArtworkCandidate({
        releaseTitle: 'RASEN (Acoustic Ver.)',
        artistCredit: '9Lana',
        primaryType: 'Single',
        confidence: 'low',
        reasons: ['title-contains', 'artist-exact', 'version-conflict'],
      }),
    ).toMatchObject({
      releaseMeta: '單曲',
      decisionLabel: '請確認版本',
      decisionTone: 'warning',
      reason: '候選名稱可能是其他版本',
    });
  });

  it('uses bounded plain-language fallbacks without exposing provider codes', () => {
    const projected = projectArtworkCandidate({
      releaseTitle: '',
      artistCredit: '',
      primaryType: 'Unknown-Type',
      status: 'Unmapped-Status',
      confidence: 'low',
      reasons: ['release-status-other', 'type-unknown'],
    });

    expect(projected).toEqual({
      title: '未知發行',
      artist: '未知演唱者',
      releaseMeta: '發行資訊未提供',
      decisionLabel: '差異較多',
      decisionTone: 'muted',
      reason: '請依封面與發行資訊確認',
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /Unknown-Type|Unmapped-Status|type-unknown/u,
    );
  });
});
