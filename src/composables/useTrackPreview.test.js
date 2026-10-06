import { describe, expect, it, vi } from 'vitest';

// The singleton's real owners create audio elements at import time.
vi.mock('./useBgmSession.js', () => ({ useBgmSession: vi.fn() }));
vi.mock('./usePlayer.js', () => ({ usePlayer: vi.fn() }));
vi.mock('./useMetronome.js', () => ({ useMetronome: vi.fn() }));

import { createTrackPreview } from './useTrackPreview.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class MockAudio {
  constructor() {
    this.listeners = new Map();
    this.currentTime = 0;
    this.volume = 1;
    this.muted = false;
    this.src = '';
    this.error = null;
    this.play = vi.fn(async () => {});
    this.pause = vi.fn();
    this.load = vi.fn();
    this.removeAttribute = vi.fn((name) => {
      if (name === 'src') this.src = '';
    });
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

function track(id, overrides = {}) {
  return {
    id,
    title: id,
    url: `utawakui-media://track/${id}/audio.wav`,
    stemsUrl: `utawakui-media://track/${id}/stems.wav`,
    duration: 200,
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  const audio = new MockAudio();
  const release = vi.fn();
  const handoffState = { sessionMode: 'inactive' };
  let onPreempt = null;
  const bgm = {
    handoffState,
    acquirePreviewLane: vi.fn(async (options) => {
      if (handoffState.sessionMode !== 'inactive') return null;
      onPreempt = options.onPreempt;
      return { release };
    }),
    ...overrides.bgm,
  };
  const metronome = { stop: vi.fn() };
  const getMusicStructure = vi.fn(
    overrides.getMusicStructure ?? (async () => null),
  );
  const recordError = vi.fn();
  const documentRef = {
    visibilityState: 'visible',
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
  };
  const preview = createTrackPreview({
    audio,
    bgm,
    metronome,
    getMusicStructure,
    getDefaultVolume: () => 0.4,
    recordError,
    documentRef,
  });
  return {
    audio,
    bgm,
    documentRef,
    getMusicStructure,
    handoffState,
    metronome,
    preempt: () => onPreempt?.(),
    preview,
    recordError,
    release,
  };
}

describe('track preview', () => {
  it('acquires the lane, stops the metronome and plays the original audio from the chorus', async () => {
    const { audio, bgm, metronome, preview } = createHarness({
      getMusicStructure: async () => ({
        sections: [{ role: 'chorus', startMs: 50000 }],
      }),
    });

    await preview.open({ title: 'Album', tracks: [track('a'), track('b')] });

    expect(bgm.acquirePreviewLane).toHaveBeenCalledOnce();
    expect(metronome.stop).toHaveBeenCalledOnce();
    expect(audio.src).toBe('utawakui-media://track/a/audio.wav');
    expect(audio.volume).toBe(0.4);
    expect(preview.state.segment).toEqual({
      start: 50,
      end: 80,
      source: 'chorus',
    });
    audio.dispatch('loadedmetadata');
    expect(audio.currentTime).toBe(50);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(preview.state.status).toBe('playing');
  });

  it('starts at the requested track', async () => {
    const { audio, preview } = createHarness();
    const tracks = [track('a'), track('b'), track('c')];

    await preview.open({ tracks, startIndex: 2 });

    expect(preview.state.index).toBe(2);
    expect(audio.src).toContain('/c/audio.wav');
  });

  it('stays silent and blocked during a recording or live session', async () => {
    const { audio, handoffState, metronome, preview } = createHarness();
    handoffState.sessionMode = 'live';

    await preview.open({ tracks: [track('a')] });

    expect(preview.state.status).toBe('blocked');
    expect(preview.state.blockedReason).toBe('session-active');
    expect(metronome.stop).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.src).toContain('/a/audio.wav');
  });

  it('advances to the next track when the segment window ends', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    audio.dispatch('loadedmetadata');

    audio.currentTime = 90;
    audio.dispatch('timeupdate');
    await vi.waitFor(() => expect(preview.state.index).toBe(1));

    expect(audio.src).toContain('/b/audio.wav');
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('pauses after the last segment instead of wrapping', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a')] });
    audio.dispatch('loadedmetadata');

    audio.currentTime = 90;
    audio.dispatch('timeupdate');

    expect(preview.state.status).toBe('paused');
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('keeps the lane through pause and resumes inside the segment', async () => {
    const { audio, bgm, preview } = createHarness();
    await preview.open({ tracks: [track('a')] });
    audio.dispatch('loadedmetadata');

    await preview.toggle();
    expect(preview.state.status).toBe('paused');
    await preview.toggle();

    expect(bgm.acquirePreviewLane).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(preview.state.status).toBe('playing');
  });

  it('pauses on preemption and re-acquires on the next play', async () => {
    const { audio, bgm, preempt, preview } = createHarness();
    await preview.open({ tracks: [track('a')] });

    preempt();
    expect(preview.state.status).toBe('paused');
    expect(preview.state.blockedReason).toBe('preempted');
    expect(audio.pause).toHaveBeenCalled();

    await preview.toggle();
    expect(bgm.acquirePreviewLane).toHaveBeenCalledTimes(2);
    expect(preview.state.status).toBe('playing');
    expect(preview.state.blockedReason).toBeNull();
  });

  it('loads a selected track paused when playback is paused', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    await preview.toggle();

    await preview.next();

    expect(preview.state.index).toBe(1);
    expect(preview.state.status).toBe('paused');
    expect(audio.play).toHaveBeenCalledOnce();
    await preview.previous();
    expect(preview.state.index).toBe(0);
    await preview.previous();
    expect(preview.state.index).toBe(0);
  });

  it('ignores a structure response for a track the user already left', async () => {
    const slow = createDeferred();
    const { audio, getMusicStructure, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    getMusicStructure.mockImplementationOnce(() => slow.promise);

    const stale = preview.next();
    await preview.previous();
    slow.resolve({ sections: [{ role: 'chorus', startMs: 1000 }] });
    await stale;

    expect(preview.state.index).toBe(0);
    expect(audio.src).toContain('/a/audio.wav');
  });

  it('records a media error and skips to the next track', async () => {
    const { audio, preview, recordError } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });

    audio.error = { code: 4 };
    audio.dispatch('error');
    await vi.waitFor(() => expect(preview.state.index).toBe(1));

    expect(recordError).toHaveBeenCalledWith(
      { code: 4 },
      expect.objectContaining({
        code: 'TRACK_PREVIEW_PLAYBACK_FAILED',
        source: 'track-preview',
      }),
    );
  });

  it('stops skipping once every track has failed', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });

    audio.dispatch('error');
    await vi.waitFor(() => expect(preview.state.index).toBe(1));
    audio.dispatch('error');

    expect(preview.state.status).toBe('error');
    expect(preview.state.index).toBe(1);
  });

  it('pauses without releasing the lane when the window is hidden', async () => {
    const { audio, documentRef, preview, release } = createHarness();
    await preview.open({ tracks: [track('a')] });

    documentRef.visibilityState = 'hidden';
    documentRef.listeners.get('visibilitychange')();

    expect(audio.pause).toHaveBeenCalled();
    expect(preview.state.status).toBe('paused');
    expect(release).not.toHaveBeenCalled();
  });

  it('releases the lane and clears the source on close', async () => {
    const { audio, preview, release } = createHarness();
    await preview.open({ tracks: [track('a')] });

    preview.close();

    expect(release).toHaveBeenCalledOnce();
    expect(audio.src).toBe('');
    expect(audio.load).toHaveBeenCalled();
    expect(preview.state.isOpen).toBe(false);
  });

  it('releases a lane granted after the preview already closed', async () => {
    const lane = createDeferred();
    const release = vi.fn();
    const { audio, preview } = createHarness({
      bgm: { acquirePreviewLane: vi.fn(() => lane.promise) },
    });

    const opening = preview.open({ tracks: [track('a')] });
    preview.close();
    lane.resolve({ release });
    await expect(opening).resolves.toBe(false);

    expect(release).toHaveBeenCalledOnce();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('refuses an empty or unplayable track list', async () => {
    const { bgm, preview } = createHarness();

    await expect(preview.open({ tracks: [{ id: 'x' }] })).resolves.toBe(false);
    expect(bgm.acquirePreviewLane).not.toHaveBeenCalled();
    expect(preview.state.isOpen).toBe(false);
  });
});
