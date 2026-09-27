import { describe, expect, it } from 'vitest';
import { buildPlaybackResumeIntent } from '../utils/playbackResumeIntent.js';

describe('buildPlaybackResumeIntent', () => {
  it('returns null when no track is loaded', () => {
    expect(
      buildPlaybackResumeIntent({
        playerState: { track: null },
        queueState: {},
      }),
    ).toBe(null);
  });

  it('projects only player scalars and queue ids', () => {
    const intent = buildPlaybackResumeIntent({
      playerState: {
        track: {
          id: 'track-a',
          title: 'Private title copy is resolved from the library',
          url: 'file:///private.wav',
        },
        currentTime: 12.5,
        volume: 0.65,
        isMuted: true,
        playbackMode: 'repeat-one',
      },
      queueState: {
        tracks: [
          { id: 'track-a', title: 'A' },
          { id: 'track-b', title: 'B' },
        ],
        queuedTracks: [{ id: 'queued-1', title: 'Queued' }],
        historyEntries: [{ track: { id: 'previous-1' }, source: true }],
        currentIsSource: true,
        lastSourceTrackId: 'track-a',
        sourceName: '深夜練唱',
        sourceId: 'playlist-1',
        isShuffle: false,
        orderIds: ['track-a', 'track-b'],
      },
    });

    expect(intent).toEqual({
      currentTrackId: 'track-a',
      positionSeconds: 12.5,
      volume: 0.65,
      isMuted: true,
      playbackMode: 'repeat-one',
      queue: {
        sourceTrackIds: ['track-a', 'track-b'],
        queuedTrackIds: ['queued-1'],
        historyEntries: [{ trackId: 'previous-1', source: true }],
        currentIsSource: true,
        lastSourceTrackId: 'track-a',
        sourceName: '深夜練唱',
        sourceId: 'playlist-1',
        isShuffle: false,
        orderIds: ['track-a', 'track-b'],
      },
    });
    expect(JSON.stringify(intent)).not.toContain('private.wav');
    expect(JSON.stringify(intent)).not.toContain('Private title');
  });
});
