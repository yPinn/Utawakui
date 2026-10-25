import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerLibrarySync } from './usePlayerLibrarySync.js';

afterEach(() => vi.unstubAllGlobals());

describe('player metadata refresh', () => {
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
