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

  it('parses a youtu.be short link', () => {
    expect(parsePlatformLink('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      platform: 'youtube',
      type: 'video',
      id: 'dQw4w9WgXcQ',
    });
  });

  it('returns null for garbage input that is not a URL', () => {
    expect(parsePlatformLink('not a url at all')).toBeNull();
  });

  it('returns null for a recognized YouTube host with no resolvable video id', () => {
    expect(
      parsePlatformLink('https://www.youtube.com/channel/UCxxxxxxxxxxxx'),
    ).toBeNull();
  });

  it('returns null for a recognized platform host whose path matches no known pattern', () => {
    expect(parsePlatformLink('https://tidal.com/browse/artist/12345')).toBe(
      null,
    );
  });

  it('returns null for a host that matches no known platform at all', () => {
    expect(parsePlatformLink('https://example.com/track/123')).toBeNull();
  });

  it('returns null for a youtu.be link whose remaining id is not a valid video id', () => {
    expect(parsePlatformLink('https://youtu.be/short')).toBeNull();
  });

  it('parses an Apple Music album URL without a song-specific `i` param', () => {
    expect(
      parsePlatformLink('https://music.apple.com/tw/album/example/1721054880'),
    ).toMatchObject({
      platform: 'appleMusic',
      type: 'album',
      id: '1721054880',
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

  it('returns null when no usable title can be found', () => {
    expect(normalizeMetadataCandidate({ artist: 'Someone' })).toBeNull();
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
  it('sorts multiple external candidates by confidence, high before medium', () => {
    expect(
      buildLyricsMetadataProfiles(
        { title: 'Track Title', artist: 'Track Artist' },
        [
          { title: 'Medium A', artist: 'Artist A', confidence: 'medium' },
          { title: 'High A', artist: 'Artist A', platform: 'spotify' },
          { title: 'High B', artist: 'Artist B', platform: 'deezer' },
          { title: 'Medium B', artist: 'Artist B', confidence: 'medium' },
        ],
        { includeTrackFallback: false },
      ).map((profile) => profile.title),
    ).toEqual(['High A', 'High B', 'Medium A', 'Medium B']);
  });

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

  it('reads candidates from track.metadataCandidates when enrichments/options are omitted', () => {
    expect(
      buildLyricsMetadataProfiles({
        title: 'From Track Candidates',
        artist: 'Someone',
        metadataCandidates: [
          { title: 'From Track Candidates', artist: 'Someone' },
          { title: 'From Track Candidates', artist: 'Someone' }, // exact duplicate, deduped
        ],
      }).map((profile) => profile.title),
    ).toEqual(['From Track Candidates']);
  });

  it('falls back to an empty candidate list when enrichments is not an array', () => {
    expect(
      buildLyricsMetadataProfiles({ title: 'Track Only' }, null).map(
        (profile) => profile.title,
      ),
    ).toEqual(['Track Only']);
  });

  it('silently drops a candidate whose title normalizes to nothing comparable', () => {
    expect(
      buildLyricsMetadataProfiles(
        { title: 'Track Only' },
        [{ title: '!!!', artist: 'Punctuation Only' }],
        { includeTrackFallback: false },
      ),
    ).toEqual([]);
  });

  it('skips the track fallback silently when the track itself has no usable title', () => {
    expect(buildLyricsMetadataProfiles({ artist: 'No Title Here' })).toEqual(
      [],
    );
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
