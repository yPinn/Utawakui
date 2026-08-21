import { describe, expect, it } from 'vitest';
import outputContract from '../../shared/outputContract.js';
import { projectOutputSnapshot } from './outputSnapshot.js';

const {
  OUTPUT_STATE_VERSION,
  createEmptyOutputSnapshot,
  isOutputSnapshot,
  parseOutputSnapshot,
} = outputContract;

describe('output snapshot contract', () => {
  it('creates a versioned empty snapshot', () => {
    expect(
      createEmptyOutputSnapshot({
        revision: 4,
        generatedAt: '2026-08-22T00:00:00.000Z',
      }),
    ).toEqual({
      version: OUTPUT_STATE_VERSION,
      revision: 4,
      generatedAt: '2026-08-22T00:00:00.000Z',
      playback: {
        status: 'idle',
        positionMs: 0,
        durationMs: null,
        rate: 1,
        track: null,
      },
      queue: { sourceName: '', items: [] },
      lyrics: {
        trackId: null,
        source: null,
        synced: false,
        offsetMs: 0,
        activeLineIndex: -1,
        lines: [],
      },
    });
  });

  it('rejects incompatible versions and malformed boundaries', () => {
    const base = createEmptyOutputSnapshot({
      generatedAt: '2026-08-22T00:00:00.000Z',
    });

    expect(() => parseOutputSnapshot({ ...base, version: 2 })).toThrow(
      /version/i,
    );
    expect(() => parseOutputSnapshot({ ...base, generatedAt: '2026' })).toThrow(
      /generatedAt/,
    );
    expect(() =>
      parseOutputSnapshot({
        ...base,
        lyrics: { ...base.lyrics, activeLineIndex: 1 },
      }),
    ).toThrow(/activeLineIndex/);
    expect(isOutputSnapshot({ ...base, revision: -1 })).toBe(false);
  });

  it('returns a canonical copy without renderer-only or provider fields', () => {
    const base = createEmptyOutputSnapshot({
      generatedAt: '2026-08-22T00:00:00.000Z',
    });
    const parsed = parseOutputSnapshot({
      ...base,
      playback: {
        ...base.playback,
        track: {
          id: 'track-1',
          title: 'Song',
          artist: 'Singer',
          url: 'utawakui-media://track/track-1/audio.webm',
          originalPath: 'C:\\Music\\Song.webm',
          providerUrl: 'https://example.test/watch?v=secret',
        },
      },
      debug: { internal: true },
    });

    expect(parsed.playback.track).toEqual({
      id: 'track-1',
      title: 'Song',
      artist: 'Singer',
    });
    expect(parsed).not.toHaveProperty('debug');
  });
});

describe('projectOutputSnapshot', () => {
  it('projects player, queue, and synced lyrics into the public contract', () => {
    const track = {
      id: 'track-1',
      title: '夜に駆ける',
      artist: 'YOASOBI',
      filename: 'audio.webm',
      url: 'utawakui-media://track/track-1/audio.webm',
      source: { platform: 'youtube', id: 'private-provider-id' },
    };
    const snapshot = projectOutputSnapshot(
      {
        player: {
          track,
          isPlaying: true,
          currentTime: 12.345,
          duration: 95.6,
          tempoRate: 1.05,
          error: null,
        },
        queue: {
          sourceName: 'Tonight',
          historyEntries: [
            { track: { id: 'old', title: 'Done', artist: 'Singer' } },
          ],
          currentTrack: track,
          upcomingTracks: [
            { id: 'next', title: 'Next Song', artist: 'Next Singer' },
          ],
        },
        lyrics: {
          trackId: 'track-1',
          source: {
            kind: 'manual',
            language: 'ja',
            label: 'Main',
            filename: 'manual.lrc',
          },
          offsetSeconds: -0.2,
          activeLineIndex: 1,
          lines: [
            { start: 10, end: 12.5, text: 'first' },
            { start: 12.5, end: 15, text: 'second' },
          ],
        },
      },
      {
        revision: 8,
        generatedAt: '2026-08-22T01:02:03.000Z',
      },
    );

    expect(snapshot).toMatchObject({
      version: 1,
      revision: 8,
      generatedAt: '2026-08-22T01:02:03.000Z',
      playback: {
        status: 'playing',
        positionMs: 12345,
        durationMs: 95600,
        rate: 1.05,
        track: { id: 'track-1', title: '夜に駆ける', artist: 'YOASOBI' },
      },
      queue: {
        sourceName: 'Tonight',
        items: [
          {
            state: 'played',
            track: { id: 'old', title: 'Done', artist: 'Singer' },
          },
          {
            state: 'current',
            track: {
              id: 'track-1',
              title: '夜に駆ける',
              artist: 'YOASOBI',
            },
          },
          {
            state: 'queued',
            track: {
              id: 'next',
              title: 'Next Song',
              artist: 'Next Singer',
            },
          },
        ],
      },
      lyrics: {
        trackId: 'track-1',
        source: { kind: 'manual', language: 'ja', label: 'Main' },
        synced: true,
        offsetMs: -200,
        activeLineIndex: 1,
        lines: [
          { text: 'first', startMs: 10000, endMs: 12500 },
          { text: 'second', startMs: 12500, endMs: 15000 },
        ],
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('utawakui-media:');
    expect(JSON.stringify(snapshot)).not.toContain('private-provider-id');
    expect(JSON.stringify(snapshot)).not.toContain('manual.lrc');
  });

  it('does not expose lyrics selected for a different track', () => {
    const snapshot = projectOutputSnapshot({
      player: {
        track: { id: 'playing', title: 'Playing' },
        isPlaying: false,
      },
      queue: {},
      lyrics: {
        trackId: 'selected-elsewhere',
        activeLineIndex: 0,
        lines: [{ start: 0, end: 2, text: 'wrong lyrics' }],
      },
    });

    expect(snapshot.playback.status).toBe('paused');
    expect(snapshot.lyrics).toEqual({
      trackId: null,
      source: null,
      synced: false,
      offsetMs: 0,
      activeLineIndex: -1,
      lines: [],
    });
  });

  it('keeps the current track when a long upcoming queue is capped', () => {
    const snapshot = projectOutputSnapshot({
      player: {
        track: { id: 'current', title: 'Current' },
        isPlaying: true,
      },
      queue: {
        currentTrack: { id: 'current', title: 'Current' },
        upcomingTracks: Array.from({ length: 150 }, (_, index) => ({
          id: `next-${index}`,
          title: `Next ${index}`,
        })),
      },
    });

    expect(snapshot.queue.items).toHaveLength(100);
    expect(snapshot.queue.items[0]).toMatchObject({
      state: 'current',
      track: { id: 'current' },
    });
  });
});
