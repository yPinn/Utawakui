import { describe, expect, it, vi } from 'vitest';
import { createNowPlaying } from './companionNowPlaying.js';

function setup({ playRejects = false } = {}) {
  const handlers = {};
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn((action, handler) => (handlers[action] = handler)),
    setPositionState: vi.fn(),
  };
  const audio = {
    paused: true,
    play: vi.fn(() => {
      if (playRejects) return Promise.reject(new Error('NotAllowed'));
      audio.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(() => (audio.paused = true)),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  };
  const onCommand = vi.fn();
  const revokeUrl = vi.fn();
  const nowPlaying = createNowPlaying({
    mediaSession,
    MediaMetadataImpl: class {
      constructor(value) {
        Object.assign(this, value);
      }
    },
    createAudio: () => audio,
    createUrl: () => 'blob:silence',
    createArtwork: async (src) => ({ url: `${src}:square`, edge: 160 }),
    revokeUrl,
    onCommand,
  });
  return { nowPlaying, mediaSession, audio, handlers, onCommand, revokeUrl };
}

describe('companion now playing trial', () => {
  it('starts the silent loop inside the tap and mirrors the computer', async () => {
    const { nowPlaying, mediaSession, audio } = setup();
    const enabling = nowPlaying.enable();
    // play() runs before any await, so the tap still counts.
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(await enabling).toBe(true);
    expect(audio.loop).toBe(true);
    nowPlaying.update({
      title: 'Song',
      artist: 'Singer',
      artworkUrl: 'blob:art',
      playing: false,
      durationSec: 200,
      positionSec: 30,
    });
    await Promise.resolve();
    await Promise.resolve();
    // Square crop with its real size, matching the in-app cover crop.
    expect(mediaSession.metadata).toMatchObject({
      title: 'Song',
      artist: 'Singer',
      artwork: [{ src: 'blob:art:square', sizes: '160x160' }],
    });
    expect(mediaSession.playbackState).toBe('paused');
    expect(audio.pause).toHaveBeenCalled();
    expect(mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: 200,
      position: 30,
      playbackRate: 1,
    });
    nowPlaying.update({ title: 'Song', artist: 'Singer', playing: true });
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(mediaSession.playbackState).toBe('playing');
  });

  it('turns lock-screen buttons into remote commands', async () => {
    const { nowPlaying, handlers, onCommand } = setup();
    await nowPlaying.enable();
    nowPlaying.update({ playing: true });
    handlers.play();
    handlers.pause();
    handlers.nexttrack();
    handlers.previoustrack();
    handlers.seekto({ seekTime: 12.5 });
    expect(onCommand.mock.calls).toEqual([
      ['player.play-pause'],
      ['player.next'],
      ['player.previous'],
      ['player.seek', { positionMs: 12500 }],
    ]);
  });

  it('stays off when turned off while starting', async () => {
    const { nowPlaying, handlers } = setup();
    const enabling = nowPlaying.enable();
    nowPlaying.disable();
    expect(await enabling).toBe(false);
    expect(nowPlaying.enabled).toBe(false);
    expect(handlers.play).toBeNull();
  });

  it('drops a crop that finishes after the track changed', async () => {
    const { nowPlaying, mediaSession, revokeUrl } = setup();
    await nowPlaying.enable();
    nowPlaying.update({ title: 'A', artworkUrl: 'blob:a' });
    nowPlaying.update({ title: 'B', artworkUrl: 'blob:b' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(mediaSession.metadata).toMatchObject({
      title: 'B',
      artwork: [{ src: 'blob:b:square' }],
    });
    expect(revokeUrl).toHaveBeenCalledWith('blob:a:square');
  });

  it('cleans up when turned off or when the browser refuses playback', async () => {
    const on = setup();
    await on.nowPlaying.enable();
    on.nowPlaying.update({ title: 'A', artworkUrl: 'blob:a' });
    await new Promise((resolve) => setTimeout(resolve));
    on.nowPlaying.disable();
    expect(on.revokeUrl).toHaveBeenCalledWith('blob:a:square');
    expect(on.nowPlaying.enabled).toBe(false);
    expect(on.handlers.play).toBeNull();
    expect(on.mediaSession.playbackState).toBe('none');
    expect(on.revokeUrl).toHaveBeenCalledWith('blob:silence');

    const refused = setup({ playRejects: true });
    expect(await refused.nowPlaying.enable()).toBe(false);
    expect(refused.nowPlaying.enabled).toBe(false);
    expect(refused.revokeUrl).toHaveBeenCalled();
  });
});
