import { describe, it, expect } from 'vitest';
import { albumPlaylistByTrackId } from './albumMembership.js';

describe('albumPlaylistByTrackId', () => {
  it('indexes tracks that belong to an album playlist', () => {
    const playlists = [
      { id: 'a1', kind: 'album', name: 'A1', trackIds: ['t1', 't2'] },
    ];
    const map = albumPlaylistByTrackId(playlists);
    expect(map.get('t1')).toBe(playlists[0]);
    expect(map.get('t2')).toBe(playlists[0]);
  });

  it('ignores non-album playlists', () => {
    const playlists = [
      { id: 'p1', kind: 'playlist', name: 'P1', trackIds: ['t1'] },
    ];
    const map = albumPlaylistByTrackId(playlists);
    expect(map.has('t1')).toBe(false);
  });

  it('first match wins when a track id appears in more than one album', () => {
    const playlists = [
      { id: 'a1', kind: 'album', name: 'A1', trackIds: ['t1'] },
      { id: 'a2', kind: 'album', name: 'A2', trackIds: ['t1'] },
    ];
    const map = albumPlaylistByTrackId(playlists);
    expect(map.get('t1')).toBe(playlists[0]);
  });

  it('returns an empty map for no playlists', () => {
    expect(albumPlaylistByTrackId([]).size).toBe(0);
    expect(albumPlaylistByTrackId(undefined).size).toBe(0);
  });
});
