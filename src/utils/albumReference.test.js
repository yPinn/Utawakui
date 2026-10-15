import { describe, expect, it } from 'vitest';
import { albumReferenceKey, deriveAlbumReference } from './albumReference.js';

const tracks = [
  { id: 'a', title: 'One', album: ' Message   In A Bottle ' },
  { id: 'b', title: 'Two', album: 'message in a bottle' },
  { id: 'c', title: 'Elsewhere', album: 'Another Album' },
];

describe('albumReference', () => {
  it('groups metadata-only tracks by a normalized album title without mutating membership', () => {
    const reference = deriveAlbumReference('Message In A Bottle', tracks);

    expect(reference).toMatchObject({
      name: 'Message In A Bottle',
      readOnly: true,
    });
    expect(reference.id).toMatch(/^album-reference:/u);
    expect(reference.tracks.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(tracks).toHaveLength(3);
  });

  it('normalizes Unicode and whitespace for stable matching', () => {
    expect(albumReferenceKey('  ＴＨＥ   BOOK ')).toBe('the book');
  });

  it('does not create a destination for empty or unmatched metadata', () => {
    expect(deriveAlbumReference('', tracks)).toBeNull();
    expect(deriveAlbumReference('Missing', tracks)).toBeNull();
  });
});
