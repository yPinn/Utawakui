import { describe, expect, it } from 'vitest';
import {
  compareSetlistLibraryTrackOrder,
  sortSetlistLibraryTracks,
  sortSetlistLocalTracks,
} from './trackSourceDisplay.js';

describe('sortSetlistLocalTracks', () => {
  it('returns only local-file tracks sorted by title', () => {
    const tracks = [
      { id: 'yt-a', title: 'A Song', artist: 'Alpha Artist' },
      {
        id: 'local-z',
        title: 'Zoo',
        artist: 'A Local Artist',
        sourceType: 'local-file',
      },
      { id: 'yt-b', title: 'B Song', artist: 'Beta Artist' },
      {
        id: 'local-a',
        title: 'Apple',
        artist: 'Z Local Artist',
        sourceType: 'local-file',
      },
    ];

    expect(sortSetlistLocalTracks(tracks).map((track) => track.id)).toEqual([
      'local-a',
      'local-z',
    ]);
    expect(tracks.map((track) => track.id)).toEqual([
      'yt-a',
      'local-z',
      'yt-b',
      'local-a',
    ]);
  });

  it('uses id as the local title fallback for untitled tracks', () => {
    const tracks = [
      { id: 'zeta', sourceType: 'local-file' },
      { id: 'alpha', sourceType: 'local-file' },
    ];

    expect(sortSetlistLocalTracks(tracks).map((track) => track.id)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});

describe('sortSetlistLibraryTracks', () => {
  it('returns only non-local tracks sorted by artist, then title', () => {
    const tracks = [
      { id: 'local-a', title: 'Apple', sourceType: 'local-file' },
      { id: 'song-z', title: 'Zoo', artist: 'Beta' },
      { id: 'song-a2', title: 'Apple', artist: 'Alpha' },
      { id: 'song-b', title: 'Ballad', artist: 'Alpha' },
      { id: 'song-a1', title: 'Another', artist: 'Alpha' },
    ];

    expect(sortSetlistLibraryTracks(tracks).map((track) => track.id)).toEqual([
      'song-a1',
      'song-a2',
      'song-b',
      'song-z',
    ]);
  });

  it('sorts non-local tracks by artist, then title', () => {
    const tracks = [
      { id: 'song-z', title: 'Zoo', artist: 'Beta' },
      { id: 'song-a2', title: 'Apple', artist: 'Alpha' },
      { id: 'song-b', title: 'Ballad', artist: 'Alpha' },
      { id: 'song-a1', title: 'Another', artist: 'Alpha' },
    ];

    expect(sortSetlistLibraryTracks(tracks).map((track) => track.id)).toEqual([
      'song-a1',
      'song-a2',
      'song-b',
      'song-z',
    ]);
  });

  it('uses id as the alphabetic fallback for untitled tracks', () => {
    expect(
      [{ id: 'zeta' }, { id: 'alpha' }].sort(compareSetlistLibraryTrackOrder),
    ).toEqual([{ id: 'alpha' }, { id: 'zeta' }]);
  });
});
