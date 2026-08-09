import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isServableFilename,
  resolveTrackPath,
  resolveSeparatedDir,
  resolveSeparatedFilePath,
  hasSeparation,
  listTracks,
  loadIndex,
  saveIndexEntry,
  buildRangeResponse,
  runBackfillPass,
  deleteTrack,
  INDEX_FILENAME,
} from './library.js';

describe('isServableFilename', () => {
  it('accepts known audio extensions', () => {
    expect(isServableFilename('dQw4w9WgXcQ.webm')).toBe(true);
    expect(isServableFilename('abc.mp3')).toBe(true);
  });

  it('rejects filenames with a path separator', () => {
    expect(isServableFilename('sub/abc.mp3')).toBe(false);
    expect(isServableFilename('sub\\abc.mp3')).toBe(false);
  });

  it('rejects non-audio extensions', () => {
    expect(isServableFilename('notes.txt')).toBe(false);
  });

  it('rejects a filename with no extension', () => {
    expect(isServableFilename('noext')).toBe(false);
  });

  it('rejects empty or non-string input', () => {
    expect(isServableFilename('')).toBe(false);
    expect(isServableFilename(null)).toBe(false);
  });
});

describe('resolveTrackPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-resolve-test-'));
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a normal file inside dir', () => {
    expect(resolveTrackPath(dir, 'abc.mp3')).toBe(
      path.join(path.resolve(dir), 'abc.mp3'),
    );
  });

  it('rejects ../ traversal', () => {
    expect(resolveTrackPath(dir, '../abc.mp3')).toBe(null);
  });

  it('rejects a decoded %2F traversal attempt', () => {
    expect(resolveTrackPath(dir, decodeURIComponent('..%2Fabc.mp3'))).toBe(
      null,
    );
  });

  it('rejects an absolute path', () => {
    expect(resolveTrackPath(dir, 'C:\\Windows\\x.mp3')).toBe(null);
  });

  it('rejects a filename containing a subdirectory', () => {
    expect(resolveTrackPath(dir, 'sub/abc.mp3')).toBe(null);
  });

  it('rejects a non-audio extension', () => {
    expect(resolveTrackPath(dir, 'abc.txt')).toBe(null);
  });
});

describe('resolveSeparatedDir', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepdir-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves to <dir>/.separated/<trackId>', () => {
    expect(resolveSeparatedDir(dir, 'dQw4w9WgXcQ')).toBe(
      path.join(path.resolve(dir), '.separated', 'dQw4w9WgXcQ'),
    );
  });

  it('rejects ../ traversal via trackId', () => {
    expect(resolveSeparatedDir(dir, '../evil')).toBe(null);
  });

  it('rejects an absolute trackId', () => {
    expect(resolveSeparatedDir(dir, 'C:\\Windows')).toBe(null);
  });

  it('rejects empty or non-string trackId', () => {
    expect(resolveSeparatedDir(dir, '')).toBe(null);
    expect(resolveSeparatedDir(dir, null)).toBe(null);
  });
});

describe('resolveSeparatedFilePath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves an allowlisted variant filename', () => {
    expect(resolveSeparatedFilePath(dir, 'abc', 'stems.wav')).toBe(
      path.join(path.resolve(dir), '.separated', 'abc', 'stems.wav'),
    );
  });

  it('rejects a variant filename outside the fixed allowlist', () => {
    expect(resolveSeparatedFilePath(dir, 'abc', 'stems.mp3')).toBe(null);
    expect(resolveSeparatedFilePath(dir, 'abc', 'instrumental.wav')).toBe(null);
    expect(resolveSeparatedFilePath(dir, 'abc', '../../secret')).toBe(null);
  });

  it('rejects a traversal attempt via trackId even with a valid variant name', () => {
    expect(resolveSeparatedFilePath(dir, '../evil', 'stems.wav')).toBe(null);
  });
});

describe('hasSeparation', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-hassep-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is false when nothing has been separated yet', () => {
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is false when the directory exists but stems.wav does not (interrupted separation)', () => {
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is true once stems.wav exists', () => {
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');
    expect(hasSeparation(dir, 'abc')).toBe(true);
  });
});

describe('listTracks', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-list-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array for a nonexistent directory', () => {
    expect(listTracks(path.join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('lists only servable audio files, ignoring others and subdirectories', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'def.flac'), 'y');
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'z');
    fs.mkdirSync(path.join(dir, 'subdir'));

    const tracks = listTracks(dir).sort((a, b) => a.id.localeCompare(b.id));
    expect(tracks.map((t) => t.id)).toEqual(['abc', 'def']);
    expect(tracks[0].url).toBe('utawakui-media://local/abc.mp3');
  });

  it('never lists library.json itself as a track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', { title: 'x' });
    expect(listTracks(dir)).toHaveLength(1);
  });

  it('merges title/artist/duration from the index and marks it complete', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    });

    const [track] = listTracks(dir);
    expect(track.title).toBe('夜に駆ける');
    expect(track.artist).toBe('YOASOBI');
    expect(track.duration).toBe(261);
    expect(track.needsBackfill).toBe(false);
  });

  it('sorts by artist first, then title, then filename fallback', () => {
    fs.writeFileSync(path.join(dir, 'zeta.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'alpha.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'orphan.mp3'), 'x');
    saveIndexEntry(dir, 'zeta', {
      title: 'Second Song',
      artist: 'Beta',
    });
    saveIndexEntry(dir, 'alpha', {
      title: 'First Song',
      artist: 'Alpha',
    });

    expect(listTracks(dir).map((track) => track.id)).toEqual([
      'alpha',
      'zeta',
      'orphan',
    ]);
  });

  it('sorts tracks by title within the same artist', () => {
    fs.writeFileSync(path.join(dir, 'later.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'earlier.mp3'), 'x');
    saveIndexEntry(dir, 'later', {
      title: 'B Song',
      artist: 'Same Artist',
    });
    saveIndexEntry(dir, 'earlier', {
      title: 'A Song',
      artist: 'Same Artist',
    });

    expect(listTracks(dir).map((track) => track.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('falls back to the id for title and needs backfill when unindexed', () => {
    fs.writeFileSync(path.join(dir, 'def.mp3'), 'x');
    const [track] = listTracks(dir);
    expect(track.title).toBe('def');
    expect(track.artist).toBeUndefined();
    expect(track.duration).toBeUndefined();
    expect(track.needsBackfill).toBe(true);
  });

  it('a title-only legacy entry still needs backfill (missing artist/duration)', () => {
    fs.writeFileSync(path.join(dir, 'legacy.mp3'), 'x');
    saveIndexEntry(dir, 'legacy', { title: 'Old Entry' });
    const [track] = listTracks(dir);
    expect(track.title).toBe('Old Entry');
    expect(track.needsBackfill).toBe(true);
  });

  it('never surfaces an orphaned index entry with no matching file', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'orphan', { title: 'Deleted Track' });
    expect(listTracks(dir).map((t) => t.id)).toEqual(['abc']);
  });

  it('deduplicates same-stem audio files so renderer keys and playlist ids do not collide', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'abc.webm'), 'y');

    const tracks = listTracks(dir);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('abc');
    expect(tracks[0].filename).toBe('abc.mp3');
  });

  it('reports hasSeparation false and omits stemsUrl when unseparated', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(false);
    expect(track.stemsUrl).toBeUndefined();
  });

  it('reports hasSeparation true with stemsUrl once stems.wav exists, without the .separated dir leaking in as a fake track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    const tracks = listTracks(dir);
    expect(tracks).toHaveLength(1);
    const [track] = tracks;
    expect(track.hasSeparation).toBe(true);
    expect(track.stemsUrl).toBe('utawakui-media://separated/abc/stems.wav');
  });
});

describe('loadIndex', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-index-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty index when the file is missing', () => {
    expect(loadIndex(dir)).toEqual({ version: 1, tracks: {} });
  });

  it('returns an empty index for corrupted JSON', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), '{not valid json');
    expect(loadIndex(dir)).toEqual({ version: 1, tracks: {} });
  });

  it('returns an empty index when the top level is an array', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify([1, 2, 3]));
    expect(loadIndex(dir)).toEqual({ version: 1, tracks: {} });
  });

  it('returns an empty index when the top level is null', () => {
    fs.writeFileSync(path.join(dir, INDEX_FILENAME), JSON.stringify(null));
    expect(loadIndex(dir)).toEqual({ version: 1, tracks: {} });
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

describe('buildRangeResponse', () => {
  let dir;
  let filePath;
  let content;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-range-test-'));
    filePath = path.join(dir, 'sample.mp3');
    content = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 256));
    fs.writeFileSync(filePath, content);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the full file with status 200 when there is no Range header', async () => {
    const res = buildRangeResponse(filePath, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe(String(content.length));
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content)).toBe(0);
  });

  it('serves a 206 partial response for a Range header', async () => {
    const res = buildRangeResponse(filePath, 'bytes=100-199');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 100-199/${content.length}`,
    );
    expect(res.headers.get('content-length')).toBe('100');
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(100, 200))).toBe(0);
  });

  it('serves to end of file for an open-ended Range', async () => {
    const res = buildRangeResponse(filePath, 'bytes=1900-');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 1900-1999/${content.length}`,
    );
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(1900, 2000))).toBe(0);
  });

  it('clamps a range end beyond the file size', () => {
    const res = buildRangeResponse(filePath, 'bytes=1990-5000');
    expect(res.headers.get('content-range')).toBe(
      `bytes 1990-1999/${content.length}`,
    );
  });

  it('falls back to a full 200 response for a malformed Range header', () => {
    expect(buildRangeResponse(filePath, 'not-a-range').status).toBe(200);
  });
});

describe('deleteTrack', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-delete-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes the audio file and returns true', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(false);
  });

  it('removes the matching .separated/<trackId> directory too', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(sepDir)).toBe(false);
  });

  it('removes the library.json entry', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', { title: 'Song' });

    deleteTrack(dir, 'abc');
    expect(loadIndex(dir).tracks.abc).toBeUndefined();
  });

  it('does not touch other tracks or their separated output', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'def.mp3'), 'y');
    const sepDir = path.join(dir, '.separated', 'def');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    deleteTrack(dir, 'abc');
    expect(fs.existsSync(path.join(dir, 'def.mp3'))).toBe(true);
    expect(fs.existsSync(sepDir)).toBe(true);
  });

  it('returns false and touches nothing when trackId has no matching file', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    expect(deleteTrack(dir, 'missing')).toBe(false);
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(true);
  });

  it('deletes the same deterministic representative listTracks exposes for duplicate stems', () => {
    fs.writeFileSync(path.join(dir, 'abc.webm'), 'y');
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');

    expect(listTracks(dir)[0].filename).toBe('abc.mp3');
    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'abc.webm'))).toBe(true);
  });
});

describe('runBackfillPass', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-backfill-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('only queries ids that look like real YouTube video ids', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    fs.writeFileSync(path.join(dir, '夜に駆ける.mp3'), 'x');

    const fetchMetadata = vi.fn(async () => ({
      title: 'Title',
      artist: 'Artist',
      duration: 100,
    }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ');
  });

  it('writes back title/artist/duration on a successful lookup', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));

    await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    const [track] = listTracks(dir);
    expect(track.title).toBe('Never Gonna Give You Up');
    expect(track.artist).toBe('Rick Astley');
    expect(track.duration).toBe(213);
  });

  it('does not retry an id that already failed this session', async () => {
    fs.writeFileSync(path.join(dir, 'aaaaaaaaaaa.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => null);

    const first = await runBackfillPass(dir, listTracks(dir), fetchMetadata);
    expect(first).toBe(false);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    fetchMetadata.mockClear();
    const second = await runBackfillPass(dir, listTracks(dir), fetchMetadata);
    expect(second).toBe(false);
    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});
