import { describe, expect, it } from 'vitest';
import { deriveAlbumSupportingContent } from './albumSupportingContent.js';

function track(id, artist, releaseYear) {
  return { id, title: `曲目 ${id}`, artist, releaseYear };
}

describe('deriveAlbumSupportingContent', () => {
  it('derives related local albums and artist statistics from matching collections', () => {
    const currentTracks = [track('a-1', '王以太', 2018)];
    const otherTracks = [track('b-1', ' 王以太 ', 2024)];
    const olderTracks = [track('c-1', '王以太', 2020)];
    const unrelatedTracks = [track('d-1', '其他歌手', 2025)];

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
    });

    expect(result).toEqual({
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

  it('returns no supporting projection when the selected album has no artist', () => {
    expect(
      deriveAlbumSupportingContent({
        selectedAlbumId: 'album-a',
        selectedTracks: [{ id: 'a-1', title: '未知曲目' }],
        albumEntries: [],
        libraryTracks: [],
      }),
    ).toBeNull();
  });
});
