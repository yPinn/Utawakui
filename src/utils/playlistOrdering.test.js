import { describe, it, expect } from 'vitest';
import { orderPlaylistsForDisplay } from './playlistOrdering.js';

function track(id, artist) {
  return { id, artist };
}

describe('orderPlaylistsForDisplay', () => {
  it('separates playlists from albums, preserving playlist input order', () => {
    const playlists = [
      { id: 'p1', kind: 'playlist', name: 'P1', trackIds: [] },
      { id: 'a1', kind: 'album', name: 'A1', trackIds: [] },
      { id: 'p2', kind: 'playlist', name: 'P2', trackIds: [] },
    ];
    const { playlistItems, albumItems } = orderPlaylistsForDisplay(
      playlists,
      new Map(),
    );
    expect(playlistItems.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(albumItems.map((a) => a.id)).toEqual(['a1']);
  });

  it('sorts albums by derived artist, alphabetically', () => {
    const tracksById = new Map([
      ['t1', track('t1', 'Charlie Puth')],
      ['t2', track('t2', 'BTS')],
      ['t3', track('t3', 'NewJeans')],
    ]);
    const playlists = [
      { id: 'a1', kind: 'album', name: 'Nine Track Mind', trackIds: ['t1'] },
      { id: 'a2', kind: 'album', name: 'LOVE YOURSELF', trackIds: ['t2'] },
      { id: 'a3', kind: 'album', name: 'New Jeans', trackIds: ['t3'] },
    ];
    const { albumItems } = orderPlaylistsForDisplay(playlists, tracksById);
    expect(albumItems.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
  });

  it('breaks a tied artist by album name', () => {
    const tracksById = new Map([
      ['t1', track('t1', 'BTS')],
      ['t2', track('t2', 'BTS')],
    ]);
    const playlists = [
      { id: 'a1', kind: 'album', name: 'Z Album', trackIds: ['t1'] },
      { id: 'a2', kind: 'album', name: 'A Album', trackIds: ['t2'] },
    ];
    const { albumItems } = orderPlaylistsForDisplay(playlists, tracksById);
    expect(albumItems.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('sorts an album with no derivable artist first (empty string)', () => {
    const playlists = [
      { id: 'a1', kind: 'album', name: 'Known', trackIds: ['t1'] },
      { id: 'a2', kind: 'album', name: 'Unknown', trackIds: [] },
    ];
    const tracksById = new Map([['t1', track('t1', 'Zed')]]);
    const { albumItems } = orderPlaylistsForDisplay(playlists, tracksById);
    expect(albumItems.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('returns empty arrays for no playlists', () => {
    expect(orderPlaylistsForDisplay([], new Map())).toEqual({
      playlistItems: [],
      albumItems: [],
    });
    expect(orderPlaylistsForDisplay(undefined, undefined)).toEqual({
      playlistItems: [],
      albumItems: [],
    });
  });
});
