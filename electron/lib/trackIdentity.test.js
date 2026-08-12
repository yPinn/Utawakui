import { describe, expect, it } from 'vitest';
import {
  buildTrackIdentity,
  identityArtistKeys,
  normalizeIsrc,
  trackIdentityKey,
} from './trackIdentity.js';

describe('normalizeIsrc', () => {
  it('uppercases and strips separators from a well-formed ISRC', () => {
    expect(normalizeIsrc('us-um7-24-01994')).toBe('USUM72401994');
  });

  it('accepts an already-normalized ISRC unchanged', () => {
    expect(normalizeIsrc('USUM72401994')).toBe('USUM72401994');
  });

  it('rejects a value that is not ISRC-shaped', () => {
    expect(normalizeIsrc('not-an-isrc')).toBeUndefined();
  });

  it('rejects undefined and empty input', () => {
    expect(normalizeIsrc(undefined)).toBeUndefined();
    expect(normalizeIsrc('')).toBeUndefined();
  });
});

describe('buildTrackIdentity', () => {
  it('normalizes high-confidence external track metadata', () => {
    expect(
      buildTrackIdentity({
        trackName: 'Espresso',
        artistName: 'Sabrina Carpenter',
        albumName: 'Short n Sweet',
        durationMs: 175_000,
        isrc: 'us-um7-24-01994',
        platform: 'spotify',
        type: 'track',
        id: '4uLU6hMCjMI75M1A2tKUQC',
        url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      }),
    ).toEqual({
      title: 'Espresso',
      artists: ['Sabrina Carpenter'],
      artist: 'Sabrina Carpenter',
      album: 'Short n Sweet',
      duration: 175,
      isrc: 'USUM72401994',
      sourcePlatform: 'spotify',
      sourceType: 'track',
      source: 'spotify',
      sourceId: '4uLU6hMCjMI75M1A2tKUQC',
      sourceUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      confidence: 'high',
      titleConfidence: 'high',
      artistConfidence: 'high',
    });
  });

  it('uses YT Music artist metadata as high-confidence song identity', () => {
    expect(
      buildTrackIdentity({
        title: 'Parachute',
        artist: 'Sabrina Hu, Goatak',
        duration: 211,
        platform: 'yt-music',
        type: 'track',
      }),
    ).toMatchObject({
      title: 'Parachute',
      artists: ['Sabrina Hu', 'Goatak'],
      artist: 'Sabrina Hu, Goatak',
      sourcePlatform: 'yt-music',
      sourceType: 'track',
      confidence: 'high',
      artistConfidence: 'high',
    });
  });

  it('keeps dash-separated version text in track-provider titles', () => {
    expect(
      buildTrackIdentity({
        title: 'Seven - Clean Ver. (合作演出：Latto)',
        artist: '정국 (Jung Kook) 和 Latto',
        duration: 184,
        platform: 'yt-music',
        type: 'track',
      }),
    ).toMatchObject({
      title: 'Seven - Clean Ver. (合作演出：Latto)',
      artists: ['정국 (Jung Kook)', 'Latto'],
      artist: '정국 (Jung Kook), Latto',
      sourcePlatform: 'yt-music',
      sourceType: 'track',
      confidence: 'high',
    });
  });

  it('trusts reliable playlist entry metadata before dash parsing titles', () => {
    expect(
      buildTrackIdentity(
        {
          title: 'Seven (feat. Latto) - Explicit Ver.',
          artist: '정국 (Jung Kook), Latto',
          duration: 184,
        },
        {
          sourcePlatform: 'youtube',
          sourceType: 'playlist-entry',
          sourceId: 'playlist001',
        },
      ),
    ).toMatchObject({
      title: 'Seven (feat. Latto) - Explicit Ver.',
      artists: ['정국 (Jung Kook)', 'Latto'],
      artist: '정국 (Jung Kook), Latto',
      sourcePlatform: 'youtube',
      sourceType: 'playlist-entry',
      sourceId: 'playlist001',
      confidence: 'medium',
      titleConfidence: 'high',
      artistConfidence: 'medium',
    });
  });

  it('derives title and performer from a decorated YouTube video title', () => {
    expect(
      buildTrackIdentity({
        title: 'Sabrina Hu - Parachute (Official Music Video)',
        artist: 'Example Music',
        duration: 240,
        platform: 'youtube',
        type: 'video',
      }),
    ).toMatchObject({
      title: 'Parachute',
      artists: ['Sabrina Hu'],
      artist: 'Sabrina Hu',
      duration: 240,
      sourcePlatform: 'youtube',
      sourceType: 'video',
      confidence: 'medium',
      titleConfidence: 'medium',
      artistConfidence: 'high',
    });
  });

  it('keeps uploader-only YouTube metadata low-confidence', () => {
    expect(
      buildTrackIdentity({
        title: 'Parachute',
        uploader: 'Example Music',
        duration: 211,
        platform: 'youtube',
        type: 'video',
      }),
    ).toMatchObject({
      title: 'Parachute',
      artists: ['Example Music'],
      artist: 'Example Music',
      confidence: 'low',
      artistConfidence: 'low',
    });
  });

  it('returns null when no searchable title can be derived', () => {
    expect(buildTrackIdentity({ artist: 'Sabrina Hu' })).toBe(null);
  });
});

describe('track identity helpers', () => {
  it('builds stable artist keys only from reliable artist fields', () => {
    const identity = buildTrackIdentity({
      title: 'Sabrina Hu - Parachute (Official Music Video)',
      artist: 'Example Music',
      platform: 'youtube',
      type: 'video',
    });

    expect(identityArtistKeys(identity)).toEqual(['sabrina hu']);
  });

  it('includes ISRC in the cache key when available', () => {
    const identity = buildTrackIdentity({
      title: 'Espresso',
      artist: 'Sabrina Carpenter',
      duration: 175,
      isrc: 'USUM72401994',
      platform: 'spotify',
    });

    expect(trackIdentityKey(identity)).toBe(
      'espresso|sabrina carpenter|175|USUM72401994',
    );
  });
});
