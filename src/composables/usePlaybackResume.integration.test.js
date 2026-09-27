import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  initializeLibrary: vi.fn(async () => {}),
  restoreResumeState: vi.fn(),
  restorePlaybackState: vi.fn(),
  queueState: {
    tracks: [],
    queuedTracks: [],
    historyEntries: [],
    currentIsSource: false,
    lastSourceTrackId: null,
    sourceName: '',
    sourceId: null,
    isShuffle: false,
    orderIds: [],
  },
  playerState: {
    track: null,
    currentTime: 0,
    volume: 0.5,
    isMuted: false,
    playbackMode: 'sequence',
  },
}));

vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({
    state: {
      tracks: [
        {
          id: 'track-a',
          title: 'Song A',
          url: 'utawakui-media://track/track-a/audio.wav',
        },
      ],
    },
    initialize: harness.initializeLibrary,
  }),
}));

vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({
    state: harness.queueState,
    restoreResumeState: harness.restoreResumeState,
  }),
}));

vi.mock('./usePlayer.js', () => ({
  usePlayer: () => ({
    state: harness.playerState,
    restorePlaybackState: harness.restorePlaybackState,
  }),
}));

const snapshot = {
  currentTrackId: 'track-a',
  positionSeconds: 22.5,
  volume: 0.7,
  isMuted: true,
  playbackMode: 'repeat-list',
  queue: { sourceTrackIds: ['track-a'] },
};

describe('usePlaybackResume integration', () => {
  beforeEach(() => {
    vi.resetModules();
    harness.initializeLibrary.mockClear();
    harness.restoreResumeState.mockReset();
    harness.restorePlaybackState.mockReset();
    vi.stubGlobal('window', {
      Utawakui: {
        getPlaybackResumeSnapshot: vi.fn(async () => snapshot),
        savePlaybackResumeSnapshot: vi.fn(async (value) => value),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rehydrates queue ids first and restores the resolved track paused', async () => {
    const restoredTrack = {
      id: 'track-a',
      title: 'Song A',
      url: 'utawakui-media://track/track-a/audio.wav',
    };
    harness.restoreResumeState.mockReturnValue(restoredTrack);
    const { usePlaybackResume } = await import('./usePlaybackResume.js');
    const resume = usePlaybackResume();

    await resume.initialize();

    expect(harness.restoreResumeState).toHaveBeenCalledWith(
      snapshot.queue,
      'track-a',
      expect.arrayContaining([expect.objectContaining({ id: 'track-a' })]),
    );
    expect(harness.restorePlaybackState).toHaveBeenCalledWith({
      track: expect.objectContaining({ id: 'track-a' }),
      positionSeconds: 22.5,
      volume: 0.7,
      isMuted: true,
      playbackMode: 'repeat-list',
    });
    expect(resume.state.isInitialized).toBe(true);
  });

  it('filters a missing current track without asking the player to load it', async () => {
    harness.restoreResumeState.mockReturnValue(null);
    const { usePlaybackResume } = await import('./usePlaybackResume.js');
    const resume = usePlaybackResume();

    await resume.initialize();

    expect(harness.restorePlaybackState).not.toHaveBeenCalled();
    expect(window.Utawakui.savePlaybackResumeSnapshot).toHaveBeenCalledWith(
      null,
    );
    expect(resume.state.error).toBeNull();
  });
});
