import { describe, expect, it } from 'vitest';
import {
  buildLyricsMetadataProfiles,
  normalizeMetadataCandidate,
  parsePlatformLink,
} from './metadataEnrichment.js';

describe('parsePlatformLink', () => {
  it('parses Spotify track URLs and URIs', () => {
    expect(
      parsePlatformLink(
        'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      ),
    ).toMatchObject({
      platform: 'spotify',
      type: 'track',
      id: '4uLU6hMCjMI75M1A2tKUQC',
    });
    expect(parsePlatformLink('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toEqual({
      platform: 'spotify',
      type: 'track',
      id: '4uLU6hMCjMI75M1A2tKUQC',
      url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    });
  });

  it('parses Apple Music song links from album URLs', () => {
    expect(
      parsePlatformLink(
        'https://music.apple.com/tw/album/example/1721054880?i=1721054885',
      ),
    ).toMatchObject({
      platform: 'appleMusic',
      type: 'track',
      id: '1721054885',
    });
  });

  it('parses KKBOX, TIDAL, Deezer, and YouTube links', () => {
    expect(
      parsePlatformLink('https://www.kkbox.com/tw/tc/song/abc123'),
    ).toMatchObject({
      platform: 'kkbox',
      type: 'track',
      id: 'abc123',
    });
    expect(
      parsePlatformLink('https://tidal.com/browse/track/12345'),
    ).toMatchObject({
      platform: 'tidal',
      type: 'track',
      id: '12345',
    });
    expect(
      parsePlatformLink('https://www.deezer.com/track/3135556'),
    ).toMatchObject({
      platform: 'deezer',
      type: 'track',
      id: '3135556',
    });
    expect(
      parsePlatformLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toMatchObject({
      platform: 'youtubeMusic',
      type: 'video',
      id: 'dQw4w9WgXcQ',
    });
  });
});

describe('normalizeMetadataCandidate', () => {
  it('normalizes common platform metadata fields for lyrics lookup', () => {
    expect(
      normalizeMetadataCandidate({
        trackName: 'Espresso',
        artistName: 'Sabrina Carpenter',
        albumName: 'Short n Sweet',
        durationMs: 175_000,
        isrc: 'us-um7-24-01994',
        platform: 'spotify',
      }),
    ).toEqual({
      title: 'Espresso',
      artist: 'Sabrina Carpenter',
      album: 'Short n Sweet',
      duration: 175,
      isrc: 'USUM72401994',
      platform: 'spotify',
      source: 'spotify',
      confidence: 'high',
    });
  });

  it('rejects invalid ISRC values without rejecting the whole profile', () => {
    // normalizeIsrc itself is trackIdentity.js's — see its own tests there
    // for format-validation coverage; this only checks the candidate as a
    // whole still comes back usable when isrc is the one bad field.
    expect(
      normalizeMetadataCandidate({
        title: 'Song',
        artist: 'Artist',
        isrc: 'not-an-isrc',
      })?.isrc,
    ).toBeUndefined();
  });
});

describe('buildLyricsMetadataProfiles', () => {
  it('orders external high-confidence profiles before track fallback', () => {
    expect(
      buildLyricsMetadataProfiles(
        {
          title: 'Artist - Official MV Title',
          artist: 'Uploader Music',
          duration: 230,
        },
        [
          {
            title: 'Canonical Title',
            artist: 'Actual Artist',
            duration: 205,
            platform: 'spotify',
          },
        ],
      ).map((profile) => ({
        title: profile.title,
        artist: profile.artist,
        source: profile.source,
      })),
    ).toEqual([
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
        source: 'spotify',
      },
      {
        title: 'Artist - Official MV Title',
        artist: 'Uploader Music',
        source: 'track-metadata',
      },
    ]);
  });

  it('can omit track fallback when a caller already has its own fallback path', () => {
    expect(
      buildLyricsMetadataProfiles(
        { title: 'Raw Title', artist: 'Raw Artist' },
        [],
        { includeTrackFallback: false },
      ),
    ).toEqual([]);
  });
});
