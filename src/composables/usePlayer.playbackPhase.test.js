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
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    if (!this.listeners.get(type)?.size) this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.forEach((listener) => listener({ type }));
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
  it('pairs a read-only actual media sample with its timestamp, identity and event phase', async () => {
    const { usePlayer } = await import('./usePlayer.js');
    const player = usePlayer();
    await player.playTrack({
      id: 'a',
      url: 'utawakui-media://track/a/audio.wav',
    });
    const audio = MockAudio.latest;
    audio.dispatch('playing');
    audio.currentTime = 1.234;
    audio.playbackRate = 1.25;
    const sampled = player.samplePlaybackClock({
      now: () => '2026-10-22T00:00:01.234Z',
    });
    expect(sampled).toMatchObject({
      trackId: 'a',
      positionMs: 1234,
      rate: 1.25,
      phase: 'playing',
      sampledAt: '2026-10-22T00:00:01.234Z',
      continuityRevision: player.state.continuityRevision,
      playbackRevision: player.state.playbackRevision,
    });
    expect(player.state.currentTime).toBe(0);
    audio.dispatch('waiting');
    expect(player.samplePlaybackClock().phase).toBe('buffering');
    audio.dispatch('seeking');
    expect(player.samplePlaybackClock().phase).toBe('seeking');
    player.pause();
    expect(player.samplePlaybackClock().phase).toBe('paused');
  });
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

describe('native EOF pause boundary', () => {
  it('lets ended own terminal notification when Chromium emits pause first, but preserves real pause near EOF', async () => {
    const { usePlayer, cleanupPlayerResources } =
      await import('./usePlayer.js');
    const player = usePlayer();
    const paused = vi.fn(),
      ended = vi.fn();
    player.onPaused(paused);
    player.onEnded(ended);
    await player.playTrack({
      id: 'eof',
      title: 'EOF',
      url: 'utawakui-media://track/eof/audio.wav',
    });
    const audio = MockAudio.latest;
    audio.duration = 120;
    audio.dispatch('playing');
    audio.currentTime = 119.99;
    audio.ended = false;
    audio.dispatch('pause');
    expect(paused).toHaveBeenCalledOnce();
    audio.dispatch('playing');
    paused.mockClear();
    audio.currentTime = 120;
    audio.ended = true;
    audio.dispatch('pause');
    expect(paused).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    audio.dispatch('ended');
    expect(ended).toHaveBeenCalledOnce();
    expect(player.state.playbackPhase).toBe('ended');
    cleanupPlayerResources();
  });
});
