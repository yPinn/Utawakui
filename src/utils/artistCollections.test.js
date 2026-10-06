import { describe, expect, it } from 'vitest';
import { albumArtistId, albumsForArtist } from './artistCollections.js';

const trackArtistIds = {
  t1: ['artist-yoasobi'],
  t2: ['artist-yoasobi'],
  t3: ['artist-yoasobi', 'artist-midories'],
  t4: ['artist-guest'],
};

describe('albumArtistId', () => {
  it('attributes an album to the artist credited on most member tracks', () => {
    expect(
      albumArtistId([{ id: 't1' }, { id: 't2' }, { id: 't3' }], trackArtistIds),
    ).toBe('artist-yoasobi');
  });

  it('keeps the first credited artist on a tie', () => {
    expect(albumArtistId([{ id: 't4' }, { id: 't1' }], trackArtistIds)).toBe(
      'artist-guest',
    );
  });

  it('returns undefined when no member track is credited', () => {
    expect(albumArtistId([{ id: 'x' }], trackArtistIds)).toBeUndefined();
    expect(albumArtistId([], undefined)).toBeUndefined();
  });
});

describe('albumsForArtist', () => {
  const entries = [
    {
      collection: { id: 'a', kind: 'album' },
      tracks: [{ id: 't1' }, { id: 't3' }],
    },
    { collection: { id: 'b', kind: 'album' }, tracks: [{ id: 't4' }] },
    { collection: { id: 'p', kind: 'playlist' }, tracks: [{ id: 't2' }] },
  ];

  it('lists only albums attributed to the artist', () => {
    expect(
      albumsForArtist('artist-yoasobi', entries, trackArtistIds).map(
        ({ collection }) => collection.id,
      ),
    ).toEqual(['a']);
  });

  it('does not place an album on a guest-only artist page', () => {
    expect(albumsForArtist('artist-midories', entries, trackArtistIds)).toEqual(
      [],
    );
  });
});
