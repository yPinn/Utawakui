import { describe, expect, it } from 'vitest';
import { deriveAlbumSupportingContent } from './albumSupportingContent.js';

function track(id, artist, releaseYear) {
  return { id, title: `曲目 ${id}`, artist, releaseYear };
}

describe('deriveAlbumSupportingContent', () => {
  it('derives related local albums and artist statistics from the artist index', () => {
    const currentTracks = [track('a-1', '王以太', 2018)];
    const otherTracks = [track('b-1', '王以太', 2024)];
    const olderTracks = [track('c-1', '王以太, 艾热', 2020)];
    const unrelatedTracks = [track('d-1', '其他歌手', 2025)];
    const artistIndex = {
      artists: [
        {
          id: 'artist-wang',
          name: '王以太',
          trackIds: ['a-1', 'b-1', 'c-1', 'loose-1'],
        },
        { id: 'artist-air', name: '艾热', trackIds: ['c-1'] },
        { id: 'artist-other', name: '其他歌手', trackIds: ['d-1'] },
      ],
      trackArtistIds: {
        'a-1': ['artist-wang'],
        'b-1': ['artist-wang'],
        'c-1': ['artist-wang', 'artist-air'],
        'd-1': ['artist-other'],
        'loose-1': ['artist-wang'],
      },
    };

    const result = deriveAlbumSupportingContent({
      selectedAlbumId: 'album-a',
      selectedTracks: currentTracks,
      albumEntries: [
        {
          collection: { id: 'album-a', kind: 'album', name: '演出者' },
          tracks: currentTracks,
        },
        {
          collection: {
            id: 'album-b',
            kind: 'album',
            name: '最新專輯',
            coverUrl: 'utawakui-media://playlist/album-b/cover.jpg',
          },
          tracks: otherTracks,
        },
        {
          collection: { id: 'album-c', kind: 'album', name: '較早專輯' },
          tracks: olderTracks,
        },
        {
          collection: { id: 'album-d', kind: 'album', name: '不相關專輯' },
          tracks: unrelatedTracks,
        },
      ],
      libraryTracks: [
        ...currentTracks,
        ...otherTracks,
        ...olderTracks,
        track('loose-1', '王以太', 2022),
        ...unrelatedTracks,
      ],
      artistIndex,
    });

    expect(result).toEqual({
      artistId: 'artist-wang',
      artist: '王以太',
      relatedAlbums: [
        {
          id: 'album-b',
          name: '最新專輯',
          coverUrl: 'utawakui-media://playlist/album-b/cover.jpg',
          tracks: otherTracks,
          releaseYear: 2024,
        },
        {
          id: 'album-c',
          name: '較早專輯',
          coverUrl: '',
          tracks: olderTracks,
          releaseYear: 2020,
        },
      ],
      summary: {
        albumCount: 3,
        trackCount: 4,
        yearStart: 2018,
        yearEnd: 2024,
      },
    });
  });

  it('returns no supporting projection without a credited artist', () => {
    expect(
      deriveAlbumSupportingContent({
        selectedAlbumId: 'album-a',
        selectedTracks: [{ id: 'a-1', title: '未知曲目' }],
        albumEntries: [],
        libraryTracks: [],
        artistIndex: { artists: [], trackArtistIds: {} },
      }),
    ).toBeNull();
  });

  it('waits for the artist index before projecting', () => {
    expect(
      deriveAlbumSupportingContent({
        selectedAlbumId: 'album-a',
        selectedTracks: [track('a-1', '王以太', 2018)],
        albumEntries: [],
        libraryTracks: [],
        artistIndex: null,
      }),
    ).toBeNull();
  });
});
