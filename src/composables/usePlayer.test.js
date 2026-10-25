import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors signalsmith-stretch's real behavior (confirmed by reading the
// package source, see ADR 0019): the AudioWorklet module-registration
// promise is cached directly on the AudioContext object and never cleared
// on rejection, so a transient addModule failure is permanent for that
// context's whole lifetime — retrying against the same context keeps
// re-throwing the same error instead of recovering.
vi.mock('signalsmith-stretch', () => {
  const registrationByContext = new WeakMap();

  class MockPitchNode {
    static instances = [];

    constructor(context) {
      this.context = context;
      this.schedule = vi.fn();
      this.connect = vi.fn();
      this.constructor.instances.push(this);
    }

    disconnect() {}
  }

  const SignalsmithStretch = vi.fn(async (context, options) => {
    // Chromium's AudioWorkletNode rejects a non-sequence outputChannelCount.
    if (options && !Array.isArray(options.outputChannelCount)) {
      throw new TypeError('outputChannelCount must be a sequence');
    }
    if (!registrationByContext.has(context)) {
      registrationByContext.set(
        context,
        context.audioWorklet.addModule('signalsmith-stretch-processor'),
      );
    }
    await registrationByContext.get(context);
    return new MockPitchNode(context);
  });

  return { default: SignalsmithStretch, MockPitchNode };
});

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
    this.connect = vi.fn(() => this);
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
  static failNextDefaultResume = false;
  static unavailableSinkIds = new Set();
  static suspendedSinkIds = new Set();
  static resumeDeferredBySinkId = new Map();
  static workletDeferredBySinkId = new Map();
  static closeDeferredBySinkId = new Map();

  constructor(options = {}) {
    this.options = options;
    this.currentTime = 0;
    this.destination = new MockAudioNode();
    this.sinkId = options.sinkId ?? '';
    this.state = 'suspended';
    this.failWorkletRegistration = false;
    this.failSetSinkId = false;
    this.listeners = new Map();
    this.resume = vi.fn(async () => {
      if (!this.sinkId && MockAudioContext.failNextDefaultResume) {
        MockAudioContext.failNextDefaultResume = false;
        throw new Error('default sink unavailable');
      }
      const deferred = MockAudioContext.resumeDeferredBySinkId.get(this.sinkId);
      if (deferred) await deferred.promise;
      if (MockAudioContext.unavailableSinkIds.has(this.sinkId)) {
        throw new Error('sink unavailable');
      }
      if (MockAudioContext.suspendedSinkIds.has(this.sinkId)) return;
      this.state = 'running';
    });
    this.suspend = vi.fn(async () => {
      this.state = 'suspended';
    });
    this.close = vi.fn(async () => {
      const deferred = MockAudioContext.closeDeferredBySinkId.get(this.sinkId);
      if (deferred) await deferred.promise;
      this.state = 'closed';
    });
    this.setSinkId = vi.fn(async (deviceId) => {
      if (this.failSetSinkId) throw new Error('sink unavailable');
      this.sinkId = deviceId;
    });
    this.createdGains = [];
    this.createdStreamSources = [];
    this.audioWorklet = {
      addModule: vi.fn(async () => {
        const deferred = MockAudioContext.workletDeferredBySinkId.get(
          this.sinkId,
        );
        if (deferred) await deferred.promise;
        if (this.failWorkletRegistration) {
          throw new Error('worklet registration failed');
        }
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

  createMediaStreamSource(stream) {
    const source = new MockAudioNode();
    source.stream = stream;
    source.connect = vi.fn();
    source.disconnect = vi.fn();
    this.createdStreamSources.push(source);
    return source;
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
  MockAudioContext.failNextDefaultResume = false;
  MockAudioContext.unavailableSinkIds = new Set();
  MockAudioContext.suspendedSinkIds = new Set();
  MockAudioContext.resumeDeferredBySinkId = new Map();
  MockAudioContext.workletDeferredBySinkId = new Map();
  MockAudioContext.closeDeferredBySinkId = new Map();
  MockAudio.latest = null;
  vi.stubGlobal('Audio', MockAudio);
  vi.stubGlobal('AudioContext', MockAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPlayer() {
  const { MockPitchNode } = await import('signalsmith-stretch');
  MockPitchNode.instances.length = 0;
  const { usePlayer } = await import('./usePlayer.js');
  return usePlayer();
}

function pitchCrossfade(context) {
  const offset = context.options.sinkId ? 1 : 0;
  return {
    dry: context.createdGains[2 + offset].gain.value,
    wet: context.createdGains[3 + offset].gain.value,
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('guide vocal defaults', () => {
  it('applies one independent capture master to performance and leased BGM inputs', async () => {
    const player = await loadPlayer();
    expect(player.state.captureVolume).toBe(0.5);
    player.setCaptureVolume(0.3);
    expect(MockAudioContext.instances).toHaveLength(0);
    await player.applyCaptureDevice('capture-one');
    const capture = MockAudioContext.instances.at(-1);
    const master = capture.createdGains.find((gain) => gain.gain.value === 0.3);
    expect(master).toBeDefined();
    expect(master.connect).toHaveBeenCalledWith(capture.destination);
    const stream = {};
    player.registerCaptureInput(stream);
    const inputSource = capture.createdStreamSources.find(
      (node) => node.stream === stream,
    );
    const gate = inputSource.connect.mock.calls[0][0];
    expect(gate.connect).toHaveBeenCalledWith(master);
    player.setCaptureVolume(0);
    expect(master.gain.value).toBe(0);
    expect(player.state.volume).toBe(0.5);
    expect(player.state.captureGuideVocalValue).toBe(0);
    player.setCaptureVolume(2);
    expect(player.state.captureVolume).toBe(1);
    player.setCaptureVolume(NaN);
    expect(player.state.captureVolume).toBe(1);
  });

  it('leases an independent PCM input through the same capture sink and keeps its silence gate across device changes', async () => {
    const player = await loadPlayer();
    const stream = { name: 'standby-pcm' };
    const lost = vi.fn();
    const input = player.registerCaptureInput(stream, lost);
    expect(MockAudioContext.instances).toHaveLength(0);
    player.prepareCaptureDevice('capture-one');
    expect(await player.prepareCaptureOutput()).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(2);
    const first = MockAudioContext.instances[1];
    const source = first.createdStreamSources.find(
      (node) => node.stream === stream,
    );
    const gate = source.connect.mock.calls[0][0];
    expect(gate.gain.value).toBe(0);
    input.setEnabled(true);
    expect(gate.gain.value).toBe(1);
    await player.setTransposeSemitones(3);
    expect(source.connect).toHaveBeenCalledTimes(1);
    input.setEnabled(false);
    expect(gate.gain.value).toBe(0);
    await player.applyCaptureDevice('capture-two');
    const second = MockAudioContext.instances.at(-1);
    const replacement = second.createdStreamSources.find(
      (node) => node.stream === stream,
    );
    expect(replacement.connect.mock.calls[0][0].gain.value).toBe(0);
    input.setEnabled(true);
    second.sinkId = '';
    second.dispatch('sinkchange');
    expect(lost).toHaveBeenCalledOnce();
    expect(await player.prepareCaptureOutput()).toBe(false);
    input.release();
    input.release();
    expect(replacement.disconnect).toHaveBeenCalled();
  });

  it('waits for an existing capture selection rather than opening a competing output', async () => {
    const player = await loadPlayer();
    const pending = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set('capture', pending);
    const selection = player.applyCaptureDevice('capture');
    await vi.waitFor(() => expect(MockAudioContext.instances).toHaveLength(2));
    const prepared = player.prepareCaptureOutput();
    pending.resolve();
    await selection;
    expect(await prepared).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(2);
  });
  it('exposes a read-only start revision before an asynchronous start gate completes', async () => {
    const player = await loadPlayer();
    const gate = Promise.withResolvers();
    player.registerBeforePlaybackStart(() => gate.promise);
    const before = player.getPlaybackStartRequestRevision();
    const starting = player.playTrack({ id: 'intent', url: 'media:intent' });
    expect(player.getPlaybackStartRequestRevision()).toBe(before + 1);
    player.cancelPendingStart();
    gate.resolve(true);
    await starting;
    expect(player.getPlaybackStartRequestRevision()).toBe(before + 2);
  });
  it('hydrates persisted audio preferences before exposing the first state', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        initialAudioPreferences: {
          performanceVolume: 0.72,
          performanceMuted: true,
          monitorGuideVocalLevel: 0.35,
          captureGuideVocalLevel: 0.15,
        },
        onLibraryUpdated: vi.fn(() => vi.fn()),
      },
    });

    const player = await loadPlayer();

    expect(player.state).toMatchObject({
      volume: 0.72,
      isMuted: true,
      guideVocalValue: 0.35,
      captureGuideVocalValue: 0.15,
    });
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it('preserves the stable public player contract', async () => {
    const player = await loadPlayer();

    expect(Object.keys(player).sort()).toEqual(
      [
        'applyCaptureDevice',
        'cancelPendingStart',
        'clearTrack',
        'cyclePlaybackMode',
        'getPlaybackStartRequestRevision',
        'onEnded',
        'onPaused',
        'onPlaying',
        'onPlaybackProgress',
        'onStopped',
        'pause',
        'play',
        'playTrack',
        'prepareCaptureDevice',
        'prepareCaptureOutput',
        'registerCaptureInput',
        'resetPitchTempo',
        'restartTrack',
        'registerBeforePlaybackStart',
        'restorePlaybackState',
        'samplePlaybackClock',
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
        'setCaptureVolume',
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

  it('does not create a native AudioContext during module startup', async () => {
    const player = await loadPlayer();

    player.setVolume(0.7);
    player.toggleMute();

    expect(MockAudioContext.instances).toHaveLength(0);
    expect(player.state.volume).toBe(0.7);
    expect(player.state.isMuted).toBe(true);
  });

  it('creates the first monitor graph with separated routing when requested', async () => {
    const player = await loadPlayer();

    await player.playTrack({
      id: 'track-separated',
      title: 'Track Separated',
      url: 'utawakui-media://track/track-separated/stems.wav',
      usesSeparatedAudio: true,
    });

    expect(MockAudioContext.instances).toHaveLength(1);
    expect(MockAudio.latest.play).toHaveBeenCalledOnce();
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
  it('records bounded runtime audio evidence without logging media identity or repeating stalls', async () => {
    const recordDiagnostic = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('window', {
      Utawakui: { recordDiagnostic, onLibraryUpdated: () => vi.fn() },
    });
    const player = await loadPlayer();
    await player.playTrack({
      id: 'private-id',
      title: 'private-title',
      url: 'media:private-path',
    });
    const audio = MockAudio.latest;
    audio.readyState = 2;
    audio.networkState = 2;
    audio.dispatch('playing');
    audio.dispatch('waiting');
    audio.dispatch('playing');
    audio.dispatch('waiting');
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    expect(recordDiagnostic.mock.calls[0][0]).toMatchObject({
      code: 'PLAYER_AUDIO_BUFFERING',
      context: {
        reason: 'waiting',
        stage: 'original',
        status: 'ready-2-network-2',
      },
    });
    const context = MockAudioContext.instances[0];
    context.state = 'interrupted';
    context.dispatch('statechange');
    expect(recordDiagnostic.mock.calls[1][0]).toMatchObject({
      code: 'PLAYER_AUDIO_CONTEXT_STATE',
      context: { reason: 'monitor', status: 'interrupted' },
    });
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'private',
    );
    player.clearTrack();
  });

  it('observes monitor and capture worklet failures and removes observers on cleanup', async () => {
    const recordDiagnostic = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('window', {
      Utawakui: { recordDiagnostic, onLibraryUpdated: () => vi.fn() },
    });
    const player = await loadPlayer();
    await player.playTrack({ id: 'song', url: 'media:song' });
    await player.applyCaptureDevice('capture-device');
    await player.setTransposeSemitones(2);
    const { MockPitchNode } = await import('signalsmith-stretch');
    for (const node of MockPitchNode.instances) node.onprocessorerror?.();
    expect(
      recordDiagnostic.mock.calls.map(([event]) => event.context.reason),
    ).toEqual(['monitor', 'capture']);
    expect(
      recordDiagnostic.mock.calls.every(
        ([event]) => event.code === 'PLAYER_AUDIO_PROCESSOR_ERROR',
      ),
    ).toBe(true);
    const { cleanupPlayerResources } = await import('./usePlayer.js');
    cleanupPlayerResources();
    expect(MockAudioContext.instances[0].listeners.has('statechange')).toBe(
      false,
    );
    expect(
      MockPitchNode.instances.every((node) => node.onprocessorerror === null),
    ).toBe(true);
  });

  it('clamps public master-volume intents and ignores non-finite values', async () => {
    const player = await loadPlayer();

    player.setVolume(2);
    expect(player.state.volume).toBe(1);
    player.setVolume(-1);
    expect(player.state.volume).toBe(0);
    player.setVolume(0.63);
    player.setVolume(Number.NaN);
    expect(player.state.volume).toBe(0.63);
  });

  it('drives master gain through volume and mute actions', async () => {
    const player = await loadPlayer();
    await player.playTrack({
      id: 'track-volume',
      title: 'Track Volume',
      url: 'utawakui-media://track/track-volume/audio.wav',
    });
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
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2));
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
    MockAudioContext.failNextDefaultResume = true;
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
    expect(player.state.pendingStartTrackId).toBeNull();
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

  it('releases audio, subscriptions and transport hooks during teardown', async () => {
    const module = await import('./usePlayer.js');
    const player = module.usePlayer();
    const audio = MockAudio.latest;
    const stopped = vi.fn();
    const playing = vi.fn();

    player.onStopped(stopped);
    player.onPlaying(playing);
    player.registerBeforePlaybackStart(vi.fn(() => true));
    await player.playTrack({
      id: 'track-cleanup',
      title: 'Cleanup',
      url: 'utawakui-media://track/track-cleanup/audio.wav',
    });

    module.cleanupPlayerResources();

    expect(audio.listeners.size).toBe(0);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('');
    expect(audio.load).toHaveBeenCalled();
    audio.dispatch('playing');
    audio.dispatch('error');
    expect(playing).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });

  it('notifies terminal-stop listeners for clear and failed playback, but not pause', async () => {
    const player = await loadPlayer();
    const listener = vi.fn();
    player.onStopped(listener);

    await player.playTrack({
      id: 'track-terminal',
      title: 'Track Terminal',
      url: 'utawakui-media://track/track-terminal/audio.wav',
    });
    player.pause();
    expect(listener).not.toHaveBeenCalled();

    expect(player.clearTrack('track-terminal')).toBe(true);
    expect(listener).toHaveBeenCalledWith({
      reason: 'cleared',
      trackId: 'track-terminal',
      playbackRevision: 1,
    });

    MockAudio.latest.failPlay = true;
    await player.playTrack({
      id: 'track-failed',
      title: 'Track Failed',
      url: 'utawakui-media://track/track-failed/audio.wav',
    });
    expect(listener).toHaveBeenLastCalledWith({
      reason: 'error',
      trackId: 'track-failed',
      playbackRevision: 2,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('runs the registered pre-start hook before changing track identity or source', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;
    const observations = [];
    const unregister = player.registerBeforePlaybackStart((request) => {
      observations.push({
        request,
        track: player.state.track,
        source: audio.src,
      });
      return true;
    });

    await expect(
      player.playTrack({
        id: 'track-gated',
        title: 'Track Gated',
        url: 'utawakui-media://track/track-gated/audio.wav',
      }),
    ).resolves.toBe(true);

    expect(observations).toEqual([
      {
        request: { trackId: 'track-gated', requestRevision: 1 },
        track: null,
        source: undefined,
      },
    ]);
    expect(player.state.track.id).toBe('track-gated');
    expect(audio.play).toHaveBeenCalledOnce();

    unregister();
  });

  it('runs the registered pre-start hook before resuming a paused track', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;
    await player.playTrack({
      id: 'track-resume',
      title: 'Resume',
      url: 'utawakui-media://track/track-resume/audio.wav',
    });
    player.pause();
    audio.play.mockClear();
    const gate = createDeferred();
    const hook = vi.fn(() => gate.promise);
    player.registerBeforePlaybackStart(hook);

    const resume = player.play();

    expect(hook).toHaveBeenCalledWith({
      trackId: 'track-resume',
      requestRevision: 2,
      resume: true,
    });
    expect(audio.play).not.toHaveBeenCalled();

    gate.resolve(true);
    await resume;
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('does not resume when the pre-start handoff is rejected', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;
    await player.playTrack({
      id: 'track-blocked-resume',
      title: 'Blocked Resume',
      url: 'utawakui-media://track/track-blocked-resume/audio.wav',
    });
    player.pause();
    audio.play.mockClear();
    player.registerBeforePlaybackStart(() => false);

    await player.play();

    expect(audio.play).not.toHaveBeenCalled();
    expect(player.state.isPlaying).toBe(false);
  });

  it('never starts an older resume after a newer track request wins', async () => {
    const player = await loadPlayer();
    const audio = MockAudio.latest;
    const resumeGate = createDeferred();
    await player.playTrack({
      id: 'track-paused',
      title: 'Paused',
      url: 'utawakui-media://track/track-paused/audio.wav',
    });
    player.pause();
    audio.play.mockClear();
    player.registerBeforePlaybackStart(({ resume }) =>
      resume ? resumeGate.promise : true,
    );

    const staleResume = player.play();
    const currentStart = player.playTrack({
      id: 'track-current-after-resume',
      title: 'Current',
      url: 'utawakui-media://track/track-current-after-resume/audio.wav',
    });

    await expect(currentStart).resolves.toBe(true);
    resumeGate.resolve(true);
    await staleResume;

    expect(player.state.track.id).toBe('track-current-after-resume');
    expect(audio.play).toHaveBeenCalledOnce();
  });
  it('projects a pending track while AudioContext resume has not produced a play event', async () => {
    const player = await loadPlayer(),
      gate = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set('', gate);
    const start = player.playTrack({
      id: 'pending-tags',
      title: 'Pending',
      url: 'utawakui-media://track/pending-tags/audio.flac',
    });
    await vi.waitFor(() =>
      expect(MockAudio.latest.src).toContain('pending-tags'),
    );
    expect(player.state.pendingStartTrackId).toBe('pending-tags');
    expect(player.state.isPlaying).toBe(false);
    gate.resolve();
    await start;
    expect(player.state.pendingStartTrackId).toBe(null);
  });

  it('never starts an older track after a newer pre-start request wins', async () => {
    const player = await loadPlayer();
    const firstGate = createDeferred();
    player.registerBeforePlaybackStart(({ trackId }) =>
      trackId === 'track-old' ? firstGate.promise : true,
    );

    const oldRequest = player.playTrack({
      id: 'track-old',
      title: 'Old',
      url: 'utawakui-media://track/track-old/audio.wav',
    });
    const currentRequest = player.playTrack({
      id: 'track-current',
      title: 'Current',
      url: 'utawakui-media://track/track-current/audio.wav',
    });

    await expect(currentRequest).resolves.toBe(true);
    firstGate.resolve(true);
    await expect(oldRequest).resolves.toBe(false);

    expect(player.state.track.id).toBe('track-current');
    expect(MockAudio.latest.src).toContain('/track-current/audio.wav');
    expect(MockAudio.latest.play).toHaveBeenCalledOnce();
  });

  it('silently drops a gated start when the pending start is cancelled', async () => {
    const player = await loadPlayer();
    const gate = createDeferred();
    const stopped = vi.fn();
    player.onStopped(stopped);
    player.registerBeforePlaybackStart(() => gate.promise);

    const request = player.playTrack({
      id: 'track-cancelled',
      title: 'Cancelled',
      url: 'utawakui-media://track/track-cancelled/audio.wav',
    });
    player.cancelPendingStart();
    gate.resolve(true);

    await expect(request).resolves.toBe(false);
    expect(player.state.track).toBeNull();
    expect(MockAudio.latest.play).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });

  it('stops the current performance before waiting on a new track handoff', async () => {
    const player = await loadPlayer();
    const gate = createDeferred();
    await player.playTrack({
      id: 'track-current',
      title: 'Current',
      url: 'utawakui-media://track/track-current/audio.wav',
    });
    MockAudio.latest.pause.mockClear();
    player.registerBeforePlaybackStart(() => gate.promise);

    const nextRequest = player.playTrack({
      id: 'track-next',
      title: 'Next',
      url: 'utawakui-media://track/track-next/audio.wav',
    });

    expect(MockAudio.latest.pause).toHaveBeenCalledOnce();
    expect(player.state.track.id).toBe('track-current');
    expect(MockAudio.latest.src).toContain('/track-current/audio.wav');

    gate.resolve(true);
    await expect(nextRequest).resolves.toBe(true);
    expect(player.state.track.id).toBe('track-next');
  });

  it('publishes confirmed playing identity and supports unsubscription', async () => {
    const player = await loadPlayer();
    const listener = vi.fn();
    const unsubscribe = player.onPlaying(listener);
    await player.playTrack({
      id: 'track-confirmed',
      title: 'Confirmed',
      url: 'utawakui-media://track/track-confirmed/audio.wav',
    });

    MockAudio.latest.dispatch('playing');
    expect(listener).toHaveBeenCalledWith({
      trackId: 'track-confirmed',
      playbackRevision: 1,
    });

    unsubscribe();
    MockAudio.latest.dispatch('playing');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('publishes explicit pause identity and supports unsubscription', async () => {
    const player = await loadPlayer();
    const listener = vi.fn();
    const unsubscribe = player.onPaused(listener);
    await player.playTrack({
      id: 'track-paused',
      title: 'Paused',
      url: 'utawakui-media://track/track-paused/audio.wav',
    });

    player.pause();
    expect(listener).toHaveBeenCalledWith({
      trackId: 'track-paused',
      playbackRevision: 1,
    });

    unsubscribe();
    player.pause();
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('library synchronization', () => {
  it('keeps arrangement ownership across metadata refresh and advances its next occurrence at EOF', async () => {
    const { reactive } = await import('vue');
    const { usePerformanceSessionPlaybackController } =
      await import('./usePerformanceSessionPlaybackController.js');
    let libraryUpdated;
    const track = { id: 'song', url: 'media:song', title: 'Song' };
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi.fn(async () => ({ ...track, title: 'Updated' })),
        onLibraryUpdated: (listener) => {
          libraryUpdated = listener;
          return vi.fn();
        },
      },
    });
    const player = await loadPlayer();
    const plan = {
      state: reactive({
        plan: {
          items: ['one', 'two'].map((itemId) => ({
            itemId,
            trackId: 'song',
            mode: 'library-track',
            ready: true,
            progress: 'queued',
          })),
        },
      }),
      setProgress: vi.fn(async (id, progress) => {
        plan.state.plan.items.find((item) => item.itemId === id).progress =
          progress;
        return true;
      }),
    };
    const controller = usePerformanceSessionPlaybackController({
      plan,
      player,
      queue: { interruptWithTrack: vi.fn() },
      getTracks: () => [track],
      toPlayableTrack: (value) => value,
    });
    try {
      await controller.start('one');
      MockAudio.latest.dispatch('playing');
      await controller.settled();
      await libraryUpdated();
      expect(controller.ownsPlayback.value).toBe(true);
      expect(
        controller.handleEnded({
          trackId: 'song',
          playbackRevision: player.state.playbackRevision,
        }),
      ).toBe(true);
      await controller.settled();
      expect(plan.state.plan.items[0].progress).toBe('completed');
      expect(controller.currentItem.value.itemId).toBe('two');
      expect(player.state.track.arrangementRequestId).toBeTruthy();
    } finally {
      controller.dispose();
      player.clearTrack();
    }
  });

  it('ignores metadata from an earlier playback of the same track', async () => {
    let libraryUpdated;
    const lookup = createDeferred();
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: () => lookup.promise,
        onLibraryUpdated: (listener) => {
          libraryUpdated = listener;
          return vi.fn();
        },
      },
    });
    const player = await loadPlayer();
    const track = {
      id: 'same',
      url: 'media:same',
      arrangementRequestId: 'first',
    };
    await player.playTrack(track);
    const sync = libraryUpdated();
    await player.playTrack({ ...track, arrangementRequestId: 'second' });
    lookup.resolve({ id: 'same', url: 'media:older', title: 'Stale' });
    await sync;
    expect(player.state.track.arrangementRequestId).toBe('second');
    expect(MockAudio.latest.src).toBe('media:same');
  });

  it('ignores an older library lookup that completes after the latest one', async () => {
    let libraryUpdated;
    const old = createDeferred();
    const fresh = createDeferred();
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi
          .fn()
          .mockReturnValueOnce(old.promise)
          .mockReturnValueOnce(fresh.promise),
        onLibraryUpdated: (listener) => {
          libraryUpdated = listener;
          return vi.fn();
        },
      },
    });
    const player = await loadPlayer();
    await player.playTrack({ id: 'same', url: 'media:same' });
    const earlier = libraryUpdated();
    const later = libraryUpdated();
    fresh.resolve({ id: 'same', url: 'media:same', title: 'Fresh' });
    await later;
    old.resolve({ id: 'same', url: 'media:same', title: 'Stale' });
    await earlier;
    expect(player.state.track.title).toBe('Fresh');
  });

  it('refreshes metadata without reloading an unchanged playable URL', async () => {
    let libraryUpdated;
    const getTrack = vi.fn().mockResolvedValue({
      id: 'track-sync',
      title: 'Updated title',
      url: 'utawakui-media://track/track-sync/audio.wav',
    });
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack,
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

    expect(getTrack).toHaveBeenCalledWith('track-sync');
    expect(player.state.track.title).toBe('Updated title');
    expect(MockAudio.latest.play).not.toHaveBeenCalled();
  });

  it('ignores a lookup that resolves after another track was loaded', async () => {
    let libraryUpdated;
    const lookup = createDeferred();
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi.fn(() => lookup.promise),
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

    const sync = libraryUpdated();
    await player.playTrack({
      id: 'track-next',
      title: 'Next title',
      url: 'utawakui-media://track/track-next/audio.wav',
    });
    lookup.resolve({
      id: 'track-sync',
      title: 'Updated title',
      url: 'utawakui-media://track/track-sync/audio.wav',
    });
    await sync;

    expect(player.state.track.id).toBe('track-next');
    expect(player.state.track.title).toBe('Next title');
  });

  it('restores position and mix calibration when the playable URL changes', async () => {
    let libraryUpdated;
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi.fn().mockResolvedValue({
          id: 'track-sync',
          title: 'Separated title',
          url: 'utawakui-media://track/track-sync/audio.wav',
          stemsUrl: 'utawakui-media://track/track-sync/stems.wav',
          hasSeparation: true,
        }),
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

  it('does not resume a reloaded URL after the pending start is cancelled', async () => {
    let libraryUpdated;
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi.fn().mockResolvedValue({
          id: 'track-sync',
          title: 'Updated title',
          url: 'utawakui-media://track/track-sync/audio-v2.wav',
        }),
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
    MockAudio.latest.dispatch('playing');
    MockAudio.latest.play.mockClear();
    const resumeGate = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set('', resumeGate);

    const reload = libraryUpdated();
    await vi.waitFor(() =>
      expect(MockAudio.latest.src).toContain('/audio-v2.wav'),
    );
    player.cancelPendingStart();
    resumeGate.resolve();
    await reload;

    expect(MockAudio.latest.play).not.toHaveBeenCalled();
  });

  it('publishes a terminal stop when an active library reload cannot resume', async () => {
    let libraryUpdated;
    vi.stubGlobal('window', {
      Utawakui: {
        getTrack: vi.fn().mockResolvedValue({
          id: 'track-sync',
          title: 'Updated title',
          url: 'utawakui-media://track/track-sync/audio-v2.wav',
        }),
        onLibraryUpdated: vi.fn((listener) => {
          libraryUpdated = listener;
          return vi.fn();
        }),
      },
    });
    const player = await loadPlayer();
    const stopped = vi.fn();
    player.onStopped(stopped);
    await player.playTrack({
      id: 'track-sync',
      title: 'Original title',
      url: 'utawakui-media://track/track-sync/audio.wav',
    });
    MockAudio.latest.dispatch('playing');
    MockAudio.latest.failPlay = true;

    await libraryUpdated();

    expect(player.state.playbackPhase).toBe('error');
    expect(stopped).toHaveBeenCalledWith({
      reason: 'error',
      trackId: 'track-sync',
      playbackRevision: 1,
    });
  });
});

describe('playback persistence events', () => {
  it('publishes bounded progress deltas with a new revision for each explicit play', async () => {
    const player = await loadPlayer();
    const onProgress = vi.fn();
    const unsubscribe = player.onPlaybackProgress(onProgress);
    const track = {
      id: 'track-history',
      title: 'History',
      url: 'utawakui-media://track/track-history/audio.wav',
    };

    await player.playTrack(track);
    MockAudio.latest.dispatch('playing');
    MockAudio.latest.currentTime = 1.25;
    MockAudio.latest.dispatch('timeupdate');

    expect(onProgress).toHaveBeenCalledWith({
      trackId: 'track-history',
      playbackRevision: 1,
      deltaSeconds: 1.25,
    });

    await player.playTrack(track);
    MockAudio.latest.dispatch('playing');
    MockAudio.latest.currentTime = 0.5;
    MockAudio.latest.dispatch('timeupdate');

    expect(onProgress).toHaveBeenLastCalledWith({
      trackId: 'track-history',
      playbackRevision: 2,
      deltaSeconds: 0.5,
    });
    unsubscribe();
  });

  it('restores transport paused without overriding durable audio preferences', async () => {
    const player = await loadPlayer();
    MockAudio.latest.play.mockClear();
    player.setVolume(0.63);
    player.toggleMute();

    player.restorePlaybackState({
      track: {
        id: 'track-restored',
        title: 'Restored',
        url: 'utawakui-media://track/track-restored/audio.wav',
      },
      positionSeconds: 37.25,
      volume: 0.12,
      isMuted: false,
      playbackMode: 'repeat-list',
    });

    expect(player.state.track?.id).toBe('track-restored');
    expect(player.state.isPlaying).toBe(false);
    expect(player.state.playbackPhase).toBe('paused');
    expect(player.state.volume).toBe(0.63);
    expect(player.state.isMuted).toBe(true);
    expect(player.state.playbackMode).toBe('repeat-list');
    expect(MockAudio.latest.play).not.toHaveBeenCalled();

    MockAudio.latest.duration = 120;
    MockAudio.latest.dispatch('loadedmetadata');
    expect(MockAudio.latest.currentTime).toBe(37.25);
    expect(player.state.currentTime).toBe(37.25);
  });

  it('does not carry a restored position over to a different track', async () => {
    const player = await loadPlayer();
    player.restorePlaybackState({
      track: {
        id: 'track-missing',
        title: 'Missing',
        url: 'utawakui-media://track/track-missing/audio.wav',
      },
      positionSeconds: 90,
    });
    // The restored file never reaches loadedmetadata (for example it is gone).
    MockAudio.latest.dispatch('error');

    await player.playTrack({
      id: 'track-next',
      title: 'Next',
      url: 'utawakui-media://track/track-next/audio.wav',
    });
    MockAudio.latest.currentTime = 0;
    MockAudio.latest.duration = 200;
    MockAudio.latest.dispatch('loadedmetadata');

    expect(MockAudio.latest.currentTime).toBe(0);
  });

  it('uses safe paused defaults when restoring without optional transport values', async () => {
    const player = await loadPlayer();
    expect(player.restorePlaybackState()).toBe(false);

    expect(
      player.restorePlaybackState({
        track: {
          id: 'track-defaults',
          title: 'Defaults',
          url: 'utawakui-media://track/track-defaults/audio.wav',
        },
      }),
    ).toBe(true);

    MockAudio.latest.duration = Number.POSITIVE_INFINITY;
    MockAudio.latest.dispatch('loadedmetadata');

    expect(MockAudio.latest.currentTime).toBe(0);
    expect(player.state.volume).toBe(0.5);
    expect(player.state.isMuted).toBe(false);
    expect(player.state.playbackMode).toBe('sequence');
    expect(MockAudio.latest.play).not.toHaveBeenCalled();
  });

  it('publishes the ended track identity before queue listeners advance', async () => {
    const player = await loadPlayer();
    const onEnded = vi.fn();
    player.onEnded(onEnded);
    await player.playTrack({
      id: 'track-short',
      title: 'Short',
      url: 'utawakui-media://track/track-short/audio.wav',
    });
    MockAudio.latest.currentTime = 4;

    MockAudio.latest.dispatch('ended');

    expect(onEnded).toHaveBeenCalledWith({
      trackId: 'track-short',
      playbackRevision: 1,
    });
  });
});

describe('capture device lifecycle', () => {
  it('prepares a restored capture device and activates it only on first playback', async () => {
    const player = await loadPlayer();

    player.prepareCaptureDevice('capture-device');

    expect(player.state.captureDeviceId).toBe('capture-device');
    expect(MockAudioContext.instances).toHaveLength(0);

    await player.playTrack({
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track/track-1/audio.wav',
    });

    expect(MockAudioContext.instances).toHaveLength(2);
    expect(MockAudioContext.instances[1].options).toEqual({
      sinkId: 'capture-device',
    });
    expect(player.state.captureDeviceId).toBe('capture-device');
  });

  it('keeps monitor playback running when a prepared capture device cannot start', async () => {
    const player = await loadPlayer();
    MockAudioContext.unavailableSinkIds.add('missing-device');
    player.prepareCaptureDevice('missing-device');

    await player.playTrack({
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track/track-1/audio.wav',
    });

    expect(MockAudio.latest.play).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
    await vi.waitFor(() =>
      expect(player.state.captureError).toBe('擷取輸出裝置無法使用。'),
    );
  });

  it('does not delay monitor playback while a prepared capture device is still starting', async () => {
    const player = await loadPlayer();
    const pendingResume = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set(
      'slow-capture-device',
      pendingResume,
    );
    player.prepareCaptureDevice('slow-capture-device');

    const playback = player.playTrack({
      id: 'track-1',
      title: 'Track 1',
      url: 'utawakui-media://track/track-1/audio.wav',
    });
    await vi.waitFor(() => expect(MockAudioContext.instances).toHaveLength(2));

    expect(MockAudio.latest.play).toHaveBeenCalledOnce();
    pendingResume.resolve();
    await playback;
    await vi.waitFor(() =>
      expect(player.state.captureDeviceId).toBe('slow-capture-device'),
    );
  });

  it('creates the capture graph already bound to the selected device', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');

    const captureContext = MockAudioContext.instances[1];
    expect(captureContext.options).toEqual({ sinkId: 'capture-device' });
    expect(captureContext.setSinkId).not.toHaveBeenCalled();
    expect(captureContext.resume).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBe('capture-device');
  });

  it('toggles guide vocal gain on an active capture graph', async () => {
    const player = await loadPlayer();
    await player.applyCaptureDevice('capture-device');

    player.toggleCaptureGuideVocal();
    expect(player.state.captureGuideVocalOn).toBe(true);

    player.toggleCaptureGuideVocal();
    expect(player.state.captureGuideVocalOn).toBe(false);
  });

  it('closes capture output when the selected device is cleared', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    await player.applyCaptureDevice(null);

    expect(captureContext.close).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
  });

  it('rebuilds the capture graph when switching devices', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('first-device');
    const firstContext = MockAudioContext.instances[1];
    await player.applyCaptureDevice('second-device');
    const secondContext = MockAudioContext.instances[2];

    expect(firstContext.close).toHaveBeenCalledOnce();
    expect(secondContext.options).toEqual({ sinkId: 'second-device' });
    expect(secondContext.resume).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBe('second-device');
  });

  it('rebuilds a fresh graph when capture is re-enabled', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const firstContext = MockAudioContext.instances[1];
    await player.applyCaptureDevice(null);
    await player.applyCaptureDevice('capture-device');
    const secondContext = MockAudioContext.instances[2];

    expect(firstContext.close).toHaveBeenCalledOnce();
    expect(secondContext).not.toBe(firstContext);
    expect(secondContext.options).toEqual({ sinkId: 'capture-device' });
    expect(player.state.captureDeviceId).toBe('capture-device');
  });

  it('closes an unavailable capture device with bounded public error copy', async () => {
    const player = await loadPlayer();
    MockAudioContext.unavailableSinkIds.add('missing-device');

    await player.applyCaptureDevice('missing-device');

    const captureContext = MockAudioContext.instances[1];
    expect(captureContext.close).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBe('擷取輸出裝置無法使用。');
  });

  it('rejects a capture context that remains suspended without an error event', async () => {
    const player = await loadPlayer();
    MockAudioContext.suspendedSinkIds.add('suspended-device');

    await player.applyCaptureDevice('suspended-device');

    const captureContext = MockAudioContext.instances[1];
    expect(captureContext.close).toHaveBeenCalledOnce();
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

  it('clears a capture context that stops running unexpectedly', async () => {
    const player = await loadPlayer();

    await player.applyCaptureDevice('capture-device');
    const captureContext = MockAudioContext.instances[1];
    captureContext.state = 'suspended';
    captureContext.dispatch('statechange');

    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBe('擷取輸出已停止，請重新選擇裝置。');
  });

  it('keeps the latest device when an older resume finishes late', async () => {
    const player = await loadPlayer();
    const firstResume = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set('first-device', firstResume);

    const firstSelection = player.applyCaptureDevice('first-device');
    await vi.waitFor(() => expect(MockAudioContext.instances).toHaveLength(2));
    const firstContext = MockAudioContext.instances[1];

    await player.applyCaptureDevice('second-device');
    const secondContext = MockAudioContext.instances[2];
    firstResume.resolve();
    await firstSelection;

    expect(firstContext.close).toHaveBeenCalledOnce();
    expect(secondContext.close).not.toHaveBeenCalled();
    expect(player.state.captureDeviceId).toBe('second-device');
    expect(player.state.captureError).toBeNull();
  });

  it('does not restore a device after capture is disabled during resume', async () => {
    const player = await loadPlayer();
    const pendingResume = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set(
      'capture-device',
      pendingResume,
    );

    const selection = player.applyCaptureDevice('capture-device');
    await vi.waitFor(() => expect(MockAudioContext.instances).toHaveLength(2));
    await player.applyCaptureDevice(null);
    pendingResume.resolve();
    await selection;

    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBeNull();
  });

  it('does not commit a sink that is lost while its graph is starting', async () => {
    const player = await loadPlayer();
    const pendingResume = createDeferred();
    MockAudioContext.resumeDeferredBySinkId.set(
      'capture-device',
      pendingResume,
    );

    const selection = player.applyCaptureDevice('capture-device');
    await vi.waitFor(() => expect(MockAudioContext.instances).toHaveLength(2));
    const captureContext = MockAudioContext.instances[1];
    captureContext.sinkId = '';
    captureContext.dispatch('sinkchange');
    pendingResume.resolve();
    await selection;

    expect(captureContext.close).toHaveBeenCalledOnce();
    expect(player.state.captureDeviceId).toBeNull();
    expect(player.state.captureError).toBe('選擇的輸出裝置已中斷連線。');
  });

  it('does not create a capture graph after its owner is cleaned up', async () => {
    const { usePlayerAudioGraph } =
      await import('./player/usePlayerAudioGraph.js');
    const state = {
      captureDeviceId: null,
      captureError: null,
      captureGuideVocalOn: false,
      captureGuideVocalValue: 0,
      guideVocalOn: true,
      guideVocalValue: 0.5,
      isMuted: false,
      pitchCents: 0,
      transposeSemitones: 0,
      volume: 0.5,
    };
    const graph = usePlayerAudioGraph({
      audio: new MockAudio(),
      state,
      reportPlayerError: vi.fn(),
    });
    await graph.applyCaptureDevice('first-device');
    const pendingClose = createDeferred();
    MockAudioContext.closeDeferredBySinkId.set('first-device', pendingClose);

    const switching = graph.applyCaptureDevice('second-device');
    await vi.waitFor(() =>
      expect(MockAudioContext.instances[1].close).toHaveBeenCalled(),
    );
    graph.cleanup();
    expect(graph.prepareCaptureDevice('after-cleanup')).toBe(false);
    pendingClose.resolve();
    await switching;

    expect(MockAudioContext.instances).toHaveLength(2);
    expect(state.captureDeviceId).toBeNull();
  });
});

describe('transpose AudioWorklet routing', () => {
  it('rolls back fine pitch when lazy worklet registration fails', async () => {
    const player = await loadPlayer();
    await player.playTrack({
      id: 'track-pitch-cents',
      title: 'Track Pitch Cents',
      url: 'utawakui-media://track/track-pitch-cents/audio.wav',
    });
    MockAudioContext.instances[0].failWorkletRegistration = true;

    await player.setPitchCents(25);

    expect(player.state.pitchCents).toBe(0);
    expect(player.state.error).toBe('音高調整暫時無法使用。');
  });

  it('keeps monitor state rolled back if registration fails, and does not recover on retry', async () => {
    const player = await loadPlayer();
    await player.playTrack({
      id: 'track-pitch',
      title: 'Track Pitch',
      url: 'utawakui-media://track/track-pitch/audio.wav',
    });
    const monitorContext = MockAudioContext.instances[0];
    monitorContext.failWorkletRegistration = true;

    await player.setTransposeSemitones(2);

    expect(player.state.transposeSemitones).toBe(0);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 1, wet: 0 });
    expect(player.state.error).toBe('音高調整暫時無法使用。');

    // signalsmith-stretch caches the failed registration promise on
    // monitorContext permanently (see ADR 0019) — addModule is never
    // retried, so the monitor pitch path stays broken for the rest of this
    // AudioContext's lifetime even though registration would now succeed.
    monitorContext.failWorkletRegistration = false;
    await player.setTransposeSemitones(2);

    expect(monitorContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(player.state.transposeSemitones).toBe(0);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 1, wet: 0 });
    expect(player.state.error).toBe('音高調整暫時無法使用。');
  });

  it('registers and activates the pitch node in both monitor and capture contexts', async () => {
    const player = await loadPlayer();
    const { MockPitchNode } = await import('signalsmith-stretch');

    await player.applyCaptureDevice('capture-device');
    await player.setTransposeSemitones(2);

    const [monitorContext, captureContext] = MockAudioContext.instances;
    expect(monitorContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(MockPitchNode.instances).toHaveLength(2);
    expect(
      MockPitchNode.instances.map(
        (node) => node.schedule.mock.calls.at(-1)[0].semitones,
      ),
    ).toEqual([2, 2]);
    expect(pitchCrossfade(monitorContext)).toEqual({ dry: 0, wet: 1 });
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureError).toBeNull();
  });

  it('syncs an existing transpose when capture is selected later', async () => {
    const player = await loadPlayer();
    const { MockPitchNode } = await import('signalsmith-stretch');

    await player.setTransposeSemitones(-3);
    await player.applyCaptureDevice('capture-device');

    const captureContext = MockAudioContext.instances[1];
    const capturePitchNode = MockPitchNode.instances.find(
      (node) => node.context === captureContext,
    );
    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(capturePitchNode.schedule.mock.calls.at(-1)[0].semitones).toBe(-3);
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureDeviceId).toBe('capture-device');
    expect(player.state.captureError).toBeNull();
  });

  it('does not connect a stale pitch worklet into a replacement graph', async () => {
    const player = await loadPlayer();
    const { MockPitchNode } = await import('signalsmith-stretch');
    await player.setTransposeSemitones(2);
    const firstWorklet = createDeferred();
    MockAudioContext.workletDeferredBySinkId.set('first-device', firstWorklet);

    const firstSelection = player.applyCaptureDevice('first-device');
    await vi.waitFor(() =>
      expect(
        MockAudioContext.instances[1].audioWorklet.addModule,
      ).toHaveBeenCalled(),
    );
    await player.applyCaptureDevice('second-device');
    firstWorklet.resolve();
    await firstSelection;

    // Signalsmith Stretch resolves registration and node construction in a
    // single call, so a node for the stale first-device graph is still
    // constructed once its deferred registration resolves — it just must
    // never be wired (connect()ed) into the graph once superseded.
    const secondContext = MockAudioContext.instances[2];
    const capturePitchNodes = MockPitchNode.instances.filter(
      (node) => node.context !== MockAudioContext.instances[0],
    );
    const connectedCaptureNodes = capturePitchNodes.filter(
      (node) => node.connect.mock.calls.length > 0,
    );
    expect(connectedCaptureNodes).toHaveLength(1);
    expect(connectedCaptureNodes[0].context).toBe(secondContext);
    expect(player.state.captureDeviceId).toBe('second-device');
    expect(player.state.captureError).toBeNull();
  });

  it('keeps monitor transpose active if capture worklet registration fails, and capture pitch does not recover on retry', async () => {
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

    // signalsmith-stretch caches the failed registration on captureContext
    // permanently (see ADR 0019) — flipping failWorkletRegistration back off
    // and retrying does not recover; only reselecting the output device
    // (which creates a fresh AudioContext) would.
    captureContext.failWorkletRegistration = false;
    await player.setTransposeSemitones(5);

    expect(captureContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 1, wet: 0 });
    expect(player.state.captureError).toBe('擷取輸出的音高調整暫時無法使用。');
  });

  it('hydrates transpose and fine pitch together into a single schedule() call when capture is selected', async () => {
    const player = await loadPlayer();
    const { MockPitchNode } = await import('signalsmith-stretch');

    await player.setTransposeSemitones(2);
    await player.setPitchCents(12);
    await player.applyCaptureDevice('capture-device');

    const captureContext = MockAudioContext.instances[1];
    const capturePitchNode = MockPitchNode.instances.find(
      (node) => node.context === captureContext,
    );
    expect(capturePitchNode.schedule).toHaveBeenLastCalledWith({
      active: true,
      semitones: 2 + 12 / 100,
    });
    expect(pitchCrossfade(captureContext)).toEqual({ dry: 0, wet: 1 });
    expect(player.state.captureError).toBeNull();
  });
});
