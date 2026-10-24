import { describe, it, expect } from 'vitest';
import {
  albumPlaylistByTrackId,
  albumPlaylistsByTrackId,
} from './albumMembership.js';

describe('albumPlaylistByTrackId', () => {
  it('preserves every release in stable order and prefers the current release context only for the primary destination', () => {
    const releases = [
      { id: 'a', kind: 'album', trackIds: ['t'] },
      { id: 'b', kind: 'album', trackIds: ['t'] },
    ];
    expect(albumPlaylistsByTrackId(releases).get('t')).toEqual(releases);
    expect(
      albumPlaylistByTrackId(releases, { preferredCollectionId: 'b' }).get('t'),
    ).toBe(releases[1]);
    expect(albumPlaylistByTrackId(releases).get('t')).toBe(releases[0]);
  });
  it('does not expose unknown or changed local membership as a valid destination', () => {
    const releases = [
      {
        id: 'a',
        kind: 'album',
        trackIds: ['t'],
        requiresMembershipVerification: true,
      },
    ];
    expect(albumPlaylistsByTrackId(releases).has('t')).toBe(false);
    expect(
      albumPlaylistsByTrackId(releases, {
        trackIdsForCollection: () => ['t'],
      }).get('t'),
    ).toEqual(releases);
  });
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
