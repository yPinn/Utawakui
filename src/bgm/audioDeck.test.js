import { describe, expect, it, vi } from 'vitest';

import { createBgmAudioDeck } from './audioDeck.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class MockAudio {
  constructor() {
    this.currentTime = 0;
    this.duration = 0;
    this.error = null;
    this.loop = false;
    this.paused = true;
    this.listeners = new Map();
    this.play = vi.fn(async () => {
      this.paused = false;
      this.dispatch('play');
    });
    this.pause = vi.fn(() => {
      this.paused = true;
      this.dispatch('pause');
    });
    this.load = vi.fn();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }

  removeAttribute(attribute) {
    if (attribute === 'src') this.src = '';
  }
}

class MockAudioParam {
  constructor() {
    this.value = 1;
    this.cancelScheduledValues = vi.fn();
    this.setValueAtTime = vi.fn((value) => {
      this.value = value;
    });
    this.linearRampToValueAtTime = vi.fn((value) => {
      this.value = value;
    });
  }
}

function createHarness({ wait } = {}) {
  const audio = new MockAudio();
  const gain = { gain: new MockAudioParam(), connect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    currentTime: 10,
    destination: {},
    state: 'suspended',
    createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
  };
  const createAudioContext = vi.fn(() => context);
  const deck = createBgmAudioDeck({
    audio,
    createAudioContext,
    wait: wait ?? vi.fn(async () => {}),
  });
  return { audio, context, createAudioContext, deck, gain, source };
}

describe('BGM audio deck', () => {
  it('starts at 25% base volume with Talk disabled', async () => {
    const { audio, deck, gain } = createHarness();

    expect(deck.state.isDimmed).toBe(false);
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;
    await deck.fadeIn(0);

    expect(deck.state.playbackPhase).toBe('playing');
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0.25,
      10,
    );
  });

  it('loads a monitor-only source without creating Web Audio or autoplaying', () => {
    const { audio, createAudioContext, deck } = createHarness();

    deck.load('utawakui-media://track/bgm/audio.wav', {
      loop: false,
      positionSeconds: 12,
    });

    expect(audio.crossOrigin).toBe('anonymous');
    expect(audio.src).toBe('utawakui-media://track/bgm/audio.wav');
    expect(audio.loop).toBe(true);
    expect(audio.currentTime).toBe(12);
    expect(audio.play).not.toHaveBeenCalled();
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(deck.state.playbackPhase).toBe('paused');
  });

  it('keeps the single BGM source looped and seeks through the audio authority', () => {
    const { audio, deck } = createHarness();
    deck.load('utawakui-media://track/bgm/audio.wav', { loop: false });
    audio.duration = 180;
    audio.dispatch('loadedmetadata');

    expect(audio.loop).toBe(true);
    expect(deck.seek(42.5)).toBe(42.5);
    expect(audio.currentTime).toBe(42.5);
    expect(deck.state.currentTime).toBe(42.5);
    expect(deck.seek(999)).toBe(180);
    expect(deck.seek(Number.NaN)).toBe(180);
  });

  it('waits for the audio element playing event before confirming playback', async () => {
    const { audio, deck } = createHarness();
    deck.load('utawakui-media://track/bgm/audio.wav');

    let settled = false;
    const playPromise = deck.startSilent().then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();

    expect(audio.play).toHaveBeenCalledOnce();
    expect(deck.state.playbackPhase).toBe('buffering');
    expect(settled).toBe(false);

    audio.dispatch('playing');
    await expect(playPromise).resolves.toBe(true);
    expect(deck.state.playbackPhase).toBe('playing');
  });

  it('fades out to exact zero before pausing the element', async () => {
    const deferred = createDeferred();
    const wait = vi.fn(() => deferred.promise);
    const { audio, context, deck, gain } = createHarness({ wait });
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;
    gain.gain.value = 0.5;

    const fadePromise = deck.fadeOutAndPause(1);

    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 11);
    expect(audio.pause).not.toHaveBeenCalled();
    deferred.resolve();
    await expect(fadePromise).resolves.toBe(true);
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 11);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(deck.isSilentAndPaused()).toBe(true);
    expect(context.createGain).toHaveBeenCalledOnce();
  });

  it('does not let a stale fade-out pause a newer transition', async () => {
    const fadeOutWait = createDeferred();
    const wait = vi
      .fn()
      .mockImplementationOnce(() => fadeOutWait.promise)
      .mockResolvedValue(undefined);
    const { audio, deck } = createHarness({ wait });
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;

    const fadeOutPromise = deck.fadeOutAndPause(1);
    await deck.fadeIn(0.5);
    fadeOutWait.resolve();

    await expect(fadeOutPromise).resolves.toBe(false);
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it('cancels a play request that is still waiting for AudioContext resume', async () => {
    const resume = createDeferred();
    const { audio, context, deck } = createHarness();
    context.resume.mockImplementation(() => resume.promise);
    deck.load('utawakui-media://track/bgm/audio.wav');

    const playPromise = deck.startSilent();
    await vi.waitFor(() => expect(context.resume).toHaveBeenCalledOnce());
    expect(deck.state.playIntentActive).toBe(true);
    await expect(deck.fadeOutAndPause(1)).resolves.toBe(true);
    expect(deck.state.playIntentActive).toBe(false);
    resume.resolve();

    await expect(playPromise).resolves.toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
    expect(deck.isSilentAndPaused()).toBe(true);
  });

  it('rejects a late playing event after an emergency cut', async () => {
    const { audio, deck } = createHarness();
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();

    deck.cut();
    audio.dispatch('playing');

    await expect(playPromise).resolves.toBe(false);
    expect(audio.pause).toHaveBeenCalled();
    expect(deck.state.isPlaying).toBe(false);
    expect(deck.state.playbackPhase).toBe('paused');
  });

  it('combines master volume, mute, and dim without stale snapshots', async () => {
    const { audio, deck, gain } = createHarness();
    deck.configure({
      volume: 0.8,
      isMuted: false,
      dimDb: -12,
      dimAttackMs: 100,
      dimReleaseMs: 600,
    });
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;

    deck.setDimmed(true);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0.8 * 10 ** (-12 / 20),
      10.1,
    );

    deck.setVolume(0.5);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0.5 * 10 ** (-12 / 20),
      10.1,
    );

    deck.setMuted(true);
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    deck.setMuted(false);
    deck.setDimmed(false);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0.5,
      10.6,
    );
  });

  it('cuts the gain immediately when the media element fails during playback', async () => {
    const { audio, deck, gain } = createHarness();
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;
    gain.gain.value = 0.5;

    audio.error = new Error('private decoder detail');
    audio.dispatch('error');

    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(deck.state.isPlaying).toBe(false);
    expect(deck.state.playbackPhase).toBe('error');
    expect(deck.state.error).toBe('BGM 音訊無法播放。');
  });

  it('cuts synchronously, records bounded errors, and tears down listeners', async () => {
    const { audio, context, deck, gain, source } = createHarness();
    deck.load('utawakui-media://track/bgm/audio.wav');
    const playPromise = deck.startSilent();
    audio.dispatch('playing');
    await playPromise;

    expect(deck.cut()).toBe(true);
    expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    expect(audio.pause).toHaveBeenCalledOnce();

    audio.error = new Error('private decoder detail');
    audio.dispatch('error');
    expect(deck.state.error).toBe('BGM 音訊無法播放。');
    expect(deck.state.error).not.toContain('private');

    await deck.dispose();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(audio.listeners.size).toBe(0);
  });
});
