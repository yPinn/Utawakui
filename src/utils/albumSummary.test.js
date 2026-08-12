import { describe, it, expect } from 'vitest';
import { deriveAlbumSummary } from './albumSummary.js';

describe('deriveAlbumSummary', () => {
  it('returns undefined fields for an empty collection', () => {
    expect(deriveAlbumSummary([])).toEqual({
      artist: undefined,
      releaseYear: undefined,
    });
    expect(deriveAlbumSummary(null)).toEqual({
      artist: undefined,
      releaseYear: undefined,
    });
  });

  it('picks the unanimous artist and releaseYear', () => {
    const tracks = [
      { artist: 'Artist A', releaseYear: 2020 },
      { artist: 'Artist A', releaseYear: 2020 },
    ];
    expect(deriveAlbumSummary(tracks)).toEqual({
      artist: 'Artist A',
      releaseYear: 2020,
    });
  });

  it('picks the most common value when tracks disagree', () => {
    const tracks = [
      { artist: 'Artist A' },
      { artist: 'Artist A' },
      { artist: 'Artist B' },
    ];
    expect(deriveAlbumSummary(tracks).artist).toBe('Artist A');
  });

  it('ignores missing values when picking the most common one', () => {
    const tracks = [
      { artist: 'Artist A', releaseYear: undefined },
      { artist: undefined, releaseYear: 2019 },
    ];
    expect(deriveAlbumSummary(tracks)).toEqual({
      artist: 'Artist A',
      releaseYear: 2019,
    });
  });

  it('returns undefined releaseYear when no track has one', () => {
    const tracks = [{ artist: 'Artist A' }, { artist: 'Artist A' }];
    expect(deriveAlbumSummary(tracks).releaseYear).toBeUndefined();
  });
});
