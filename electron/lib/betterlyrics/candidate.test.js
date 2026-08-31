import { describe, expect, it } from 'vitest';

import {
  evaluateBetterLyricsCandidate,
  fingerprintBetterLyricsRecord,
  summarizeBetterLyricsCandidate,
} from './candidate.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="5s"><p begin="1s" end="3s"><span begin="1s" end="3s">Song</span></p></body></tt>`;

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Singer',
    albumName: 'Album',
    duration: 5,
    score: 95,
    cacheStatus: 'HIT',
    ttml: TTML,
    ...overrides,
  };
}

describe('Better Lyrics candidate validation', () => {
  it('summarizes an exact complete T2 match without provider-native ranking data', () => {
    const match = evaluateBetterLyricsCandidate(
      { title: 'Song', artist: 'Singer', album: 'Album', duration: 5 },
      record(),
    );
    expect(match).toMatchObject({
      matchBand: 'exact',
      durationDelta: 0,
      analysis: { capability: { level: 'T2', partial: false } },
    });
    expect(summarizeBetterLyricsCandidate(match)).toMatchObject({
      id: 42,
      contributors: [],
      previewLines: [{ text: 'Song', start: 1 }],
      compatibility: { t2: true },
      previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('accepts a strong album variation and a missing optional API score', () => {
    const withoutScore = record({ albumName: 'Album Deluxe' });
    delete withoutScore.score;
    expect(
      evaluateBetterLyricsCandidate(
        { title: 'Song', artist: 'Singer', album: 'Album', duration: 5 },
        withoutScore,
      ),
    ).toMatchObject({ matchBand: 'strong' });
  });

  it.each([
    ['missing record', null],
    ['low score', record({ score: 79 })],
    ['wrong title', record({ trackName: 'Different' })],
    ['wrong artist', record({ artistName: 'Other' })],
    ['wrong duration', record({ duration: 15 })],
    ['wrong version', record({ trackName: 'Song (Live)' })],
    ['invalid TTML', record({ ttml: '<tt />' })],
  ])('rejects %s', (_label, candidate) => {
    expect(
      evaluateBetterLyricsCandidate(
        { title: 'Song', artist: 'Singer', album: 'Album', duration: 5 },
        candidate,
      ),
    ).toBeNull();
  });

  it('fingerprints stable query identity and TTML, not transient cache metadata', () => {
    expect(
      fingerprintBetterLyricsRecord(
        record({ score: 80, cacheStatus: 'STALE' }),
      ),
    ).toBe(fingerprintBetterLyricsRecord(record()));
    expect(
      fingerprintBetterLyricsRecord(
        record({ ttml: TTML.replace('Song</span>', 'Changed</span>') }),
      ),
    ).not.toBe(fingerprintBetterLyricsRecord(record()));
  });
});
