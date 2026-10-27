import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerLibrarySync } from './usePlayerLibrarySync.js';

afterEach(() => vi.unstubAllGlobals());

describe('player metadata refresh', () => {
  it.each(['current', 'start', 'occurrence'])(
    'only invalidates missing media for the current lookup: %s',
    async (change) => {
      const pending = Promise.withResolvers();
      let revision = 1;
      const state = { track: { id: 'song', url: 'old' }, playbackRevision: 1 };
      vi.stubGlobal('window', {
        Utawakui: { getTrack: () => pending.promise },
      });
      const practiceBoundary = { intent: vi.fn() };
      const sync = usePlayerLibrarySync({
        state,
        getStartRevision: () => revision,
        practiceBoundary,
      });
      const refreshing = sync();
      if (change === 'start') revision++;
      if (change === 'occurrence') state.playbackRevision++;
      pending.resolve(null);
      await refreshing;
      expect(practiceBoundary.intent).toHaveBeenCalledTimes(
        change === 'current' ? 1 : 0,
      );
    },
  );
  it.each([
    undefined,
    { ok: false, status: 'failed' },
    { ok: true, status: 'applied' },
  ])(
    'does not treat fulfilled preparation as readiness: %j',
    async (result) => {
      const state = {
        track: { id: 'song', url: 'old' },
        playbackRevision: 1,
        isPlaying: true,
        currentTime: 10,
      };
      vi.stubGlobal('window', {
        Utawakui: { getTrack: async () => ({ id: 'song', url: 'new' }) },
      });
      const audio = { play: vi.fn() };
      const notifyStopped = vi.fn();
      const isPlaybackReady = vi.fn(() => false);
      const sync = usePlayerLibrarySync({
        state,
        audio,
        getStartRevision: () => 1,
        audioGraph: {
          isPlaybackReady,
          resume: vi.fn(async () => result),
          routeAudioGraph: vi.fn(),
          restoreGuideVocalState: vi.fn(),
          restoreCaptureGuideVocalState: vi.fn(),
        },
        seek: vi.fn(),
        reportPlayerError: vi.fn(() => '版本更新後需重試'),
        notifyStopped,
      });
      await sync();
      expect(isPlaybackReady).toHaveBeenCalledWith(result);
      expect(audio.play).not.toHaveBeenCalled();
      expect(state.playbackPhase).toBe('error');
      expect(notifyStopped).toHaveBeenCalledWith('error');
    },
  );

  it('does not stop a newer playback when an old URL reload fails', async () => {
    const pending = Promise.withResolvers();
    let revision = 1;
    const state = {
      track: { id: 'song', url: 'old' },
      playbackRevision: 1,
      isPlaying: true,
      currentTime: 10,
    };
    vi.stubGlobal('window', {
      Utawakui: { getTrack: async () => ({ id: 'song', url: 'new' }) },
    });
    const reportPlayerError = vi.fn();
    const notifyStopped = vi.fn();
    const resume = vi.fn(() => pending.promise);
    const sync = usePlayerLibrarySync({
      state,
      audio: { play: vi.fn() },
      getStartRevision: () => revision,
      audioGraph: {
        resume,
        routeAudioGraph: vi.fn(),
        restoreGuideVocalState: vi.fn(),
        restoreCaptureGuideVocalState: vi.fn(),
      },
      seek: vi.fn(),
      reportPlayerError,
      notifyStopped,
    });
    const refreshing = sync();
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce());
    revision++;
    state.track = { id: 'other', url: 'other' };
    pending.reject(new Error('old device request failed'));
    await refreshing;
    expect(notifyStopped).not.toHaveBeenCalled();
    expect(reportPlayerError).not.toHaveBeenCalled();
    expect(state.isPlaying).toBe(true);
  });
});
