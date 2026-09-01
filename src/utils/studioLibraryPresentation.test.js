import { describe, expect, it } from 'vitest';
import {
  createStudioLibraryPresentation,
  formatStudioTrackSource,
} from './studioLibraryPresentation.js';

const tracks = [
  {
    id: 'track-a',
    title: '第一首歌',
    artist: '真實演出者',
    duration: 181,
    filename: '01-first.flac',
    releaseYear: 2024,
    sourceType: 'provider',
  },
  {
    id: 'track-b',
    title: '第二首歌',
    artist: '真實演出者',
    duration: 239,
    filename: '02-second.wav',
    releaseYear: 2024,
    sourceType: 'provider',
  },
  {
    id: 'local-track',
    title: '本機錄音',
    artist: '使用者',
    duration: 90,
    filename: 'take.mp3',
    sourceType: 'local-file',
  },
];

describe('Studio Library real collection presentation', () => {
  it('projects one real album in authored order without creating new state', () => {
    const album = {
      id: 'album-1',
      kind: 'album',
      name: '真實專輯',
      description: '從本機曲庫讀取的專輯。',
      coverUrl: 'utawakui-media://playlist/album-1/cover.jpg',
      trackIds: ['track-b', 'track-a'],
    };

    const result = createStudioLibraryPresentation({
      selectedPlaylist: album,
      libraryView: 'all',
      tracks,
    });

    expect(result).toMatchObject({
      collectionType: 'album',
      kindLabel: '本機專輯',
      title: '真實專輯',
      description: '從本機曲庫讀取的專輯。',
      coverUrl: album.coverUrl,
      canCollage: false,
    });
    expect(result.tracks.map((track) => track.id)).toEqual([
      'track-b',
      'track-a',
    ]);
    expect(result.summary).toContain('真實演出者');
    expect(result.summary).toContain('2024');
    expect(result.summary).toContain('2 首曲目');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        { id: 'track-count', label: '曲目', value: '2 首' },
        { id: 'duration', label: '總長', value: '7 分' },
        { id: 'formats', label: '格式', value: 'WAV · FLAC' },
      ]),
    );
  });

  it('adapts the same projection to playlists and library roots', () => {
    const playlistResult = createStudioLibraryPresentation({
      selectedPlaylist: {
        id: 'playlist-1',
        kind: 'playlist',
        name: '練習清單',
        trackIds: ['track-a'],
      },
      libraryView: 'all',
      tracks,
    });
    const localResult = createStudioLibraryPresentation({
      selectedPlaylist: null,
      libraryView: 'local',
      tracks,
    });
    const emptyLibraryResult = createStudioLibraryPresentation({
      selectedPlaylist: null,
      libraryView: 'all',
      tracks: null,
    });

    expect(playlistResult).toMatchObject({
      collectionType: 'playlist',
      kindLabel: '本機播放清單',
      title: '練習清單',
    });
    expect(localResult).toMatchObject({
      collectionType: 'library',
      kindLabel: '本機曲庫',
      title: '本機曲目',
    });
    expect(localResult.tracks.map((track) => track.id)).toEqual([
      'local-track',
    ]);
    expect(emptyLibraryResult).toMatchObject({
      title: '全部曲目',
      description: '',
      coverUrl: '',
      facts: [
        { id: 'track-count', label: '曲目', value: '0 首' },
        { id: 'duration', label: '總長', value: '—' },
        { id: 'formats', label: '格式', value: '—' },
        { id: 'collection-type', label: '類型', value: '本機曲庫' },
      ],
    });
  });

  it('derives a bounded local source label from the media filename', () => {
    expect(formatStudioTrackSource(tracks[0])).toBe('本機 FLAC');
    expect(formatStudioTrackSource({ filename: 'unknown' })).toBe('本機音訊');
    expect(formatStudioTrackSource({})).toBe('本機音訊');
  });
});
