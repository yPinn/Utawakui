import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  refreshTrackMetadataFromSidecars,
  listTracks,
  updateTrackMetadata,
  deleteTrack,
} from './tracks.js';
import { loadIndex, saveIndexEntry } from './metadataIndex.js';
import {
  recordSeparationResult,
  selectSeparationResult,
} from './separationManifest.js';
import { importLocalAudioFiles } from './importLocal.js';
import { INDEX_FILENAME } from './constants.js';

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
    expect(tracks[0].url).toBe('utawakui-media://track/abc/audio.mp3');
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(dir, 'abc.mp3'))).toBe(false);
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

  it('merges album/releaseYear from the index but omits needsBackfill for missing album', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Track Name',
      artist: 'Some Artist',
      duration: 200,
      album: 'Some Album',
      releaseYear: 2018,
    });

    const [track] = listTracks(dir);
    expect(track.album).toBe('Some Album');
    expect(track.releaseYear).toBe(2018);
    expect(track.needsBackfill).toBe(false);
  });

  it('leaves album/releaseYear undefined without forcing needsBackfill', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Track Name',
      artist: 'Some Artist',
      duration: 200,
    });

    const [track] = listTracks(dir);
    expect(track.album).toBeUndefined();
    expect(track.releaseYear).toBeUndefined();
    expect(track.needsBackfill).toBe(false);
  });

  it('lists a legacy (unmigrated) track and dedupes same-stem duplicates when migration cannot move the file', () => {
    fs.writeFileSync(path.join(dir, 'track.flac'), 'x');
    fs.writeFileSync(path.join(dir, 'track.mp3'), 'y');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: file is locked');
    });

    let tracks;
    try {
      tracks = listTracks(dir);
    } finally {
      renameSpy.mockRestore();
    }

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track');
    // compareFilenames sorts 'track.flac' before 'track.mp3'; the first
    // sorted file becomes the surviving representative and the same-stem
    // duplicate is deduped away rather than appearing as a second track.
    expect(tracks[0].filename).toBe('track.flac');
    expect(tracks[0].url).toBe('utawakui-media://local/track.flac');
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
    expect(
      fs.existsSync(path.join(dir, '.duplicates', 'abc', 'abc.webm')),
    ).toBe(true);
  });

  it('reports hasSeparation false and omits stemsUrl when unseparated', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(false);
    expect(track.stemsUrl).toBeUndefined();
    expect(track.separation).toBeUndefined();
  });

  it('migrates a legacy flat stems.wav + separation.json sidecar into the per-preset layout', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'x');
    fs.writeFileSync(
      path.join(trackDir, 'separation.json'),
      JSON.stringify({
        version: 1,
        modelId: 'inst-hq3',
        presetId: 'inst-hq3',
        separatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(true);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/inst-hq3.wav',
    );
    expect(track.separation).toEqual({
      selectedRecipeId: 'general',
      results: {
        general: {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-inst-hq3-v1',
          modelIds: ['inst-hq3'],
          artifactFilename: 'inst-hq3.wav',
          completedAt: '2026-01-01T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
        },
      },
    });
    expect(fs.existsSync(path.join(trackDir, 'stems.wav'))).toBe(false);
    expect(fs.existsSync(path.join(trackDir, 'separation.json'))).toBe(false);
    expect(
      fs.existsSync(path.join(trackDir, 'separations', 'inst-hq3.wav')),
    ).toBe(true);
  });

  it('migrates a legacy stems.wav with no sidecar, falling back to the standard/kara2 guess', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'x');

    const [track] = listTracks(dir);
    expect(track.hasSeparation).toBe(true);
    expect(track.separation.selectedRecipeId).toBe('quick');
    expect(track.separation.results.quick.modelIds).toEqual(['kara2']);
    expect(
      fs.existsSync(path.join(trackDir, 'separations', 'standard.wav')),
    ).toBe(true);
  });

  it('reports hasSeparation true with stemsUrl once a result exists, without the legacy .separated dir leaking in as a fake track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    const tracks = listTracks(dir);
    expect(tracks).toHaveLength(1);
    const [track] = tracks;
    expect(track.hasSeparation).toBe(true);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/standard.wav',
    );
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'stems.wav'))).toBe(
      false,
    );
    expect(
      fs.existsSync(
        path.join(dir, 'tracks', 'abc', 'separations', 'standard.wav'),
      ),
    ).toBe(true);
  });

  it('exposes multiple results and lets the selected one drive stemsUrl', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    fs.writeFileSync(path.join(separationsDir, 'inst-hq3.wav'), 'y');
    recordSeparationResult(separationsDir, {
      recipeId: 'standard',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      modelIds: ['kara2'],
      artifactFilename: 'standard.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    recordSeparationResult(separationsDir, {
      recipeId: 'clean',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      modelIds: ['inst-hq3'],
      artifactFilename: 'clean.wav',
      completedAt: '2026-01-02T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    // recordSeparationResult's most-recent-wins already selected inst-hq3
    // — switch back to prove stemsUrl follows the pointer, not creation
    // order.
    selectSeparationResult(separationsDir, 'standard');

    const [track] = listTracks(dir);
    expect(track.stemsUrl).toBe(
      'utawakui-media://track/abc/separations/standard.wav',
    );
    expect(Object.keys(track.separation.results).sort()).toEqual([
      'general',
      'quick',
    ]);
    expect(track.separation.selectedRecipeId).toBe('quick');
  });

  it('reports thumbnailUrl for structured track artwork', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'y');

    const [track] = listTracks(dir);
    expect(track.thumbnailUrl).toBe('utawakui-media://track/abc/thumbnail.jpg');
  });

  it('normalizes yt-dlp artwork sidecars before reporting thumbnailUrl', () => {
    const trackDir = path.join(dir, 'tracks', 'abc');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.webp'), 'image');

    const [track] = listTracks(dir);

    expect(track.thumbnailUrl).toBe(
      'utawakui-media://track/abc/thumbnail.webp',
    );
    expect(fs.existsSync(path.join(trackDir, 'thumbnail.webp'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.webp'))).toBe(false);
  });

  it('normalizes yt-dlp VTT subtitle sidecars into the lyrics directory', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.ja.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'available',
      needsScan: false,
      sources: [{ filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' }],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'ja.vtt'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.ja.vtt'))).toBe(false);
  });

  it('drops translated yt-dlp VTT sidecars instead of listing them as lyrics', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.ja-zh-TW.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'ja-zh-TW.vtt'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(trackDir, 'audio.ja-zh-TW.vtt'))).toBe(
      false,
    );
  });

  it('drops automatic yt-dlp VTT sidecars instead of listing them as lyrics', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'audio.en-orig.vtt'), 'WEBVTT');

    const [track] = listTracks(dir);

    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'en-orig.vtt'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(trackDir, 'audio.en-orig.vtt'))).toBe(false);
  });

  it('marks a YouTube-id track for backfill when artwork or info is missing', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
  });

  it('marks a YouTube-id track for backfill when lyrics have not been checked yet', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'image');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
    expect(track.lyrics).toEqual({
      status: 'unchecked',
      needsScan: false,
      sources: [],
    });
  });

  it('marks tracks scanned with an old lyrics manifest version for one rescan', () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    const lyricsDir = path.join(trackDir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    fs.writeFileSync(path.join(trackDir, 'info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'image');
    fs.writeFileSync(path.join(lyricsDir, 'ja.vtt'), 'WEBVTT');
    fs.writeFileSync(
      path.join(lyricsDir, 'lyrics.json'),
      JSON.stringify({
        version: 2,
        checked: true,
        sources: [{ filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' }],
      }),
    );
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(true);
    expect(track.lyrics).toMatchObject({
      status: 'available',
      needsScan: true,
    });
  });

  it('does not require artwork or info backfill for a non-YouTube local track', () => {
    const trackDir = path.join(dir, 'tracks', 'local-song');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'local-song', {
      title: 'Local Song',
      artist: 'Local Artist',
      duration: 120,
    });

    const [track] = listTracks(dir);

    expect(track.needsBackfill).toBe(false);
  });
});

describe('refreshTrackMetadataFromSidecars', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-refresh-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeStructuredTrack(id) {
    const trackDir = path.join(dir, 'tracks', id);
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    return trackDir;
  }

  it('fills in album/releaseYear from the injected reader, unlike the version-gated migration', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', {
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
    });

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toEqual({
      title: 'Track A',
      artist: 'Artist A',
      duration: 200,
      album: 'Album A',
      releaseYear: 2020,
    });
  });

  it('covers a track id that has no library.json entry at all yet', () => {
    makeStructuredTrack('a');

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toEqual({
      album: 'Album A',
      releaseYear: 2020,
    });
  });

  it('leaves title/artist/duration untouched even though the reader always returns those keys', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', {
      title: 'Real Title',
      artist: 'Real Artist',
      duration: 200,
    });

    // Simulates extractMetadataFields()'s real shape: title/artist/duration
    // keys are always present (undefined here because this sidecar read
    // didn't find them), only album/releaseYear are actually new info.
    refreshTrackMetadataFromSidecars(dir, () => ({
      title: undefined,
      artist: undefined,
      duration: undefined,
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(loadIndex(dir).tracks.a).toMatchObject({
      title: 'Real Title',
      artist: 'Real Artist',
      duration: 200,
    });
  });

  it('never writes thumbnailUrl into library.json', () => {
    makeStructuredTrack('a');

    refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
      thumbnailUrl: 'https://example.com/thumb.jpg',
    }));

    expect(loadIndex(dir).tracks.a.thumbnailUrl).toBeUndefined();
  });

  it('skips a track whose sidecar has neither album nor releaseYear', () => {
    makeStructuredTrack('a');
    saveIndexEntry(dir, 'a', { title: 'Track A' });

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      title: 'Track A',
    }));

    expect(updated).toBe(0);
    expect(loadIndex(dir).tracks.a).toEqual({ title: 'Track A' });
  });

  it('is idempotent: a second run reports 0 and does not rewrite the file', () => {
    makeStructuredTrack('a');
    const reader = () => ({ album: 'Album A', releaseYear: 2020 });

    expect(refreshTrackMetadataFromSidecars(dir, reader)).toBe(1);
    const writtenAt = fs.statSync(path.join(dir, INDEX_FILENAME)).mtimeMs;

    const second = refreshTrackMetadataFromSidecars(dir, reader);

    expect(second).toBe(0);
    expect(fs.statSync(path.join(dir, INDEX_FILENAME)).mtimeMs).toBe(writtenAt);
  });

  it('can run again after the index is already at the current version, unlike migrateTrackAlbumMetadata', () => {
    makeStructuredTrack('a');
    fs.writeFileSync(
      path.join(dir, INDEX_FILENAME),
      JSON.stringify({
        version: 2,
        tracks: { a: { title: 'Track A' } },
      }),
    );

    const updated = refreshTrackMetadataFromSidecars(dir, () => ({
      album: 'Album A',
      releaseYear: 2020,
    }));

    expect(updated).toBe(1);
    expect(loadIndex(dir).tracks.a).toMatchObject({
      album: 'Album A',
      releaseYear: 2020,
    });
  });
});

describe('updateTrackMetadata', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-edit-track-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updates title and artist while preserving managed import metadata', () => {
    const sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-edit-source-test-'),
    );
    const sourcePath = path.join(sourceDir, 'Original.mp3');
    fs.writeFileSync(sourcePath, 'audio');
    const { imported } = importLocalAudioFiles(dir, [sourcePath]);

    const updated = updateTrackMetadata(dir, imported[0].id, {
      title: 'Edited Title',
      artist: 'Edited Artist',
    });

    expect(updated).toMatchObject({
      id: 'Original',
      title: 'Edited Title',
      artist: 'Edited Artist',
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: 'Original.mp3',
    });
    expect(loadIndex(dir).tracks.Original).toMatchObject({
      title: 'Edited Title',
      artist: 'Edited Artist',
      sourceType: 'local-file',
      storageType: 'managed',
      originalFilename: 'Original.mp3',
    });

    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('clears artist when the submitted artist is blank', () => {
    fs.mkdirSync(path.join(dir, 'tracks', 'abc'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'abc', {
      title: 'Old Title',
      artist: 'Old Artist',
    });

    updateTrackMetadata(dir, 'abc', {
      title: 'New Title',
      artist: '   ',
    });

    expect(loadIndex(dir).tracks.abc).toEqual({ title: 'New Title' });
    expect(listTracks(dir)[0]).toMatchObject({
      id: 'abc',
      title: 'New Title',
      artist: undefined,
    });
  });

  it('rejects a blank title', () => {
    fs.mkdirSync(path.join(dir, 'tracks', 'abc'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'), 'x');

    expect(() =>
      updateTrackMetadata(dir, 'abc', { title: ' ', artist: 'Artist' }),
    ).toThrow('title is required');
  });

  it('returns null when the track does not exist on disk', () => {
    expect(
      updateTrackMetadata(dir, 'missing', {
        title: 'Title',
        artist: 'Artist',
      }),
    ).toBe(null);
    expect(loadIndex(dir).tracks.missing).toBeUndefined();
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
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
  });

  it('deletes a legacy (unmigrated) track by its flat file path when migration cannot move it', () => {
    fs.writeFileSync(path.join(dir, 'legacy.mp3'), 'x');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: file is locked');
    });

    let deleted;
    try {
      deleted = deleteTrack(dir, 'legacy');
    } finally {
      renameSpy.mockRestore();
    }

    expect(deleted).toBe(true);
    expect(fs.existsSync(path.join(dir, 'legacy.mp3'))).toBe(false);
  });

  it('removes the matching .separated/<trackId> directory too', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const sepDir = path.join(dir, '.separated', 'abc');
    fs.mkdirSync(sepDir, { recursive: true });
    fs.writeFileSync(path.join(sepDir, 'stems.wav'), 'x');

    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(sepDir)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
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
    expect(fs.existsSync(path.join(dir, 'tracks', 'def', 'audio.mp3'))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(dir, 'tracks', 'def', 'separations', 'standard.wav'),
      ),
    ).toBe(true);
  });

  it('removes everything under separations/ (per-preset results + manifest) when deleting a track', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    fs.writeFileSync(path.join(separationsDir, 'inst-hq3.wav'), 'y');
    recordSeparationResult(separationsDir, {
      recipeId: 'standard',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      modelIds: ['kara2'],
      artifactFilename: 'standard.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });

    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(separationsDir)).toBe(false);
  });

  it('returns false and touches nothing when trackId has no matching file', () => {
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');
    expect(deleteTrack(dir, 'missing')).toBe(false);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc', 'audio.mp3'))).toBe(
      true,
    );
  });

  it('deletes the same deterministic representative listTracks exposes for duplicate stems', () => {
    fs.writeFileSync(path.join(dir, 'abc.webm'), 'y');
    fs.writeFileSync(path.join(dir, 'abc.mp3'), 'x');

    expect(listTracks(dir)[0].filename).toBe('abc.mp3');
    expect(deleteTrack(dir, 'abc')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc'))).toBe(false);
    expect(
      fs.existsSync(path.join(dir, '.duplicates', 'abc', 'abc.webm')),
    ).toBe(true);
  });
});
