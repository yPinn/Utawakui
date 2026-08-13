import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  reorderPlaylists,
  setPlaylistTracks,
  removeTrackFromAllPlaylists,
  upsertAlbum,
  setPlaylistKind,
  setPlaylistDescription,
  setPlaylistCover,
  buildPlaylistCoverUrl,
  migratePlaylistKinds,
  PLAYLISTS_FILENAME,
} from './playlists.js';

describe('loadPlaylists', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array when the file is missing', () => {
    expect(loadPlaylists(dir)).toEqual([]);
  });

  it('throws non-missing read errors instead of treating them as empty', () => {
    fs.mkdirSync(path.join(dir, PLAYLISTS_FILENAME));

    expect(() => loadPlaylists(dir)).toThrow();
  });

  it('returns an empty array for corrupted JSON and backs up the original', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(filePath, '{not valid json');

    expect(loadPlaylists(dir)).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${PLAYLISTS_FILENAME}.corrupted-`));
    expect(backups).toHaveLength(1);
  });

  it('returns an empty array and backs up when the top level has no playlists array', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify({ playlists: 'nope' }));

    expect(loadPlaylists(dir)).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('returns an empty array and backs up when the top level is an array', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]));

    expect(loadPlaylists(dir)).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('returns an empty array and backs up when the top level is null', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify(null));

    expect(loadPlaylists(dir)).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('drops a malformed entry without discarding the rest of the file', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        playlists: [
          { id: 'a', name: 'Good', trackIds: ['t1'] },
          { id: '', name: 'No id', trackIds: [] },
          null,
        ],
      }),
    );

    expect(loadPlaylists(dir)).toEqual([
      {
        id: 'a',
        name: 'Good',
        kind: 'playlist',
        description: '',
        trackIds: ['t1'],
        addedAt: {},
      },
    ]);
  });

  it('defaults kind to playlist when absent, and rejects an invalid kind', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          { id: 'a', name: 'No kind field', trackIds: [] },
          {
            id: 'b',
            name: 'Bogus kind',
            kind: 'not-a-real-kind',
            trackIds: [],
          },
        ],
      }),
    );

    const [a, b] = loadPlaylists(dir);
    expect(a.kind).toBe('playlist');
    expect(b.kind).toBe('playlist');
  });

  it('preserves a valid kind and source', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          {
            id: 'a',
            name: 'GOLDEN',
            kind: 'album',
            source: { platform: 'youtube', id: 'OLAK5uy_x' },
            trackIds: [],
          },
        ],
      }),
    );

    const [playlist] = loadPlaylists(dir);
    expect(playlist.kind).toBe('album');
    expect(playlist.source).toEqual({ platform: 'youtube', id: 'OLAK5uy_x' });
  });

  it('preserves a valid coverImage and description, capping description length', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          {
            id: 'a',
            name: 'X',
            coverImage: 'cover.jpg',
            description: 'x'.repeat(600),
            trackIds: [],
          },
        ],
      }),
    );

    const [playlist] = loadPlaylists(dir);
    expect(playlist.coverImage).toBe('cover.jpg');
    expect(playlist.description).toHaveLength(500);
  });

  it('drops a non-string or empty coverImage instead of keeping it', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          { id: 'a', name: 'A', coverImage: '', trackIds: [] },
          { id: 'b', name: 'B', coverImage: 42, trackIds: [] },
        ],
      }),
    );

    const [a, b] = loadPlaylists(dir);
    expect(a.coverImage).toBeUndefined();
    expect(b.coverImage).toBeUndefined();
  });

  it('drops a malformed source instead of keeping a partial object', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          {
            id: 'a',
            name: 'X',
            kind: 'album',
            source: { platform: 'youtube' },
            trackIds: [],
          },
        ],
      }),
    );

    const [playlist] = loadPlaylists(dir);
    expect(playlist.source).toBeUndefined();
  });

  it('sanitizes non-string trackIds instead of dropping the whole entry', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        playlists: [
          { id: 'a', name: 'Mix', trackIds: ['t1', 42, null, 't1', 't2'] },
        ],
      }),
    );

    const [playlist] = loadPlaylists(dir);
    expect(playlist.trackIds).toEqual(['t1', 't2']);
    expect(playlist.addedAt).toEqual({});
  });

  it('keeps valid addedAt values for surviving track ids only', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        playlists: [
          {
            id: 'a',
            name: 'Mix',
            trackIds: ['t1', 't2'],
            addedAt: {
              t1: '2026-08-10T01:02:03.000Z',
              t2: 'not a date',
              stale: '2026-08-10T04:05:06.000Z',
            },
          },
        ],
      }),
    );

    const [playlist] = loadPlaylists(dir);
    expect(playlist.addedAt).toEqual({
      t1: '2026-08-10T01:02:03.000Z',
    });
  });
});

describe('createPlaylist', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appends a new playlist with a trimmed name and empty trackIds', () => {
    const result = createPlaylist(dir, '  安可曲  ');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('安可曲');
    expect(result[0].trackIds).toEqual([]);
    expect(result[0].addedAt).toEqual({});
    expect(typeof result[0].id).toBe('string');
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it('uses the first default playlist number when no name is provided', () => {
    const result = createPlaylist(dir);

    expect(result[0].name).toBe('播放清單 #1');
  });

  it('uses the first unused default playlist number', () => {
    createPlaylist(dir);
    const [, second] = createPlaylist(dir);
    renamePlaylist(dir, second.id, '播放清單 #3');

    const result = createPlaylist(dir);

    expect(result.map((p) => p.name)).toEqual([
      '播放清單 #1',
      '播放清單 #3',
      '播放清單 #2',
    ]);
  });

  it('treats a blank explicit name as a request for a default name', () => {
    const result = createPlaylist(dir, '   ');

    expect(result[0].name).toBe('播放清單 #1');
  });

  it('assigns unique ids across two creates and preserves append order', () => {
    createPlaylist(dir, 'First');
    const result = createPlaylist(dir, 'Second');
    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
    expect(result.map((p) => p.name)).toEqual(['First', 'Second']);
  });

  it('succeeds even when the download directory does not exist yet', () => {
    const freshDir = path.join(dir, 'does-not-exist-yet');
    expect(() => createPlaylist(freshDir, 'First Playlist')).not.toThrow();
    expect(loadPlaylists(freshDir)).toHaveLength(1);
  });

  it('does not overwrite an unreadable playlist file with a new empty base', () => {
    fs.mkdirSync(path.join(dir, PLAYLISTS_FILENAME));

    expect(() => createPlaylist(dir, 'Should Not Save')).toThrow();
    expect(fs.statSync(path.join(dir, PLAYLISTS_FILENAME)).isDirectory()).toBe(
      true,
    );
  });

  it('persists across a fresh load', () => {
    createPlaylist(dir, 'Persisted');
    expect(loadPlaylists(dir)[0].name).toBe('Persisted');
  });

  it('leaves no leftover .tmp file after saving', () => {
    createPlaylist(dir, 'Song');
    expect(fs.existsSync(path.join(dir, `${PLAYLISTS_FILENAME}.tmp`))).toBe(
      false,
    );
  });
});

describe('renamePlaylist', () => {
  let dir;
  let id;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    id = createPlaylist(dir, 'Original')[0].id;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updates the name and persists it', () => {
    const result = renamePlaylist(dir, id, 'Renamed');
    expect(result[0].name).toBe('Renamed');
    expect(loadPlaylists(dir)[0].name).toBe('Renamed');
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    const before = loadPlaylists(dir);
    const result = renamePlaylist(dir, 'unknown-id', 'X');
    expect(result).toEqual(before);
  });
});

describe('setPlaylistDescription', () => {
  let dir;
  let id;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    id = createPlaylist(dir, 'Original')[0].id;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sets and persists a description', () => {
    const result = setPlaylistDescription(dir, id, '這是說明文字');
    expect(result[0].description).toBe('這是說明文字');
    expect(loadPlaylists(dir)[0].description).toBe('這是說明文字');
  });

  it('trims a non-string description to empty instead of throwing', () => {
    const result = setPlaylistDescription(dir, id, null);
    expect(result[0].description).toBe('');
  });

  it('caps description length at 500 characters', () => {
    const long = 'x'.repeat(600);
    const result = setPlaylistDescription(dir, id, long);
    expect(result[0].description).toHaveLength(500);
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    const before = loadPlaylists(dir);
    const result = setPlaylistDescription(dir, 'unknown-id', 'X');
    expect(result).toEqual(before);
  });
});

describe('setPlaylistCover', () => {
  let dir;
  let id;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    id = createPlaylist(dir, 'Original')[0].id;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sets a coverImage filename and persists it', () => {
    const result = setPlaylistCover(dir, id, 'cover.jpg');
    expect(result[0].coverImage).toBe('cover.jpg');
    expect(loadPlaylists(dir)[0].coverImage).toBe('cover.jpg');
  });

  it('clears coverImage back to undefined when passed null', () => {
    setPlaylistCover(dir, id, 'cover.jpg');
    const result = setPlaylistCover(dir, id, null);
    expect(result[0].coverImage).toBeUndefined();
    expect(loadPlaylists(dir)[0].coverImage).toBeUndefined();
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    const before = loadPlaylists(dir);
    const result = setPlaylistCover(dir, 'unknown-id', 'cover.jpg');
    expect(result).toEqual(before);
  });
});

describe('buildPlaylistCoverUrl', () => {
  it('builds a utawakui-media:// URL with both segments encoded', () => {
    expect(buildPlaylistCoverUrl('id with spaces', 'cover.jpg')).toBe(
      'utawakui-media://playlist-cover/id%20with%20spaces/cover.jpg',
    );
  });
});

describe('deletePlaylist', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes the matching playlist and leaves the rest', () => {
    createPlaylist(dir, 'Keep');
    const [, toDelete] = createPlaylist(dir, 'Remove');
    const result = deletePlaylist(dir, toDelete.id);
    expect(result.map((p) => p.name)).toEqual(['Keep']);
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    createPlaylist(dir, 'Keep');
    const before = loadPlaylists(dir);
    const result = deletePlaylist(dir, 'unknown-id');
    expect(result).toEqual(before);
  });
});

describe('reorderPlaylists', () => {
  let dir;
  let first;
  let second;
  let third;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    [first] = createPlaylist(dir, 'First');
    [, second] = createPlaylist(dir, 'Second');
    [, , third] = createPlaylist(dir, 'Third');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('moves a playlist before the target and persists the array order', () => {
    const result = reorderPlaylists(dir, third.id, first.id, 'before');

    expect(result.map((playlist) => playlist.name)).toEqual([
      'Third',
      'First',
      'Second',
    ]);
    expect(loadPlaylists(dir).map((playlist) => playlist.name)).toEqual([
      'Third',
      'First',
      'Second',
    ]);
  });

  it('moves a playlist after the target', () => {
    const result = reorderPlaylists(dir, first.id, third.id, 'after');

    expect(result.map((playlist) => playlist.name)).toEqual([
      'Second',
      'Third',
      'First',
    ]);
  });

  it('returns the list unchanged for unknown ids without writing', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    const before = fs.statSync(filePath).mtimeMs;
    const result = reorderPlaylists(dir, 'unknown', second.id, 'before');

    expect(result.map((playlist) => playlist.name)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(fs.statSync(filePath).mtimeMs).toBe(before);
  });

  it('is a no-op when the reordered array would not change', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    const before = fs.statSync(filePath).mtimeMs;
    const result = reorderPlaylists(dir, first.id, second.id, 'before');

    expect(result.map((playlist) => playlist.name)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(fs.statSync(filePath).mtimeMs).toBe(before);
  });
});

describe('setPlaylistTracks', () => {
  let dir;
  let id;

  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    id = createPlaylist(dir, 'List')[0].id;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('sets and persists the track order exactly', () => {
    vi.setSystemTime(new Date('2026-08-10T01:02:03.000Z'));
    const result = setPlaylistTracks(dir, id, ['c', 'a', 'b']);
    expect(result[0].trackIds).toEqual(['c', 'a', 'b']);
    expect(loadPlaylists(dir)[0].trackIds).toEqual(['c', 'a', 'b']);
    expect(result[0].addedAt).toEqual({
      c: '2026-08-10T01:02:03.000Z',
      a: '2026-08-10T01:02:03.000Z',
      b: '2026-08-10T01:02:03.000Z',
    });
  });

  it('round-trips a reorder of the same set exactly without changing addedAt', () => {
    vi.setSystemTime(new Date('2026-08-10T01:02:03.000Z'));
    setPlaylistTracks(dir, id, ['a', 'b', 'c']);
    vi.setSystemTime(new Date('2026-08-11T01:02:03.000Z'));
    const result = setPlaylistTracks(dir, id, ['b', 'c', 'a']);
    expect(result[0].trackIds).toEqual(['b', 'c', 'a']);
    expect(result[0].addedAt).toEqual({
      a: '2026-08-10T01:02:03.000Z',
      b: '2026-08-10T01:02:03.000Z',
      c: '2026-08-10T01:02:03.000Z',
    });
  });

  it('dedupes track ids', () => {
    vi.setSystemTime(new Date('2026-08-10T01:02:03.000Z'));
    const result = setPlaylistTracks(dir, id, ['a', 'b', 'a']);
    expect(result[0].trackIds).toEqual(['a', 'b']);
    expect(result[0].addedAt).toEqual({
      a: '2026-08-10T01:02:03.000Z',
      b: '2026-08-10T01:02:03.000Z',
    });
  });

  it('drops addedAt values for removed tracks', () => {
    vi.setSystemTime(new Date('2026-08-10T01:02:03.000Z'));
    setPlaylistTracks(dir, id, ['a', 'b']);

    const result = setPlaylistTracks(dir, id, ['b']);

    expect(result[0].trackIds).toEqual(['b']);
    expect(result[0].addedAt).toEqual({
      b: '2026-08-10T01:02:03.000Z',
    });
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    const before = loadPlaylists(dir);
    const result = setPlaylistTracks(dir, 'unknown-id', ['a']);
    expect(result).toEqual(before);
  });
});

describe('removeTrackFromAllPlaylists', () => {
  let dir;

  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('removes the track id from every playlist that has it, leaving others untouched', () => {
    vi.setSystemTime(new Date('2026-08-10T01:02:03.000Z'));
    const id1 = createPlaylist(dir, 'A')[0].id;
    const [, p2] = createPlaylist(dir, 'B');
    const id2 = p2.id;
    setPlaylistTracks(dir, id1, ['a', 'shared', 'b']);
    setPlaylistTracks(dir, id2, ['shared', 'c']);

    const result = removeTrackFromAllPlaylists(dir, 'shared');
    const byId = Object.fromEntries(result.map((p) => [p.id, p]));
    expect(byId[id1].trackIds).toEqual(['a', 'b']);
    expect(byId[id2].trackIds).toEqual(['c']);
    expect(byId[id1].addedAt).not.toHaveProperty('shared');
    expect(byId[id2].addedAt).not.toHaveProperty('shared');
  });

  it('is a no-op (and does not write) when the track is in no playlist', () => {
    const id = createPlaylist(dir, 'A')[0].id;
    setPlaylistTracks(dir, id, ['a', 'b']);
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    const before = fs.statSync(filePath).mtimeMs;

    const result = removeTrackFromAllPlaylists(dir, 'never-there');

    expect(result[0].trackIds).toEqual(['a', 'b']);
    expect(fs.statSync(filePath).mtimeMs).toBe(before);
  });
});

describe('upsertAlbum', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a new album collection when no matching source exists', () => {
    const result = upsertAlbum(dir, {
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'GOLDEN',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });
  });

  it('updates trackIds in place on a second call with the same source, without duplicating', () => {
    upsertAlbum(dir, {
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a'],
    });

    const result = upsertAlbum(dir, {
      name: 'GOLDEN (renamed by user, ignored here)',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].trackIds).toEqual(['a', 'b']);
  });

  it('does not overwrite a user-given name on update', () => {
    upsertAlbum(dir, {
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a'],
    });
    renamePlaylist(dir, loadPlaylists(dir)[0].id, 'My Renamed Album');

    const result = upsertAlbum(dir, {
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a', 'b'],
    });

    expect(result[0].name).toBe('My Renamed Album');
  });

  it('creates a separate album when the source id differs', () => {
    upsertAlbum(dir, {
      name: 'GOLDEN',
      source: { platform: 'youtube', id: 'OLAK5uy_x' },
      trackIds: ['a'],
    });
    const result = upsertAlbum(dir, {
      name: 'Nine Track Mind',
      source: { platform: 'youtube', id: 'OLAK5uy_y' },
      trackIds: ['b'],
    });

    expect(result).toHaveLength(2);
  });
});

describe('setPlaylistKind', () => {
  let dir;
  let id;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
    id = createPlaylist(dir, 'List')[0].id;
    setPlaylistTracks(dir, id, ['a', 'b']);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('converts a playlist to an album without touching trackIds/name', () => {
    const result = setPlaylistKind(dir, id, 'album');
    expect(result[0].kind).toBe('album');
    expect(result[0].name).toBe('List');
    expect(result[0].trackIds).toEqual(['a', 'b']);
  });

  it('rejects an invalid kind, leaving the playlist unchanged', () => {
    const before = loadPlaylists(dir);
    const result = setPlaylistKind(dir, id, 'not-a-kind');
    expect(result).toEqual(before);
  });

  it('returns the list unchanged for an unknown id, without throwing', () => {
    const before = loadPlaylists(dir);
    const result = setPlaylistKind(dir, 'unknown-id', 'album');
    expect(result).toEqual(before);
  });
});

describe('migratePlaylistKinds', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-playlists-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function classifyByFirstTrack(tracks) {
    return tracks.length > 0 && tracks[0]?.isAlbum ? 'album' : 'playlist';
  }

  it('does nothing when there is no existing file', () => {
    const changed = migratePlaylistKinds(dir, new Map(), classifyByFirstTrack);
    expect(changed).toBe(false);
    expect(fs.existsSync(path.join(dir, PLAYLISTS_FILENAME))).toBe(false);
  });

  it('stamps kind using the injected classifier and backs up the v1 file', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        playlists: [
          { id: 'a', name: 'GOLDEN', trackIds: ['t1', 't2'], addedAt: {} },
          { id: 'b', name: 'Mixed', trackIds: ['t3'], addedAt: {} },
        ],
      }),
    );
    const tracksById = new Map([
      ['t1', { isAlbum: true }],
      ['t2', { isAlbum: true }],
      ['t3', { isAlbum: false }],
    ]);

    const changed = migratePlaylistKinds(dir, tracksById, classifyByFirstTrack);

    expect(changed).toBe(true);
    const playlists = loadPlaylists(dir);
    expect(playlists.find((p) => p.id === 'a').kind).toBe('album');
    expect(playlists.find((p) => p.id === 'b').kind).toBe('playlist');
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${PLAYLISTS_FILENAME}.backup-v1-`));
    expect(backups).toHaveLength(1);
  });

  it('is a no-op once the file is already at the current version', () => {
    const filePath = path.join(dir, PLAYLISTS_FILENAME);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        playlists: [
          { id: 'a', name: 'X', kind: 'playlist', trackIds: [], addedAt: {} },
        ],
      }),
    );

    const changed = migratePlaylistKinds(dir, new Map(), () => 'album');

    expect(changed).toBe(false);
    expect(loadPlaylists(dir)[0].kind).toBe('playlist');
  });
});
