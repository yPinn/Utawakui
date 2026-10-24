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

// Runs every callback queued before the frame, as the browser does.
function createFrames() {
  let pending = [];
  return {
    requestFrame: (callback) => pending.push(callback),
    run(timestamp = 0) {
      const queued = pending;
      pending = [];
      for (const callback of queued) callback(timestamp);
    },
    get pending() {
      return pending.length;
    },
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
  const windowRef = {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    dispatch(type) {
      this.listeners.get(type)?.();
    },
  };
  const preview = createTrackPreview({
    audio,
    bgm,
    metronome,
    getMusicStructure,
    getLyrics: overrides.getLyrics,
    getDefaultVolume: () => 0.4,
    recordError,
    documentRef,
    windowRef,
    requestFrame: overrides.requestFrame,
    cancelFrame: overrides.cancelFrame,
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
    windowRef,
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
      start: 48,
      end: 78,
      source: 'chorus',
    });
    audio.dispatch('loadedmetadata');
    expect(audio.currentTime).toBe(48);
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

  it('replays the segment when its window ends instead of moving on', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    audio.dispatch('loadedmetadata');
    const { start } = preview.state.segment;

    audio.currentTime = 90;
    audio.dispatch('timeupdate');
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2));

    expect(preview.state.index).toBe(0);
    expect(audio.src).toContain('/a/audio.wav');
    expect(audio.currentTime).toBe(start);
    expect(preview.state.status).toBe('playing');
  });
  it('ignores the previous source while the next track is still loading', async () => {
    const structure = createDeferred();
    const { audio, getMusicStructure, preview } = createHarness();
    // Short 'a' ends its window at 58s; long 'b' plays well past that.
    await preview.open({
      tracks: [track('a', { duration: 100 }), track('b', { duration: 400 })],
      startIndex: 1,
    });
    audio.dispatch('loadedmetadata');
    audio.currentTime = 130;
    getMusicStructure.mockImplementationOnce(() => structure.promise);

    const back = preview.previous();
    // Pausing 'b' still reports its own time before 'a' has a source.
    audio.dispatch('timeupdate');
    audio.dispatch('ended');
    structure.resolve(null);
    await back;

    expect(preview.state.index).toBe(0);
    expect(audio.src).toContain('/a/audio.wav');
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('replays a segment that runs into the end of the file', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a')] });
    audio.dispatch('loadedmetadata');

    audio.dispatch('ended');
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2));

    expect(audio.currentTime).toBe(preview.state.segment.start);
    expect(preview.state.status).toBe('playing');
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

  it('plays whichever track it lands on, even after a pause', async () => {
    const { audio, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    await preview.toggle();

    await preview.next();

    expect(preview.state.index).toBe(1);
    expect(preview.state.status).toBe('playing');
    expect(audio.play).toHaveBeenCalledTimes(2);
    await preview.previous();
    expect(preview.state.index).toBe(0);
    await preview.previous();
    expect(preview.state.index).toBe(0);
  });

  it('takes the lane back when the operator moves on after a preemption', async () => {
    const { bgm, preempt, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    preempt();

    // Two quick card switches share one lane request.
    await Promise.all([preview.next(), preview.previous()]);

    expect(bgm.acquirePreviewLane).toHaveBeenCalledTimes(2);
    expect(preview.state.status).toBe('playing');
    expect(preview.state.blockedReason).toBeNull();
  });

  it('stays silent when a card switch happens during record or live', async () => {
    const { audio, handoffState, preempt, preview } = createHarness();
    await preview.open({ tracks: [track('a'), track('b')] });
    handoffState.sessionMode = 'live';
    preempt();

    await preview.next();

    expect(preview.state.index).toBe(1);
    expect(preview.state.status).toBe('blocked');
    expect(audio.play).toHaveBeenCalledOnce();
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
    // The next failure can only come from 'b' once its source is assigned.
    await vi.waitFor(() => expect(audio.src).toContain('/b/audio.wav'));
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

  it('pauses when the window loses focus and resumes when it returns', async () => {
    const { audio, preview, release, windowRef } = createHarness();
    await preview.open({ tracks: [track('a')] });
    audio.dispatch('loadedmetadata');

    windowRef.dispatch('blur');
    expect(preview.state.status).toBe('paused');
    expect(release).not.toHaveBeenCalled();

    windowRef.dispatch('focus');
    await vi.waitFor(() => expect(preview.state.status).toBe('playing'));
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('leaves a pause it did not cause alone when focus returns', async () => {
    const { audio, preempt, preview, windowRef } = createHarness();
    await preview.open({ tracks: [track('a')] });

    // The operator paused; a later blur／focus must not resume it.
    await preview.toggle();
    windowRef.dispatch('blur');
    windowRef.dispatch('focus');
    expect(preview.state.status).toBe('paused');

    // Another player took over while the window was away.
    await preview.toggle();
    windowRef.dispatch('blur');
    preempt();
    windowRef.dispatch('focus');
    await Promise.resolve();
    expect(preview.state.status).toBe('paused');
    expect(preview.state.blockedReason).toBe('preempted');
    expect(audio.play).toHaveBeenCalledTimes(2);
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

  it('reads the element every frame while playing and stops once paused', async () => {
    const frames = createFrames();
    const { audio, preview } = createHarness({
      requestFrame: frames.requestFrame,
    });
    await preview.open({ tracks: [track('a')] });
    expect(frames.pending).toBeGreaterThan(0);

    // The pending segment seek wins over the element's stale time.
    audio.currentTime = 7;
    frames.run(0);
    expect(preview.state.currentTime).toBe(preview.state.segment.start);

    audio.dispatch('loadedmetadata');
    audio.currentTime = preview.state.segment.start + 1.25;
    frames.run(16);
    expect(preview.state.currentTime).toBe(preview.state.segment.start + 1.25);

    // A track switch pauses the element before its new time is known.
    audio.paused = true;
    audio.currentTime = 999;
    frames.run(32);
    expect(preview.state.currentTime).not.toBe(999);
    audio.paused = false;

    await preview.toggle();
    frames.run(400);
    expect(frames.pending).toBe(0);
  });

  it('fades the volume in over the first frames of playback', async () => {
    const frames = createFrames();
    const { audio, preview } = createHarness({
      requestFrame: frames.requestFrame,
    });
    audio.play.mockImplementation(async () => {
      expect(audio.volume).toBe(0);
    });

    await preview.open({ tracks: [track('a')] });
    frames.run(1000);
    expect(audio.volume).toBe(0);
    frames.run(1150);
    expect(audio.volume).toBeCloseTo(0.2);
    frames.run(1300);
    expect(audio.volume).toBe(0.4);
    frames.run(1316);
    expect(audio.volume).toBe(0.4);
  });

  it('restores the volume when playback fails to start', async () => {
    const { audio, preview } = createHarness({
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });
    audio.play.mockRejectedValue(
      Object.assign(new Error('x'), { name: 'AbortError' }),
    );

    await preview.open({ tracks: [track('a')] });

    expect(audio.volume).toBe(0.4);
  });

  it('estimates the segment from lyrics when no chorus is analysed', async () => {
    const chorus = ['君と見た夢を追いかけて', '夜明けの空へ走り出す'];
    const lines = [
      [20, '静かな街の片隅で'],
      ...chorus.map((text, index) => [50 + index * 4, text]),
      [80, '遠回りばかりの日々を'],
      ...chorus.map((text, index) => [110 + index * 4, text]),
      [140, '最後にもう一度だけ'],
    ].map(([start, text]) => ({ start, text }));
    const getLyrics = vi.fn(async () => ({ lines, offsetSeconds: 0 }));
    const { preview } = createHarness({ getLyrics });

    await preview.open({ tracks: [track('a')] });

    expect(getLyrics).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
    expect(preview.state.segment).toMatchObject({
      start: 48,
      source: 'lyrics',
    });
  });

  it('falls back quietly when the lyrics cannot be read', async () => {
    const { preview, recordError } = createHarness({
      getLyrics: async () => {
        throw new Error('unreadable');
      },
    });

    await preview.open({ tracks: [track('a')] });

    expect(preview.state.segment).toMatchObject({
      start: 58,
      source: 'estimated',
    });
    expect(recordError).not.toHaveBeenCalled();
  });

  it('cancels the pending frame on close', async () => {
    const cancelFrame = vi.fn();
    const { preview } = createHarness({
      requestFrame: () => 42,
      cancelFrame,
    });
    await preview.open({ tracks: [track('a')] });

    preview.close();

    expect(cancelFrame).toHaveBeenCalledWith(42);
  });

  it('refuses an empty or unplayable track list', async () => {
    const { bgm, preview } = createHarness();

    await expect(preview.open({ tracks: [{ id: 'x' }] })).resolves.toBe(false);
    expect(bgm.acquirePreviewLane).not.toHaveBeenCalled();
    expect(preview.state.isOpen).toBe(false);
  });

  it('never acquires or loads an external source and keeps local candidate order', async () => {
    const { audio, bgm, preview } = createHarness();
    const external = track('external', {
      url: 'https://example.com/preview.mp3',
    });
    await expect(preview.open({ tracks: [external] })).resolves.toBe(false);
    expect(bgm.acquirePreviewLane).not.toHaveBeenCalled();
    await preview.open({
      tracks: [external, track('c'), { id: 'undownloaded' }, track('a')],
      startIndex: 3,
    });
    expect(preview.state.tracks.map((t) => t.id)).toEqual(['c', 'a']);
    expect(audio.src).toBe('utawakui-media://track/a/audio.wav');
    preview.close();
  });
});
