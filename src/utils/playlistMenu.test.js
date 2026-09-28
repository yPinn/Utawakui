import { describe, it, expect } from 'vitest';
import {
  PLAYLIST_MENU_ACTIONS,
  TRACK_MENU_ACTIONS,
  playlistDisplayName,
  addToPlaylistTargets,
  filterPlaylistTargets,
} from './playlistMenu.js';

describe('playlistDisplayName', () => {
  it('returns the playlist name when present', () => {
    expect(playlistDisplayName({ name: 'My Setlist' })).toBe('My Setlist');
  });

  it('falls back for an empty or missing name', () => {
    expect(playlistDisplayName({ name: '' })).toBe('(未命名歌單)');
    expect(playlistDisplayName({})).toBe('(未命名歌單)');
  });

  it('falls back for a null/undefined playlist', () => {
    expect(playlistDisplayName(null)).toBe('(未命名歌單)');
    expect(playlistDisplayName(undefined)).toBe('(未命名歌單)');
  });
});

describe('addToPlaylistTargets', () => {
  const playlists = [
    { id: 'p1', kind: 'playlist', trackIds: ['t1'] },
    { id: 'p2', kind: 'playlist', trackIds: [] },
    { id: 'album1', kind: 'album', trackIds: ['t1'] },
  ];

  it('always excludes albums', () => {
    expect(addToPlaylistTargets(playlists).map((p) => p.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('excludes the given playlist id when excludeId is passed', () => {
    expect(
      addToPlaylistTargets(playlists, { excludeId: 'p1' }).map((p) => p.id),
    ).toEqual(['p2']);
  });

  it('excludes playlists already containing excludeTrackId', () => {
    expect(
      addToPlaylistTargets(playlists, { excludeTrackId: 't1' }).map(
        (p) => p.id,
      ),
    ).toEqual(['p2']);
  });

  it('applies no self/track exclusion when neither option is passed', () => {
    expect(addToPlaylistTargets(playlists, {}).map((p) => p.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('combines both exclusions when both are passed', () => {
    const withExtra = [
      ...playlists,
      { id: 'p3', kind: 'playlist', trackIds: ['t1'] },
    ];
    expect(
      addToPlaylistTargets(withExtra, {
        excludeId: 'p1',
        excludeTrackId: 't1',
      }).map((p) => p.id),
    ).toEqual(['p2']);
  });
});

describe('filterPlaylistTargets', () => {
  const playlists = [
    { id: 'p1', name: 'Night Shift' },
    { id: 'p2', name: '夜間歌單' },
    { id: 'p3', name: 'Focus' },
  ];

  it('matches normalized playlist names without changing source order', () => {
    expect(
      filterPlaylistTargets(playlists, ' night ').map((item) => item.id),
    ).toEqual(['p1']);
    expect(
      filterPlaylistTargets(playlists, ' 夜間 ').map((item) => item.id),
    ).toEqual(['p2']);
  });

  it('returns all targets when the query is blank', () => {
    expect(filterPlaylistTargets(playlists, '  ')).toEqual(playlists);
  });
});

describe('PLAYLIST_MENU_ACTIONS', () => {
  it('has stable string values for cross-file dispatch', () => {
    expect(PLAYLIST_MENU_ACTIONS).toEqual({
      addToQueue: 'add-to-queue',
      addToPlaylist: 'add-to-playlist',
      editDetails: 'edit-details',
      delete: 'delete',
      createPlaylist: 'create-playlist',
      createFolder: 'create-folder',
      convertKind: 'convert-kind',
      download: 'download',
    });
  });
});

describe('TRACK_MENU_ACTIONS', () => {
  it('shares one stable vocabulary across library and Right Dock callers', () => {
    expect(TRACK_MENU_ACTIONS).toEqual({
      addToQueue: 'add-to-queue',
      removeFromQueue: 'remove-from-queue',
      addToPlaylist: 'add-to-playlist',
      createPlaylist: 'create-playlist',
      editMetadata: 'edit-metadata',
      removeFromPlaylist: 'remove-from-playlist',
      goToAlbum: 'go-to-album',
    });
  });
});
