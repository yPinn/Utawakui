import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PLAYBACK_HISTORY_LIMIT,
  createPlaybackPersistence,
} from './playbackPersistence.js';

describe('playbackPersistence', () => {
  let userDataDir;
  let clockMs;
  let service;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-playback-persistence-'),
    );
    clockMs = Date.parse('2026-09-27T12:00:00.000Z');
    service = createPlaybackPersistence({
      userDataDir,
      now: () => new Date(clockMs),
    });
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('starts with empty history and no resume snapshot', () => {
    expect(service.getRecentHistory()).toEqual([]);
    expect(service.getResumeSnapshot()).toBe(null);
  });

  it('moves a replayed track to the front and keeps only its latest context', () => {
    service.recordRecentPlayback('track-a', {
      sourceId: 'playlist-1',
      sourceName: '深夜練唱',
      privatePath: 'E:\\music\\private.wav',
    });
    clockMs += 1_000;
    service.recordRecentPlayback('track-b', {
      sourceId: 'playlist-2',
      sourceName: '晨間播放',
    });
    clockMs += 1_000;
    service.recordRecentPlayback('track-a', {
      sourceId: null,
      sourceName: '',
    });

    expect(service.getRecentHistory()).toEqual([
      {
        trackId: 'track-a',
        playedAt: '2026-09-27T12:00:02.000Z',
        sourceId: null,
        sourceName: null,
      },
      {
        trackId: 'track-b',
        playedAt: '2026-09-27T12:00:01.000Z',
        sourceId: 'playlist-2',
        sourceName: '晨間播放',
      },
    ]);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(userDataDir, 'playback-history.json'),
          'utf8',
        ),
      ).entries,
    ).toEqual(service.getRecentHistory());
  });

  it('deduplicates legacy history while keeping the first valid newest entry', () => {
    fs.writeFileSync(
      path.join(userDataDir, 'playback-history.json'),
      JSON.stringify({
        version: 1,
        entries: [
          {
            trackId: 'track-a',
            playedAt: '2026-09-27T12:00:03.000Z',
            sourceId: 'playlist-latest',
            sourceName: '最新來源',
          },
          {
            trackId: 'track-a',
            playedAt: '2026-09-27T12:00:02.000Z',
            sourceId: 'playlist-old',
            sourceName: '舊來源',
          },
          {
            trackId: 'track-b',
            playedAt: '2026-09-27T12:00:01.000Z',
            sourceId: 'x'.repeat(300),
            sourceName: '損壞來源',
          },
          {
            trackId: 'track-b',
            playedAt: '2026-09-27T12:00:00.000Z',
            sourceId: null,
            sourceName: null,
          },
        ],
      }),
    );

    expect(service.getRecentHistory()).toEqual([
      {
        trackId: 'track-a',
        playedAt: '2026-09-27T12:00:03.000Z',
        sourceId: 'playlist-latest',
        sourceName: '最新來源',
      },
      {
        trackId: 'track-b',
        playedAt: '2026-09-27T12:00:00.000Z',
        sourceId: null,
        sourceName: null,
      },
    ]);
  });

  it('uses a bounded internal history limit without exposing an unbounded file', () => {
    for (let index = 0; index < PLAYBACK_HISTORY_LIMIT + 7; index += 1) {
      clockMs += 1_000;
      service.recordRecentPlayback(`track-${index}`);
    }

    const history = service.getRecentHistory();
    expect(history).toHaveLength(PLAYBACK_HISTORY_LIMIT);
    expect(history[0].trackId).toBe(`track-${PLAYBACK_HISTORY_LIMIT + 6}`);
    expect(history.at(-1).trackId).toBe('track-7');
  });

  it('keeps a complete private last-played index beyond the recent UI limit', () => {
    for (let index = 0; index < PLAYBACK_HISTORY_LIMIT + 7; index += 1) {
      clockMs += 1_000;
      service.recordRecentPlayback(`track-${index}`);
    }

    const usage = service.getLastPlayedAtByTrackId();
    expect(Object.keys(usage)).toHaveLength(PLAYBACK_HISTORY_LIMIT + 7);
    expect(usage['track-0']).toBe('2026-09-27T12:00:01.000Z');
    expect(usage[`track-${PLAYBACK_HISTORY_LIMIT + 6}`]).toBe(
      `2026-09-27T12:00:${String(PLAYBACK_HISTORY_LIMIT + 7).padStart(2, '0')}.000Z`,
    );
  });

  it('rejects unsafe renderer history payloads before writing', () => {
    expect(() => service.recordRecentPlayback('../escape')).toThrow(
      /track id/i,
    );
    expect(() =>
      service.recordRecentPlayback('track-a', {
        sourceId: 'x'.repeat(300),
      }),
    ).toThrow(/source context/i);
    expect(fs.existsSync(path.join(userDataDir, 'playback-history.json'))).toBe(
      false,
    );
  });

  it('backs up corrupt history and resume files before falling back', () => {
    fs.writeFileSync(
      path.join(userDataDir, 'playback-history.json'),
      '{broken',
    );
    fs.writeFileSync(path.join(userDataDir, 'playback-resume.json'), '{broken');

    expect(service.getRecentHistory()).toEqual([]);
    expect(service.getResumeSnapshot()).toBe(null);
    expect(
      fs
        .readdirSync(userDataDir)
        .filter((name) => name.includes('.corrupted-')),
    ).toHaveLength(2);
  });

  it('persists only the bounded playback resume contract and derives updatedAt in main', () => {
    const saved = service.saveResumeSnapshot({
      currentTrackId: 'track-b',
      positionSeconds: 37.25,
      volume: 0.72,
      isMuted: true,
      playbackMode: 'repeat-list',
      privateUrl: 'file:///private.wav',
      queue: {
        sourceTrackIds: ['track-a', 'track-b', 'missing-duplicate', 'track-a'],
        queuedTrackIds: ['queued-1'],
        historyEntries: [
          { trackId: 'track-a', source: true },
          { trackId: 'interrupt-1', source: false },
        ],
        currentIsSource: true,
        lastSourceTrackId: 'track-b',
        sourceName: '深夜練唱',
        sourceId: 'playlist-1',
        isShuffle: true,
        orderIds: ['track-b', 'track-a'],
      },
    });

    expect(saved).toEqual({
      version: 1,
      updatedAt: '2026-09-27T12:00:00.000Z',
      currentTrackId: 'track-b',
      positionSeconds: 37.25,
      volume: 0.72,
      isMuted: true,
      playbackMode: 'repeat-list',
      queue: {
        sourceTrackIds: ['track-a', 'track-b', 'missing-duplicate'],
        queuedTrackIds: ['queued-1'],
        historyEntries: [
          { trackId: 'track-a', source: true },
          { trackId: 'interrupt-1', source: false },
        ],
        currentIsSource: true,
        lastSourceTrackId: 'track-b',
        sourceName: '深夜練唱',
        sourceId: 'playlist-1',
        isShuffle: true,
        orderIds: ['track-b', 'track-a'],
      },
    });
    expect(service.getResumeSnapshot()).toEqual(saved);
    expect(JSON.stringify(saved)).not.toContain('privateUrl');
  });

  it('rejects malformed resume snapshots and clears with null', () => {
    expect(() =>
      service.saveResumeSnapshot({
        currentTrackId: 'track-a',
        positionSeconds: -1,
        volume: 2,
        isMuted: false,
        playbackMode: 'unknown',
        queue: {},
      }),
    ).toThrow(/resume snapshot/i);

    service.saveResumeSnapshot({
      currentTrackId: 'track-a',
      positionSeconds: 1,
      volume: 0.5,
      isMuted: false,
      playbackMode: 'sequence',
      queue: {
        sourceTrackIds: ['track-a'],
        queuedTrackIds: [],
        historyEntries: [],
        currentIsSource: true,
        lastSourceTrackId: 'track-a',
        sourceName: '',
        sourceId: null,
        isShuffle: false,
        orderIds: ['track-a'],
      },
    });

    expect(service.saveResumeSnapshot(null)).toBe(null);
    expect(service.getResumeSnapshot()).toBe(null);
  });

  it('clears recent history without affecting the resume snapshot', () => {
    service.recordRecentPlayback('track-a');
    service.saveResumeSnapshot({
      currentTrackId: 'track-a',
      positionSeconds: 1,
      volume: 0.5,
      isMuted: false,
      playbackMode: 'sequence',
      queue: {
        sourceTrackIds: ['track-a'],
        queuedTrackIds: [],
        historyEntries: [],
        currentIsSource: true,
        lastSourceTrackId: 'track-a',
        sourceName: '',
        sourceId: null,
        isShuffle: false,
        orderIds: ['track-a'],
      },
    });

    expect(service.clearRecentHistory()).toEqual([]);
    expect(service.getRecentHistory()).toEqual([]);
    expect(service.getResumeSnapshot()?.currentTrackId).toBe('track-a');
    expect(service.getLastPlayedAtByTrackId()).toEqual({
      'track-a': '2026-09-27T12:00:00.000Z',
    });
  });
});
