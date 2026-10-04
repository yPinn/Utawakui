import { describe, expect, it } from 'vitest';
import {
  compareSetlistLibraryTrackOrder,
  sortSetlistLibraryTracks,
  sortSetlistLocalTracks,
} from './trackSourceDisplay.js';

describe('sortSetlistLocalTracks', () => {
  it('returns only local-file tracks sorted by importedAt newest first', () => {
    const tracks = [
      {
        id: 'yt-a',
        title: 'A Song',
        artist: 'Alpha Artist',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'local-z',
        title: 'Zoo',
        artist: 'A Local Artist',
        sourceType: 'local-file',
        importedAt: '2026-10-04T12:00:00.000Z',
      },
      {
        id: 'yt-b',
        title: 'B Song',
        artist: 'Beta Artist',
        importedAt: '2026-10-04T11:00:00.000Z',
      },
      {
        id: 'local-a',
        title: 'Apple',
        artist: 'Z Local Artist',
        sourceType: 'local-file',
        importedAt: '2026-10-04T09:00:00.000Z',
      },
    ];

    expect(sortSetlistLocalTracks(tracks).map((track) => track.id)).toEqual([
      'local-z',
      'local-a',
    ]);
    expect(tracks.map((track) => track.id)).toEqual([
      'yt-a',
      'local-z',
      'yt-b',
      'local-a',
    ]);
  });

  it('uses the existing title/id order when added times are missing', () => {
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
  it('returns only non-local tracks sorted by importedAt newest first', () => {
    const tracks = [
      {
        id: 'local-a',
        title: 'Apple',
        sourceType: 'local-file',
        importedAt: '2026-10-05T00:00:00.000Z',
      },
      {
        id: 'song-z',
        title: 'Zoo',
        artist: 'Beta',
        importedAt: '2026-10-04T09:00:00.000Z',
      },
      {
        id: 'song-a2',
        title: 'Apple',
        artist: 'Alpha',
        importedAt: '2026-10-04T12:00:00.000Z',
      },
      {
        id: 'song-b',
        title: 'Ballad',
        artist: 'Alpha',
        importedAt: '2026-10-04T11:00:00.000Z',
      },
      {
        id: 'song-a1',
        title: 'Another',
        artist: 'Alpha',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
    ];

    expect(sortSetlistLibraryTracks(tracks).map((track) => track.id)).toEqual([
      'song-a2',
      'song-b',
      'song-a1',
      'song-z',
    ]);
  });

  it('uses artist/title as a deterministic tie-breaker', () => {
    const tracks = [
      {
        id: 'song-z',
        title: 'Zoo',
        artist: 'Beta',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'song-a2',
        title: 'Apple',
        artist: 'Alpha',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'song-b',
        title: 'Ballad',
        artist: 'Alpha',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
      {
        id: 'song-a1',
        title: 'Another',
        artist: 'Alpha',
        importedAt: '2026-10-04T10:00:00.000Z',
      },
    ];

    expect(sortSetlistLibraryTracks(tracks).map((track) => track.id)).toEqual([
      'song-a1',
      'song-a2',
      'song-b',
      'song-z',
    ]);
  });

  it('places missing or invalid added times after dated tracks', () => {
    expect(
      [
        { id: 'missing' },
        { id: 'new', importedAt: '2026-10-04T10:00:00.000Z' },
        { id: 'invalid', importedAt: 'not-a-date' },
      ].sort(compareSetlistLibraryTrackOrder),
    ).toEqual([
      { id: 'new', importedAt: '2026-10-04T10:00:00.000Z' },
      { id: 'invalid', importedAt: 'not-a-date' },
      { id: 'missing' },
    ]);
  });
});
