import { describe, expect, it } from 'vitest';
import {
  compareRecordingIdentity,
  compareTextEvidence,
  durationDelta,
  signedDurationDelta,
} from './recordingEvidence.js';

describe('recording identity evidence primitives', () => {
  it('returns raw text relations without a feature score or cutoff', () => {
    expect(compareTextEvidence('Stellar Stellar', 'Stellar Stellar')).toEqual({
      actualKey: 'stellar stellar',
      contains: false,
      exact: true,
      expectedKey: 'stellar stellar',
      tokenOverlap: 1,
    });
    expect(compareTextEvidence('Stellar Stellar', 'Stellar')).toMatchObject({
      contains: true,
      exact: false,
      tokenOverlap: 1,
    });
    expect(
      compareTextEvidence('red blue green yellow', 'red blue green orange'),
    ).toMatchObject({ contains: false, exact: false, tokenOverlap: 0.75 });
  });

  it('reports absolute and signed duration evidence independently', () => {
    expect(durationDelta(211.4, 215.6)).toBe(5);
    expect(signedDurationDelta(211.4, 215.6)).toBe(5);
    expect(signedDurationDelta(215.6, 211.4)).toBe(-5);
    expect(durationDelta(undefined, 211)).toBeNull();
  });

  it('compares recording axes without returning a feature band or total score', () => {
    const evidence = compareRecordingIdentity(
      {
        title: 'Song',
        artistCredit: 'Artist',
        album: 'Album',
        duration: 211,
        isrc: 'USAAA2400001',
      },
      {
        title: 'Song Live',
        artistCredit: 'Artist',
        album: 'Album',
        duration: 216,
        isrc: 'USAAA2400002',
      },
    );

    expect(evidence).toMatchObject({
      title: { exact: false, contains: true },
      artist: { exact: true },
      album: { exact: true },
      duration: { delta: 5, signedDelta: 5 },
      ids: { isrc: { relation: 'conflict' } },
      version: { candidateIntroduces: true },
    });
    expect(evidence.reasons).toContain('candidate-version-extra');
    expect(evidence).not.toHaveProperty('score');
    expect(evidence).not.toHaveProperty('band');
  });

  it('reports exact identifiers, token-only reasons, and missing timing independently', () => {
    const evidence = compareRecordingIdentity(
      {
        title: 'Red Blue',
        artistCredit: 'Artist One',
        isrc: 'USAAA2400001',
      },
      {
        title: 'Red Green',
        artistCredit: 'Artist Two',
        isrc: 'US-AAA-24-00001',
      },
    );

    expect(evidence.duration).toEqual({
      expected: undefined,
      candidate: undefined,
      delta: null,
      signedDelta: null,
    });
    expect(evidence.ids.isrc.relation).toBe('exact');
    expect(evidence.reasons).toContain('title-token-overlap');
    expect(evidence.reasons).toContain('artist-token-overlap');
    expect(evidence.reasons).toContain('isrc-exact');
  });
});
