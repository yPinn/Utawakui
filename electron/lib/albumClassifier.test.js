import { describe, it, expect } from 'vitest';
import { classifyCollectionKind } from './albumClassifier.js';

function tracks(albums) {
  return albums.map((album) => ({ album }));
}

describe('classifyCollectionKind', () => {
  it('classifies a single track as a playlist regardless of album', () => {
    expect(classifyCollectionKind(tracks(['Same Album']))).toBe('playlist');
  });

  it('classifies an empty collection as a playlist', () => {
    expect(classifyCollectionKind([])).toBe('playlist');
    expect(classifyCollectionKind(null)).toBe('playlist');
    expect(classifyCollectionKind(undefined)).toBe('playlist');
  });

  it('classifies multiple tracks sharing one album as an album', () => {
    expect(classifyCollectionKind(tracks(['GOLDEN', 'GOLDEN', 'GOLDEN']))).toBe(
      'album',
    );
  });

  it('is case- and whitespace-insensitive when comparing album names', () => {
    expect(
      classifyCollectionKind(tracks(['GOLDEN', 'golden', '  Golden  '])),
    ).toBe('album');
  });

  it('classifies tracks each with a distinct album as a playlist', () => {
    expect(
      classifyCollectionKind(tracks(['Album A', 'Album B', 'Album C'])),
    ).toBe('playlist');
  });

  it('tolerates one stray track without breaking a real album (coverage >= 75%)', () => {
    // 3 of 4 share an album (75% coverage) — a bonus track with no album
    // metadata shouldn't flip a real album into "playlist".
    expect(
      classifyCollectionKind(tracks(['GOLDEN', 'GOLDEN', 'GOLDEN', undefined])),
    ).toBe('album');
  });

  it('falls to playlist when coverage drops below the 75% threshold', () => {
    // 2 of 3 share an album — coverage is 2/3 (~67%), below threshold.
    expect(
      classifyCollectionKind(tracks(['GOLDEN', 'GOLDEN', undefined])),
    ).toBe('playlist');
  });

  it('classifies a collection with no album metadata at all as a playlist', () => {
    expect(classifyCollectionKind(tracks([undefined, undefined]))).toBe(
      'playlist',
    );
  });
});
