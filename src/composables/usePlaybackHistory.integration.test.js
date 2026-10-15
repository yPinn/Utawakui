import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  onEnded: null,
  onProgress: null,
  initializeLibrary: vi.fn(async () => {}),
  recordRecentPlayback: vi.fn(),
  clearRecentPlaybackHistory: vi.fn(),
}));

vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({
    tracksById: {
      value: new Map([
        ['track-a', { id: 'track-a', title: 'Song A', artist: 'Artist A' }],
      ]),
    },
    initialize: harness.initializeLibrary,
  }),
}));

vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    state: {
      currentIsSource: true,
      sourceId: 'playlist-1',
      sourceName: '深夜練唱',
    },
  }),
}));

vi.mock('./usePlayer.js', () => ({
  usePlayer: () => ({
    onEnded: (listener) => {
      harness.onEnded = listener;
      return vi.fn();
    },
    onPlaybackProgress: (listener) => {
      harness.onProgress = listener;
      return vi.fn();
    },
  }),
}));

describe('usePlaybackHistory integration', () => {
  beforeEach(() => {
    vi.resetModules();
    harness.onEnded = null;
    harness.onProgress = null;
    harness.initializeLibrary.mockClear();
    harness.recordRecentPlayback.mockReset();
    harness.clearRecentPlaybackHistory.mockReset();
    vi.stubGlobal('window', {
      Utawakui: {
        getRecentPlaybackHistory: vi.fn(async () => [
          {
            trackId: 'track-a',
            playedAt: '2026-09-27T12:00:00.000Z',
            sourceId: 'playlist-1',
            sourceName: '深夜練唱',
          },
        ]),
        recordRecentPlayback: harness.recordRecentPlayback,
        clearRecentPlaybackHistory: harness.clearRecentPlaybackHistory,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads persisted events and resolves current library metadata', async () => {
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const history = usePlaybackHistory();

    await history.initialize();

    expect(harness.initializeLibrary).toHaveBeenCalledOnce();
    expect(history.state.isInitialized).toBe(true);
    expect(history.recentItems.value).toEqual([
      expect.objectContaining({
        trackId: 'track-a',
        track: expect.objectContaining({ title: 'Song A' }),
      }),
    ]);
  });

  it('records qualified playback with bounded source context and can clear it', async () => {
    harness.recordRecentPlayback.mockResolvedValue([
      {
        trackId: 'track-a',
        playedAt: '2026-09-27T12:01:00.000Z',
        sourceId: 'playlist-1',
        sourceName: '深夜練唱',
      },
    ]);
    harness.clearRecentPlaybackHistory.mockResolvedValue([]);
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const history = usePlaybackHistory();
    await history.initialize();

    harness.onProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });
    harness.onProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });
    await vi.waitFor(() =>
      expect(harness.recordRecentPlayback).toHaveBeenCalledWith('track-a', {
        sourceId: 'playlist-1',
        sourceName: '深夜練唱',
      }),
    );

    await history.clear();
    expect(history.recentItems.value).toEqual([]);
  });

  it('projects main-owned play counts and advances them on the same qualified event', async () => {
    window.Utawakui.getPlaybackPlayCounts = vi.fn(async () => ({
      'track-a': 2,
    }));
    harness.recordRecentPlayback.mockResolvedValue([]);
    harness.clearRecentPlaybackHistory.mockResolvedValue([]);
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const history = usePlaybackHistory();
    await history.initialize();

    expect(history.playCountOf('track-a')).toBe(2);
    expect(history.playCountOf('track-unplayed')).toBe(0);

    harness.onEnded({ trackId: 'track-a', playbackRevision: 1 });
    await vi.waitFor(() => expect(history.playCountOf('track-a')).toBe(3));

    await history.clear();
    expect(history.playCountOf('track-a')).toBe(3);
  });

  it('keeps play counts unknown when they cannot be loaded or recorded', async () => {
    window.Utawakui.getPlaybackPlayCounts = vi.fn(async () => {
      throw new Error('unavailable');
    });
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const history = usePlaybackHistory();
    await history.initialize();

    expect(history.playCountOf('track-a')).toBe(null);
    expect(history.state.error).toBe(null);
  });

  it('does not advance the count when recording fails', async () => {
    window.Utawakui.getPlaybackPlayCounts = vi.fn(async () => ({}));
    harness.recordRecentPlayback.mockRejectedValue(new Error('disk full'));
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const history = usePlaybackHistory();
    await history.initialize();

    harness.onEnded({ trackId: 'track-a', playbackRevision: 1 });
    await vi.waitFor(() => expect(history.state.error).not.toBe(null));
    expect(history.playCountOf('track-a')).toBe(0);
  });
});
