import { describe, expect, it } from 'vitest';
import {
  evaluateArtworkCandidate,
  rankArtworkCandidates,
} from './releasePolicy.js';

const expected = {
  title: 'Stellar Stellar',
  artistCredit: '星街すいせい',
  album: 'Still Still Stellar',
  duration: 301,
  releaseYear: 2021,
};

function candidate(overrides = {}) {
  return {
    provider: 'musicbrainz',
    entityType: 'release',
    entityId: '11111111-1111-4111-8111-111111111111',
    releaseGroupId: '22222222-2222-4222-8222-222222222222',
    recordingId: '33333333-3333-4333-8333-333333333333',
    recordingTitle: 'Stellar Stellar',
    releaseTitle: 'Still Still Stellar',
    artistCredit: '星街すいせい',
    duration: 301,
    status: 'Official',
    date: '2021-09-29',
    country: 'JP',
    primaryType: 'Album',
    secondaryTypes: [],
    searchScore: 100,
    queryVariant: {
      kind: 'original',
      source: 'library',
      confidence: 'high',
    },
    front: { previewUrl: 'internal', applyUrl: 'internal' },
    ...overrides,
  };
}

describe('artwork release policy', () => {
  it('maps shared recording evidence into artwork-owned confidence and reasons', () => {
    expect(evaluateArtworkCandidate(expected, candidate())).toMatchObject({
      confidence: 'high',
      reasons: expect.arrayContaining([
        'title-exact',
        'artist-exact',
        'album-exact',
        'official-release',
        'front-available',
      ]),
      evidence: {
        title: { exact: true },
        artist: { exact: true },
        album: { exact: true },
        version: { candidateIntroduces: false },
      },
    });
  });

  it('keeps version/status/type policy out of shared evidence and below a studio official match', () => {
    const ranked = rankArtworkCandidates(expected, [
      candidate({
        entityId: '44444444-4444-4444-8444-444444444444',
        recordingTitle: 'Stellar Stellar - Acoustic Version',
        releaseTitle: 'Stellar Stellar Acoustic',
        status: 'Pseudo-Release',
        primaryType: 'Album',
        secondaryTypes: ['Compilation', 'Live'],
      }),
      candidate(),
    ]);

    expect(ranked.map((item) => item.entityId)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(ranked[1]).toMatchObject({
      confidence: 'low',
      reasons: expect.arrayContaining([
        'version-conflict',
        'pseudo-release',
        'compilation',
      ]),
    });
  });

  it('marks only a clearly leading high-confidence candidate as recommended, never automatic', () => {
    const clear = rankArtworkCandidates(expected, [
      candidate(),
      candidate({
        entityId: '55555555-5555-4555-8555-555555555555',
        artistCredit: 'Someone Else',
        status: 'Bootleg',
      }),
    ]);
    expect(clear[0]).toMatchObject({ recommended: true, automatic: false });

    const close = rankArtworkCandidates(expected, [
      candidate(),
      candidate({
        entityId: '66666666-6666-4666-8666-666666666666',
        country: 'TW',
      }),
    ]);
    expect(close[0]).toMatchObject({ recommended: false, automatic: false });
    expect(close[1]).toMatchObject({ recommended: false, automatic: false });
  });

  it('treats an expected ISRC matching any candidate ISRC as exact', () => {
    const evaluated = evaluateArtworkCandidate(
      { ...expected, isrc: 'TWBBB9900002' },
      candidate({ isrcs: ['USAAA2100001', 'TWBBB9900002'] }),
    );

    expect(evaluated.evidence.ids.isrc.relation).toBe('exact');
    expect(evaluated.reasons).toContain('isrc-exact');
    expect(evaluated.reasons).not.toContain('isrc-conflict');
  });
});
