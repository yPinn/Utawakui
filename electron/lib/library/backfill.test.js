import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runBackfillPass } from './backfill.js';
import { listTracks, updateTrackMetadata } from './tracks.js';
import { loadIndex, saveIndexEntry } from './metadataIndex.js';

describe('runBackfillPass', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-backfill-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports "already running" and skips a second concurrent pass', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    let releaseFirst;
    const fetchMetadata = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({ title: 'Title', artist: 'Artist', duration: 100 });
        }),
    );
    const onStatus = vi.fn();

    const firstPass = runBackfillPass(dir, listTracks(dir), fetchMetadata);
    // The first pass is now in flight (backfillInProgress === true).
    const secondResult = await runBackfillPass(
      dir,
      listTracks(dir),
      fetchMetadata,
      onStatus,
    );

    expect(secondResult).toBe(false);
    expect(onStatus).toHaveBeenCalledWith({
      stage: 'running',
      isRunning: true,
    });
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    releaseFirst();
    await firstPass;
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
    expect(fetchMetadata).toHaveBeenCalledWith(
      'dQw4w9WgXcQ',
      path.join(dir, 'tracks', 'dQw4w9WgXcQ'),
    );
  });

  it('queries a YouTube-id track again when only thumbnail or info is missing', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ', trackDir);
  });

  it('treats thumbnail-only backfill as an update without writing asset flags into library.json', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    const fetchMetadata = vi.fn(async () => ({ assetsUpdated: true }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
  });

  it('treats lyrics scan completion as an update even when subtitles are missing', async () => {
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
    const fetchMetadata = vi.fn(async () => ({ assetsUpdated: true }));

    const updated = await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    expect(updated).toBe(true);
    expect(fetchMetadata).toHaveBeenCalledWith('dQw4w9WgXcQ', trackDir);
    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
  });

  it('reports backfill progress while traversing reload candidates', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => ({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    }));
    const onStatus = vi.fn();

    await runBackfillPass(dir, listTracks(dir), fetchMetadata, onStatus);

    expect(onStatus).toHaveBeenCalledWith({
      stage: 'start',
      isRunning: true,
      total: 1,
      completed: 0,
    });
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'track',
        isRunning: true,
        total: 1,
        completed: 0,
        trackId: 'dQw4w9WgXcQ',
      }),
    );
    expect(onStatus).toHaveBeenLastCalledWith({
      stage: 'done',
      isRunning: false,
      total: 1,
      completed: 1,
      updated: true,
    });
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

  it('does not clobber a title edited concurrently while the fetch was in flight', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');
    const fetchMetadata = vi.fn(async () => {
      saveIndexEntry(dir, 'dQw4w9WgXcQ', {
        title: 'User Edited Title',
        titleOrigin: 'manual',
        artistOrigin: 'provider',
      });
      return {
        title: 'Fetched Title',
        artist: 'Fetched Artist',
        duration: 213,
      };
    });

    await runBackfillPass(dir, listTracks(dir), fetchMetadata);

    const [track] = listTracks(dir);
    expect(track.title).toBe('User Edited Title');
    expect(track.artist).toBe('Fetched Artist');
    expect(track.duration).toBe(213);
  });

  it('does not repopulate an artist that was manually cleared', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Manual Title',
      artist: 'Old Artist',
      duration: 213,
    });
    updateTrackMetadata(dir, 'dQw4w9WgXcQ', {
      title: 'Manual Title',
      artist: '',
    });

    await runBackfillPass(
      dir,
      listTracks(dir),
      vi.fn(async () => ({
        title: 'Provider Title',
        artist: 'Provider Artist',
        duration: 213,
        assetsUpdated: true,
      })),
    );

    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toMatchObject({
      title: 'Manual Title',
      titleOrigin: 'manual',
      artistOrigin: 'manual',
    });
    expect(loadIndex(dir).tracks.dQw4w9WgXcQ.artist).toBeUndefined();
  });

  it('does not repopulate a legacy missing artist without an origin marker', async () => {
    const trackDir = path.join(dir, 'tracks', 'dQw4w9WgXcQ');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'x');
    saveIndexEntry(dir, 'dQw4w9WgXcQ', {
      title: 'Legacy Title',
      duration: 180,
    });

    await runBackfillPass(
      dir,
      [{ ...listTracks(dir)[0], needsBackfill: true }],
      vi.fn(async () => ({
        title: 'Provider Title',
        artist: 'Provider Artist',
        duration: 181,
        assetsUpdated: true,
      })),
    );

    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Legacy Title',
      duration: 181,
    });
  });

  it('marks a missing artist as provider-owned for a brand-new index entry', async () => {
    fs.writeFileSync(path.join(dir, 'dQw4w9WgXcQ.mp3'), 'x');

    await runBackfillPass(
      dir,
      listTracks(dir),
      vi.fn(async () => ({
        title: 'Provider Title',
        artist: undefined,
        duration: 181,
      })),
    );

    expect(loadIndex(dir).tracks.dQw4w9WgXcQ).toEqual({
      title: 'Provider Title',
      titleOrigin: 'provider',
      artistOrigin: 'provider',
      duration: 181,
    });
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
