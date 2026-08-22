import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@soundtouchjs/audio-worklet', () => ({
  SoundTouchNode: class {
    static instances = [];

    static register = vi.fn((context, processorUrl) =>
      context.audioWorklet.addModule(processorUrl),
    );

    constructor({ context }) {
      if (!context.workletRegistered) {
        throw new Error(
          'SoundTouch processor is not registered in this context',
        );
      }
      this.context = context;
      this.pitchSemitones = { value: 0 };
      this.pitch = { value: 1 };
      this.constructor.instances.push(this);
    }

    connect() {}

    disconnect() {}
  },
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
  static instances = [];

  constructor() {
    this.currentTime = 0;
    this.destination = new MockAudioNode();
    this.sinkId = '';
    this.workletRegistered = false;
    this.failWorkletRegistration = false;
    this.createdGains = [];
    this.audioWorklet = {
      addModule: vi.fn(async () => {
        if (this.failWorkletRegistration) {
          throw new Error('worklet registration failed');
        }
        this.workletRegistered = true;
      }),
    };
    MockAudioContext.instances.push(this);
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
    const node = new MockAudioNode();
    this.createdGains.push(node);
    return node;
  }

  createMediaStreamDestination() {
    return new MockAudioNode();
  }

  createMediaStreamSource() {
    return new MockAudioNode();
  }

  addEventListener() {}

  removeEventListener() {}

  async setSinkId(deviceId) {
    this.sinkId = deviceId;
  }

  async resume() {}

  async suspend() {}

  async close() {}
}

class MockAudio {
  constructor() {
    this.currentTime = 0;
    this.duration = 0;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
    this.error = null;
    this.listeners = new Map();
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
  MockAudioContext.instances = [];
  vi.stubGlobal('Audio', MockAudio);
  vi.stubGlobal('AudioContext', MockAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPlayer() {
  const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');
  SoundTouchNode.instances.length = 0;
  SoundTouchNode.register.mockClear();
  const { usePlayer } = await import('./usePlayer.js');
  return usePlayer();
}

function pitchCrossfade(context) {
  return {
    dry: context.createdGains[2].gain.value,
    wet: context.createdGains[3].gain.value,
  };
}

describe('guide vocal defaults', () => {
  it('starts with monitor on at 50% and capture off at 0%', async () => {
    const { state } = await loadPlayer();

    expect(state.guideVocalOn).toBe(true);
    expect(state.guideVocalValue).toBe(0.5);
    expect(state.captureGuideVocalOn).toBe(false);
    expect(state.captureGuideVocalValue).toBe(0);
  });

  it('resets only on/off per track while preserving calibrated values', async () => {
    const player = await loadPlayer();

    player.setGuideVocalValue(0.75);
    player.setGuideVocalOn(false);
    player.setCaptureGuideVocalValue(0.25);
    player.setCaptureGuideVocalOn(true);

    await player.playTrack({
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track/track-1/audio.wav',
    });

    expect(player.state.guideVocalOn).toBe(true);
    expect(player.state.guideVocalValue).toBe(0.75);
    expect(player.state.captureGuideVocalOn).toBe(false);
    expect(player.state.captureGuideVocalValue).toBe(0.25);

    player.setGuideVocalOn(false);
    player.setCaptureGuideVocalOn(true);
    player.restartTrack();

    expect(player.state.guideVocalOn).toBe(true);
    expect(player.state.guideVocalValue).toBe(0.75);
    expect(player.state.captureGuideVocalOn).toBe(false);
    expect(player.state.captureGuideVocalValue).toBe(0.25);
  });
});

describe('transpose AudioWorklet routing', () => {
  it('rolls back monitor state when registration fails and retries later', async () => {
    const player = await loadPlayer();
    const monitorContext = MockAudioContext.instances[0];
    monitorContext.failWorkletRegistration = true;

    await player.setTransposeSemitones(2);

    expect(player.state.transposeSemitones).toBe(0);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 1, wet: 0 });
    expect(player.state.error).toBe('worklet registration failed');

    monitorContext.failWorkletRegistration = false;
    await player.setTransposeSemitones(2);

    expect(monitorContext.audioWorklet.addModule).toHaveBeenCalledTimes(2);
    expect(player.state.transposeSemitones).toBe(2);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.error).toBeNull();
  });

  it('registers and activates SoundTouch in both monitor and capture contexts', async () => {
    const player = await loadPlayer();
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');

    await player.applyCaptureDevice('capture-device');
    await player.setTransposeSemitones(2);

    const [monitorContext, captureContext] = MockAudioContext.instances;
    expect(monitorContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(SoundTouchNode.instances).toHaveLength(2);
    expect(
      SoundTouchNode.instances.map((node) => node.pitchSemitones.value),
    ).toEqual([2, 2]);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 0, wet: 1 });
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureError).toBeNull();
  });

  it('syncs an existing transpose when capture is selected later', async () => {
    const player = await loadPlayer();
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');

    await player.setTransposeSemitones(-3);
    await player.applyCaptureDevice('capture-device');

    const captureContext = MockAudioContext.instances[1];
    const capturePitchNode = SoundTouchNode.instances.find(
      (node) => node.context === captureContext,
    );
    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(capturePitchNode.pitchSemitones.value).toBe(-3);
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureDeviceId).toBe('capture-device');
    expect(player.state.captureError).toBeNull();
  });

  it('keeps monitor transpose active if capture worklet registration fails', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const [monitorContext, captureContext] = MockAudioContext.instances;
    captureContext.failWorkletRegistration = true;

    await player.setTransposeSemitones(4);

    expect(player.state.transposeSemitones).toBe(4);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 0, wet: 1 });
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 1, wet: 0 });
    expect(player.state.captureError).toBe('worklet registration failed');

    await player.setTransposeSemitones(0);

    expect(player.state.captureError).toBeNull();
    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();

    captureContext.failWorkletRegistration = false;
    await player.setTransposeSemitones(5);

    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledTimes(2);
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureError).toBeNull();
  });

  it('hydrates transpose and fine pitch together when capture retries', async () => {
    const player = await loadPlayer();
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    captureContext.failWorkletRegistration = true;
    await player.setPitchCents(12);

    captureContext.failWorkletRegistration = false;
    await player.setTransposeSemitones(2);

    const capturePitchNode = SoundTouchNode.instances.find(
      (node) => node.context === captureContext,
    );
    expect(capturePitchNode.pitchSemitones.value).toBe(2);
    expect(capturePitchNode.pitch.value).toBeCloseTo(2 ** (12 / 1200));
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureError).toBeNull();
  });
});
