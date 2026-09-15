import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('signalsmith-stretch', () => ({
  default: vi.fn(async () => ({
    schedule: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

class MockAudioParam {
  constructor(value = 0) {
    this.value = value;
  }

  setTargetAtTime(value) {
    this.value = value;
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }
}

class MockAudioNode {
  constructor() {
    this.gain = new MockAudioParam();
    this.stream = {};
  }

  connect() {
    return this;
  }

  disconnect() {}
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new MockAudioNode();
    this.sinkId = '';
    this.audioWorklet = { addModule: vi.fn().mockResolvedValue() };
  }

  createMediaElementSource() {
    return new MockAudioNode();
  }

  createChannelSplitter() {
    return new MockAudioNode();
  }

  createChannelMerger() {
    return new MockAudioNode();
  }

  createGain() {
    return new MockAudioNode();
  }

  createMediaStreamDestination() {
    return new MockAudioNode();
  }

  createMediaStreamSource() {
    return new MockAudioNode();
  }

  addEventListener() {}

  removeEventListener() {}

  async resume() {}

  async close() {}
}

class MockAudio {
  static latest = null;

  constructor() {
    this.currentTime = 0;
    this.duration = 0;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
    this.error = null;
    this.listeners = new Map();
    MockAudio.latest = this;
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

  async play() {
    this.dispatch('play');
  }

  pause() {
    this.dispatch('pause');
  }

  removeAttribute(attribute) {
    if (attribute === 'src') this.src = '';
  }

  load() {}
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('Audio', MockAudio);
  vi.stubGlobal('AudioContext', MockAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playback phase', () => {
  it('follows media readiness and seek events instead of play intent alone', async () => {
    const { usePlayer } = await import('./usePlayer.js');
    const player = usePlayer();

    await player.playTrack({
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track/track-1/audio.wav',
    });
    expect(player.state.playbackPhase).toBe('buffering');

    MockAudio.latest.dispatch('playing');
    expect(player.state.playbackPhase).toBe('playing');

    MockAudio.latest.dispatch('waiting');
    expect(player.state.playbackPhase).toBe('buffering');

    MockAudio.latest.dispatch('seeking');
    expect(player.state.playbackPhase).toBe('seeking');

    MockAudio.latest.dispatch('seeked');
    expect(player.state.playbackPhase).toBe('buffering');

    MockAudio.latest.dispatch('playing');
    player.pause();
    expect(player.state.playbackPhase).toBe('paused');

    MockAudio.latest.dispatch('ended');
    expect(player.state.playbackPhase).toBe('ended');
  });
});
