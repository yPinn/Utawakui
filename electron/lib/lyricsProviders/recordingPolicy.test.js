import { describe, expect, it } from 'vitest';
import {
  classifyLyricsMatch,
  compareLyricsRecordingIdentity,
  isAutomaticLyricsCandidate,
  lyricsTextMatchScore,
} from './recordingPolicy.js';

const DEFAULT_RULES = {
  exact: { title: 1, artist: 1, duration: 4, requiresArtist: true },
  strong: { title: 0.82, artist: 0.8, duration: 45 },
};

describe('lyrics recording policy', () => {
  it('maps shared text evidence to the existing lyrics score scale', () => {
    expect(lyricsTextMatchScore('Song', 'Song')).toBe(1);
    expect(lyricsTextMatchScore('Song', 'Song Extended')).toBe(0.82);
    expect(
      lyricsTextMatchScore('red blue green yellow', 'red blue green orange'),
    ).toBe(0.75);
    expect(lyricsTextMatchScore('Song', 'Unrelated')).toBe(0);
  });

  it('adapts shared axes without importing provider request policy', () => {
    const evidence = compareLyricsRecordingIdentity(
      {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
      },
      {
        trackName: 'Song Live',
        artistName: 'Artist',
        albumName: 'Album Live',
        duration: 185,
      },
    );

    expect(evidence).toMatchObject({
      scores: { title: 1, artist: 1, album: 1 },
      duration: { delta: 5, signedDelta: 5 },
      versionMismatch: true,
    });
    expect(evidence).not.toHaveProperty('band');
  });

  it('uses the legacy comparison key to decide whether an artist hint exists', () => {
    expect(
      compareLyricsRecordingIdentity(
        { title: 'Song', artist: 'Official' },
        { trackName: 'Song', artistName: 'Artist' },
      ).hasArtist,
    ).toBe(false);
  });

  it('maps evidence to caller-owned thresholds and keeps exact-only automatic policy', () => {
    const exact = compareLyricsRecordingIdentity(
      { title: 'Song', artist: 'Artist', duration: 180 },
      { trackName: 'Song', artistName: 'Artist', duration: 180 },
    );
    const strong = compareLyricsRecordingIdentity(
      { title: 'Song', artist: 'Artist', duration: 180 },
      { trackName: 'Song Extended', artistName: 'Artist', duration: 190 },
    );

    expect(classifyLyricsMatch(exact, DEFAULT_RULES)).toBe('exact');
    expect(classifyLyricsMatch(exact, {})).toBe('related');
    expect(classifyLyricsMatch(strong, DEFAULT_RULES)).toBe('strong');
    expect(
      classifyLyricsMatch({ ...strong, versionMismatch: true }, DEFAULT_RULES),
    ).toBe('related');
    expect(
      isAutomaticLyricsCandidate({
        matchBand: 'exact',
        compatibility: { t1: true, t2: false },
      }),
    ).toBe(true);
    expect(
      isAutomaticLyricsCandidate({
        matchBand: 'strong',
        compatibility: { t1: true, t2: true },
      }),
    ).toBe(false);
  });
});
