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
    this.failSetSinkId = false;
    this.listeners = new Map();
    this.resume = vi.fn();
    this.suspend = vi.fn();
    this.close = vi.fn();
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

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }

  async setSinkId(deviceId) {
    if (this.failSetSinkId) throw new Error('sink unavailable');
    this.sinkId = deviceId;
  }
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
    this.failPlay = false;
    this.play = vi.fn(async () => {
      if (this.failPlay) throw new Error('play failed');
      this.dispatch('play');
    });
    this.pause = vi.fn(() => this.dispatch('pause'));
    this.load = vi.fn();
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

  removeAttribute(attribute) {
    if (attribute === 'src') this.src = '';
  }
}

beforeEach(() => {
  vi.resetModules();
  MockAudioContext.instances = [];
  MockAudio.latest = null;
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
  it('preserves the stable public player contract', async () => {
    const player = await loadPlayer();

    expect(Object.keys(player).sort()).toEqual(
      [
        'applyCaptureDevice',
        'clearTrack',
        'cyclePlaybackMode',
        'onEnded',
        'pause',
        'play',
        'playTrack',
        'resetPitchTempo',
        'restartTrack',
        'seek',
        'setCaptureGuideVocalOn',
        'setCaptureGuideVocalValue',
        'setGuideVocalOn',
        'setGuideVocalValue',
        'setPitchCents',
        'setPlaybackMode',
        'setTempoRate',
        'setTransposeSemitones',
        'setVolume',
        'state',
        'toggle',
        'toggleCaptureGuideVocal',
        'toggleMute',
        'toggleRepeat',
      ].sort(),
    );
  });

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

  it('clamps guide-vocal calibration independently for monitor and capture', async () => {
    const player = await loadPlayer();

    player.setGuideVocalValue(2);
    player.setCaptureGuideVocalValue(-1);

    expect(player.state.guideVocalValue).toBe(1);
    expect(player.state.captureGuideVocalValue).toBe(0);
  });
});

describe('mix and transport controls', () => {
  it('drives master gain through volume and mute actions', async () => {
    const player = await loadPlayer();
    const monitorContext = MockAudioContext.instances[0];
    const masterGain = monitorContext.createdGains[1].gain;

    player.setVolume(0.8);
    expect(player.state.volume).toBe(0.8);
    expect(masterGain.value).toBe(0.8);

    player.toggleMute();
    expect(player.state.isMuted).toBe(true);
    expect(masterGain.value).toBe(0);

    player.setVolume(0.3);
    expect(masterGain.value).toBe(0);

    player.toggleMute();
    expect(player.state.isMuted).toBe(false);
    expect(masterGain.value).toBe(0.3);
  });

  it('cycles playback modes and keeps native looping synchronized', async () => {
    const player = await loadPlayer();

    player.setPlaybackMode('invalid');
    expect(player.state.playbackMode).toBe('sequence');
    expect(MockAudio.latest.loop).toBe(false);

    player.cyclePlaybackMode();
    expect(player.state.playbackMode).toBe('repeat-list');
    player.toggleRepeat();
    expect(player.state.playbackMode).toBe('repeat-one');
    expect(player.state.isLooping).toBe(true);
    expect(MockAudio.latest.loop).toBe(true);
  });

  it('clamps tempo and resets pitch controls for a new track', async () => {
    const player = await loadPlayer();

    player.setTempoRate(4);
    expect(player.state.tempoRate).toBe(1.5);
    expect(MockAudio.latest.defaultPlaybackRate).toBe(1.5);
    expect(MockAudio.latest.playbackRate).toBe(1.5);

    await player.setPitchCents(100);
    expect(player.state.pitchCents).toBe(50);

    await player.playTrack({
      id: 'track-2',
      title: 'Track 2',
      url: 'utawakui-media://track/track-2/audio.wav',
    });
    expect(player.state.pitchCents).toBe(0);
    expect(player.state.tempoRate).toBe(1);
  });

  it('uses audio-element events as the playback clock and error authority', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;

    await player.playTrack({
      id: 'track-events',
      title: 'Track Events',
      url: 'utawakui-media://track/track-events/audio.wav',
    });
    audio.duration = 123;
    audio.currentTime = 12;
    audio.dispatch('loadedmetadata');
    expect(player.state.duration).toBe(123);
    expect(player.state.currentTime).toBe(12);

    audio.dispatch('playing');
    audio.currentTime = 13;
    audio.dispatch('timeupdate');
    expect(player.state.currentTime).toBe(13);
    expect(player.state.playbackPhase).toBe('playing');

    audio.error = new Error('private decoder failure');
    audio.dispatch('error');
    expect(player.state.isPlaying).toBe(false);
    expect(player.state.playbackPhase).toBe('error');
    expect(player.state.error).toBe('目前無法播放這首曲目，請再試一次。');
    expect(player.state.error).not.toContain('decoder');
  });

  it('resets per-track switches on a native repeat-one loop wrap', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;

    await player.playTrack({
      id: 'track-loop',
      title: 'Track Loop',
      url: 'utawakui-media://track/track-loop/audio.wav',
    });
    player.setPlaybackMode('repeat-one');
    player.setGuideVocalValue(0.7);
    player.setGuideVocalOn(false);
    player.setCaptureGuideVocalValue(0.2);
    player.setCaptureGuideVocalOn(true);
    player.setTempoRate(1.2);
    await player.setTransposeSemitones(2);

    audio.duration = 100;
    audio.currentTime = 99.5;
    audio.dispatch('loadedmetadata');
    audio.dispatch('timeupdate');
    audio.currentTime = 0.2;
    audio.dispatch('timeupdate');

    expect(player.state.guideVocalOn).toBe(true);
    expect(player.state.guideVocalValue).toBe(0.7);
    expect(player.state.captureGuideVocalOn).toBe(false);
    expect(player.state.captureGuideVocalValue).toBe(0.2);
    expect(player.state.transposeSemitones).toBe(0);
    expect(player.state.tempoRate).toBe(1);
  });

  it('toggles through the audio element and clears only the intended track', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;

    await player.play();
    expect(audio.play).not.toHaveBeenCalled();

    await player.playTrack({
      id: 'track-clear',
      title: 'Track Clear',
      url: 'utawakui-media://track/track-clear/audio.wav',
    });
    player.toggle();
    expect(audio.pause).toHaveBeenCalledOnce();
    audio.dispatch('pause');
    player.toggle();
    await Promise.resolve();
    expect(audio.play).toHaveBeenCalledTimes(2);

    expect(player.clearTrack('another-track')).toBe(false);
    expect(player.state.track.id).toBe('track-clear');
    expect(player.clearTrack('track-clear')).toBe(true);
    expect(player.state.track).toBeNull();
    expect(player.state.playbackPhase).toBe('idle');
    expect(audio.src).toBe('');
    expect(audio.load).toHaveBeenCalledOnce();
  });

  it('converts play and resume failures to bounded public errors', async () => {
    const player = await loadPlayer();
    const monitorContext = MockAudioContext.instances[0];

    monitorContext.resume.mockRejectedValueOnce(new Error('private resume'));
    await player.playTrack({
      id: 'track-failure',
      title: 'Track Failure',
      url: 'utawakui-media://track/track-failure/audio.wav',
    });
    expect(player.state.error).toBe('目前無法播放這首曲目，請再試一次。');

    MockAudio.latest.failPlay = true;
    await player.play();
    expect(player.state.error).toBe('目前無法繼續播放，請再試一次。');
    expect(player.state.error).not.toContain('private');
  });

  it('notifies ended listeners and supports explicit unsubscription', async () => {
    const player = await loadPlayer();
    const listener = vi.fn();
    const unsubscribe = player.onEnded(listener);

    await player.playTrack({
      id: 'track-ended',
      title: 'Track Ended',
      url: 'utawakui-media://track/track-ended/audio.wav',
    });
    MockAudio.latest.currentTime = 90;
    MockAudio.latest.dispatch('ended');
    expect(listener).toHaveBeenCalledOnce();
    expect(player.state.playbackPhase).toBe('ended');

    unsubscribe();
    MockAudio.latest.dispatch('ended');
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('library synchronization', () => {
  it('refreshes metadata without reloading an unchanged playable URL', async () => {
    let libraryUpdated;
    const listTracks = vi.fn().mockResolvedValue([
      {
        id: 'track-sync',
        title: 'Updated title',
        url: 'utawakui-media://track/track-sync/audio.wav',
      },
    ]);
    vi.stubGlobal('window', {
      Utawakui: {
        listTracks,
        onLibraryUpdated: vi.fn((listener) => {
          libraryUpdated = listener;
          return vi.fn();
        }),
      },
    });
    const player = await loadPlayer();
    await player.playTrack({
      id: 'track-sync',
      title: 'Old title',
      url: 'utawakui-media://track/track-sync/audio.wav',
    });
    MockAudio.latest.play.mockClear();

    await libraryUpdated({ sourceType: 'local-file' });

    expect(listTracks).toHaveBeenCalledWith({ sourceType: 'local-file' });
    expect(player.state.track.title).toBe('Updated title');
    expect(MockAudio.latest.play).not.toHaveBeenCalled();
  });

  it('restores position and mix calibration when the playable URL changes', async () => {
    let libraryUpdated;
    vi.stubGlobal('window', {
      Utawakui: {
        listTracks: vi.fn().mockResolvedValue([
          {
            id: 'track-sync',
            title: 'Separated title',
            url: 'utawakui-media://track/track-sync/audio.wav',
            stemsUrl: 'utawakui-media://track/track-sync/stems.wav',
            hasSeparation: true,
          },
        ]),
        onLibraryUpdated: vi.fn((listener) => {
          libraryUpdated = listener;
          return vi.fn();
        }),
      },
    });
    const player = await loadPlayer();
    await player.playTrack({
      id: 'track-sync',
      title: 'Original title',
      url: 'utawakui-media://track/track-sync/audio.wav',
    });
    player.seek(37);
    MockAudio.latest.dispatch('seeking');
    MockAudio.latest.dispatch('seeked');
    player.setGuideVocalValue(0.8);
    player.setGuideVocalOn(false);
    player.setCaptureGuideVocalValue(0.3);
    player.setCaptureGuideVocalOn(true);
    MockAudio.latest.play.mockClear();

    await libraryUpdated();

    expect(player.state.track.usesSeparatedAudio).toBe(true);
    expect(MockAudio.latest.src).toContain('/stems.wav');
    expect(MockAudio.latest.currentTime).toBe(37);
    expect(player.state.guideVocalOn).toBe(false);
    expect(player.state.guideVocalValue).toBe(0.8);
    expect(player.state.captureGuideVocalOn).toBe(true);
    expect(player.state.captureGuideVocalValue).toBe(0.3);
    expect(MockAudio.latest.play).toHaveBeenCalledOnce();
  });
});

describe('capture device lifecycle', () => {
  it('suspends capture output when the selected device is cleared', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    await player.applyCaptureDevice(null);

    expect(captureContext.suspend).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
  });

  it('clears an unavailable capture device with bounded public error copy', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    captureContext.failSetSinkId = true;
    await player.applyCaptureDevice('missing-device');

    expect(captureContext.suspend).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBe('擷取輸出裝置無法使用。');
  });

  it('reacts to involuntary sink loss without retaining a stale device id', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    captureContext.sinkId = '';
    captureContext.dispatch('sinkchange');

    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBe('選擇的輸出裝置已中斷連線。');
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
    expect(player.state.error).toBe('音高調整暫時無法使用。');

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
    expect(player.state.captureError).toBe('擷取輸出的音高調整暫時無法使用。');

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
