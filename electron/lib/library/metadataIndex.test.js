import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadIndex,
  saveIndexEntry,
  migrateTrackAlbumMetadata,
} from './metadataIndex.js';
import { INDEX_FILENAME } from './constants.js';

describe('loadIndex', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-index-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty index when the file is missing', () => {
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index for corrupted JSON', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), '{not valid json');
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index when the top level is an array', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify([1, 2, 3]));
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });

  it('returns an empty index when the top level is null', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify(null));
    expect(loadIndex(dir)).toEqual({ version: 2, tracks: {} });
  });
});

describe('migrateTrackAlbumMetadata', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-migrate-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when there is no existing index file', () => {
    const changed = migrateTrackAlbumMetadata(dir, () => ({ album: 'X' }));
    expect(changed).toBe(false);
    expect(fs.existsSync(path.join(dir, INDEX_FILENAME))).toBe(false);
  });

  it('merges album/releaseYear from the injected reader into each entry', () => {
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 1,
        tracks: {
          a: { title: 'Track A', artist: 'Artist A', duration: 200 },
          b: { title: 'Track B', artist: 'Artist B', duration: 210 },
        },
      }),
    );

    const changed = migrateTrackAlbumMetadata(dir, (trackDir) => {
      const id = path.basename(trackDir);
      return id === 'a' ? { album: 'Album A', releaseYear: 2020 } : {};
    });

    expect(changed).toBe(true);
    const index = loadIndex(dir);
    expect(index.version).toBe(2);
    expect(index.tracks.a).toMatchObject({
      album: 'Album A',
      releaseYear: 2020,
    });
    expect(index.tracks.b.album).toBeUndefined();
  });

  it('does nothing and reports unchanged when the index file is corrupt JSON', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), '{ not valid json');

    const changed = migrateTrackAlbumMetadata(dir, () => ({ album: 'X' }));

    expect(changed).toBe(false);
  });

  it('is a no-op once the index is already at the current version', () => {
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 2,
        tracks: { a: { title: 'Track A' } },
      }),
    );

    const changed = migrateTrackAlbumMetadata(dir, () => ({
      album: 'Should Not Apply',
    }));

    expect(changed).toBe(false);
    expect(loadIndex(dir).tracks.a.album).toBeUndefined();
  });
});

describe('saveIndexEntry', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-save-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes an entry that can be read back', () => {
    saveIndexEntry(dir, 'abc', {
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });
    expect(loadIndex(dir).tracks.abc).toEqual({
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });
  });

  it('preserves other entries when saving a new one', () => {
    saveIndexEntry(dir, 'abc', { title: 'First' });
    saveIndexEntry(dir, 'orphan', { title: 'Second' });
    const { tracks } = loadIndex(dir);
    expect(Object.keys(tracks).sort()).toEqual(['abc', 'orphan']);
    expect(tracks.abc).toEqual({ title: 'First' });
  });
});
