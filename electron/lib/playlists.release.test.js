import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlaylist,
  createLocalRelease,
  loadPlaylists,
  migratePlaylistKinds,
  removeTrackFromAllPlaylists,
  renamePlaylist,
  setPlaylistKind,
  setPlaylistTracks,
  updatePlaylistReleaseInfo,
  upsertAlbum,
} from './playlists.js';

let dir;
const source = { platform: 'youtube', id: 'OLAK5uy_release' };
const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const release = (extra = {}) => ({
  id: 'album-a',
  kind: 'album',
  name: 'RASEN',
  source,
  description: 'keep description',
  coverImage: 'cover.jpg',
  trackIds: ['track-a', 'track-b'],
  addedAt: { 'track-a': '2026-01-01T00:00:00.000Z' },
  ...extra,
});
const file = () => path.join(dir, 'playlists.json');
function write(version, playlists) {
  fs.writeFileSync(file(), JSON.stringify({ version, playlists }));
}
function raw() {
  return JSON.parse(fs.readFileSync(file(), 'utf8'));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-release-migration-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('release collection migration', () => {
  it('reads v2 without writing, classifying, or changing source/order/identity', () => {
    write(2, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    expect(loadPlaylists(dir)[0]).toEqual(release());
    const classifier = vi.fn();
    expect(migratePlaylistKinds(dir, new Map(), classifier)).toBe(false);
    expect(classifier).not.toHaveBeenCalled();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it('backs up v2 before the first mutation and writes v3 without losing fields', () => {
    write(2, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    renamePlaylist(dir, 'album-a', 'renamed');
    expect(raw()).toEqual({
      version: 3,
      playlists: [release({ name: 'renamed' })],
    });
    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('playlists.json.backup-v2-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).toBe(before);
  });

  it('does not change v2 if its required backup cannot be written', () => {
    write(2, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('backup denied');
    });
    expect(() => renamePlaylist(dir, 'album-a', 'lost')).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it('rejects a future schema on both reads and existing mutation paths', () => {
    write(99, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    expect(() => loadPlaylists(dir)).toThrow();
    expect(() => createPlaylist(dir, 'unsafe')).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it('preserves corrupt data and fails closed instead of replacing it on next save', () => {
    fs.writeFileSync(file(), '{broken');
    expect(() => createPlaylist(dir, 'unsafe')).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe('{broken');
  });

  it('retains legacy kind migration for v1 only', () => {
    write(1, [{ id: 'a', name: 'old', trackIds: ['track-a'] }]);
    expect(
      migratePlaylistKinds(
        dir,
        new Map([['track-a', { id: 'track-a' }]]),
        () => 'album',
      ),
    ).toBe(true);
    expect(raw().version).toBe(3);
    expect(loadPlaylists(dir)[0].kind).toBe('album');
    expect(loadPlaylists(dir)[0].releaseInfo).toBeUndefined();
  });
});

describe('release metadata through all collection writers', () => {
  it('rejects invalid local release creation and collection overflow without dropping stored data', () => {
    write(3, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    for (const input of [
      { name: '', trackId: 'a', binding },
      { name: 'x'.repeat(201), trackId: 'a', binding },
      { name: 'Bad\u0000', trackId: 'a', binding },
      { name: 'Local', trackId: '../path', binding },
      { name: 'Local', trackId: 'a', binding: { path: 'private' } },
    ])
      expect(() => createLocalRelease(dir, input)).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
    write(
      3,
      Array.from({ length: 500 }, (_, index) =>
        release({ id: `album-${index}` }),
      ),
    );
    const full = fs.readFileSync(file(), 'utf8');
    expect(() =>
      createLocalRelease(dir, { name: 'Overflow', trackId: 'a', binding }),
    ).toThrow(expect.objectContaining({ code: 'RELEASE_LIMIT_REACHED' }));
    expect(fs.readFileSync(file(), 'utf8')).toBe(full);
  });
  it('keeps the original document if atomic local release creation cannot replace its file', () => {
    write(3, [release()]);
    const before = fs.readFileSync(file(), 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('atomic replace failed');
    });
    expect(() =>
      createLocalRelease(dir, { name: 'Local', trackId: 'a', binding }),
    ).toThrow('atomic replace failed');
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });
  it('starts release CAS on legacy album membership edits and source-backed kind round trips', () => {
    write(2, [release()]);
    setPlaylistTracks(dir, 'album-a', ['track-a']);
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(1);
    setPlaylistKind(dir, 'album-a', 'playlist');
    setPlaylistKind(dir, 'album-a', 'album');
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(3);
  });
  function classified(extra = {}) {
    write(2, [release(extra)]);
    return updatePlaylistReleaseInfo(dir, 'album-a', {
      expectedRevision: 0,
      set: { type: 'single' },
      leadTrackId: 'track-a',
    });
  }

  it('classifies without changing the collection kind, source, order or scalar metadata', () => {
    const [result] = classified();
    expect(result).toMatchObject(release());
    expect(result.releaseInfo.overrides.type).toBe('single');
    expect(result.releaseInfo.revision).toBe(1);
    expect(raw().version).toBe(3);
    renamePlaylist(dir, 'album-a', 'renamed');
    expect(loadPlaylists(dir)[0].releaseInfo).toEqual(result.releaseInfo);
  });

  it('preserves manual decisions on source reimport but prunes removed lead and bindings', () => {
    classified();
    const [result] = upsertAlbum(dir, {
      name: 'ignored',
      source,
      trackIds: ['track-b'],
    });
    expect(result.name).toBe('RASEN');
    expect(result.trackIds).toEqual(['track-b']);
    expect(result.releaseInfo.overrides.type).toBe('single');
    expect(result.releaseInfo.leadTrackId).toBeUndefined();
    expect(result.releaseInfo.revision).toBe(2);
  });

  it('does not increment release revision on a no-op membership sync', () => {
    classified();
    upsertAlbum(dir, { source, trackIds: ['track-a', 'track-b'] });
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(1);
  });

  it('rejects stale edits after membership changes and kind round trips', () => {
    classified();
    setPlaylistKind(dir, 'album-a', 'playlist');
    expect(() =>
      updatePlaylistReleaseInfo(dir, 'album-a', {
        expectedRevision: 1,
        set: { type: 'ep' },
      }),
    ).toThrow();
    setPlaylistKind(dir, 'album-a', 'album');
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(3);
    expect(() =>
      updatePlaylistReleaseInfo(dir, 'album-a', {
        expectedRevision: 1,
        set: { type: 'ep' },
      }),
    ).toThrow();
  });

  it('cleans a deleted member and invalidates the release editor, retaining collection identity', () => {
    classified();
    removeTrackFromAllPlaylists(dir, 'track-a');
    const [result] = loadPlaylists(dir);
    expect(result.id).toBe('album-a');
    expect(result.releaseInfo.revision).toBe(2);
    expect(result.releaseInfo.leadTrackId).toBeUndefined();
    expect(result.trackIds).toEqual(['track-b']);
  });

  it('initializes legacy source-less bindings only when explicitly organizing', () => {
    write(2, [release({ source: undefined })]);
    const [result] = updatePlaylistReleaseInfo(
      dir,
      'album-a',
      {
        expectedRevision: 0,
        set: { type: 'single' },
      },
      { bindings: { 'track-a': binding } },
    );
    expect(result.releaseInfo.localMemberBindings).toEqual({
      'track-a': binding,
      'track-b': null,
    });
    removeTrackFromAllPlaylists(dir, 'track-a');
    expect(loadPlaylists(dir)[0].releaseInfo.localMemberBindings).toEqual({
      'track-b': null,
    });
  });

  it('updates release metadata on the internal set-tracks path without changing the public read-only guard', () => {
    classified();
    setPlaylistTracks(dir, 'album-a', ['track-b']);
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(2);
  });

  it('marks unresolved local members on an explicit playlist to album conversion', () => {
    write(2, [release({ kind: 'playlist', source: undefined })]);
    const [result] = setPlaylistKind(dir, 'album-a', 'album', {
      bindings: { 'track-a': binding },
    });
    expect(result.releaseInfo.localMemberBindings).toEqual({
      'track-a': binding,
      'track-b': null,
    });
    expect(result.releaseInfo.revision).toBe(1);
  });

  it('fails a malformed v3 release document rather than stripping its data on an unrelated rename', () => {
    write(3, [
      release({
        releaseInfo: { revision: 1, overrides: { type: 'nonsense' } },
      }),
    ]);
    const before = fs.readFileSync(file(), 'utf8');
    expect(() => renamePlaylist(dir, 'album-a', 'unsafe')).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it('returns not-found for an edit against a deleted collection', () => {
    write(3, []);
    expect(() =>
      updatePlaylistReleaseInfo(dir, 'gone', {
        expectedRevision: 0,
        set: { type: 'single' },
      }),
    ).toThrow();
  });

  it('does not write an invalid document when a release revision is exhausted', () => {
    write(3, [
      release({
        releaseInfo: {
          revision: Number.MAX_SAFE_INTEGER,
          observed: {},
          overrides: {},
        },
      }),
    ]);
    const before = fs.readFileSync(file(), 'utf8');
    expect(() => setPlaylistKind(dir, 'album-a', 'playlist')).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });
});
