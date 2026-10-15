import { effectScope, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ unmounted: [] }));
const playerHarness = vi.hoisted(() => ({ current: null, calls: 0 }));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onUnmounted(callback) {
      lifecycle.unmounted.push(callback);
    },
  };
});

vi.mock('./usePlayer.js', () => ({
  usePlayer() {
    playerHarness.calls += 1;
    return playerHarness.current;
  },
}));

const transport = vi.hoisted(() => ({
  playPrevious: vi.fn(),
  playNext: vi.fn(),
}));
vi.mock('./usePlaybackTransport.js', () => ({
  usePlaybackTransport: () => transport,
}));

import { useMediaSession } from './useMediaSession.js';

class FakeMediaMetadata {
  constructor(value) {
    Object.assign(this, value);
  }
}

describe('useMediaSession', () => {
  let scope;
  let actionHandlers;
  let mediaSession;

  beforeEach(() => {
    lifecycle.unmounted = [];
    playerHarness.calls = 0;
    actionHandlers = new Map();
    mediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((name, handler) => {
        actionHandlers.set(name, handler);
      }),
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaSession },
    });
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
    playerHarness.current = {
      state: reactive({ track: null, isPlaying: false }),
      play: vi.fn(),
      pause: vi.fn(),
    };
    scope = effectScope();
  });

  afterEach(() => {
    lifecycle.unmounted.forEach((callback) => callback());
    scope.stop();
    vi.unstubAllGlobals();
  });

  it('is inert when the Media Session API is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });

    scope.run(() => useMediaSession());

    expect(playerHarness.calls).toBe(0);
    expect(lifecycle.unmounted).toHaveLength(0);
  });

  it('projects reactive track metadata and playback state', async () => {
    scope.run(() => useMediaSession());

    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe('none');

    playerHarness.current.state.track = {
      title: 'Night Song',
      artist: 'Singer',
    };
    await nextTick();

    expect(mediaSession.metadata).toMatchObject({
      title: 'Night Song',
      artist: 'Singer',
      artwork: [{ src: '/assets/icons/app-icon.png' }],
    });
    expect(mediaSession.playbackState).toBe('paused');

    playerHarness.current.state.isPlaying = true;
    await nextTick();
    expect(mediaSession.playbackState).toBe('playing');

    playerHarness.current.state.track = null;
    await nextTick();
    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe('none');
  });

  it('routes play, pause and track skipping and releases them on unmount', () => {
    transport.playPrevious.mockClear();
    transport.playNext.mockClear();
    scope.run(() => useMediaSession());

    expect([...actionHandlers.keys()]).toEqual([
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
    ]);
    actionHandlers.get('play')();
    actionHandlers.get('pause')();
    actionHandlers.get('previoustrack')();
    actionHandlers.get('nexttrack')();
    expect(playerHarness.current.play).toHaveBeenCalledOnce();
    expect(playerHarness.current.pause).toHaveBeenCalledOnce();
    expect(transport.playPrevious).toHaveBeenCalledOnce();
    expect(transport.playNext).toHaveBeenCalledOnce();

    lifecycle.unmounted.forEach((callback) => callback());
    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) {
      expect(actionHandlers.get(action)).toBeNull();
    }
  });
});
