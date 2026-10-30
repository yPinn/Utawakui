import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMicrophoneResearchRuntime } from './researchRuntime.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function stream(deviceId = 'mic-a') {
  const track = Object.assign(new EventTarget(), {
    kind: 'audio',
    readyState: 'live',
    muted: false,
    stop: vi.fn(),
    getSettings: () => ({ deviceId, sampleRate: 48000, channelCount: 1 }),
  });
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}
function harness() {
  vi.useFakeTimers();
  const devices = Object.assign(new EventTarget(), {
    getSupportedConstraints: () => ({
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    }),
    enumerateDevices: vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'mic-a', label: 'Mic A' },
      { kind: 'audioinput', deviceId: 'default', label: 'Default' },
      { kind: 'audiooutput', deviceId: 'out' },
    ]),
    getUserMedia: vi.fn(async () => stream()),
  });
  let lease = 0;
  const access = {
    beginMicrophoneResearch: vi.fn(async () => `lease-${++lease}`),
    endMicrophoneResearch: vi.fn(async () => true),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    fftSize: 0,
    getFloatTimeDomainData: (data) => data.fill(0.5),
    disconnect: vi.fn(),
  };
  const context = Object.assign(new EventTarget(), {
    currentTime: 0,
    state: 'running',
    sampleRate: 48000,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1, setTargetAtTime: vi.fn() },
    })),
    createBiquadFilter: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: { value: 0 },
      Q: { value: 0 },
    })),
  });
  let state;
  const onError = vi.fn();
  const runtime = createMicrophoneResearchRuntime({
    mediaDevices: devices,
    access,
    createContext: () => context,
    publish: (value) => {
      state = value;
    },
    onError,
  });
  return {
    runtime,
    devices,
    access,
    context,
    source,
    analyser,
    onError,
    get state() {
      return state;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('microphone research lifecycle', () => {
  const calibration = (state) => {
    const conditions = Object.fromEntries(
      [
        'selectedDeviceId',
        'controls',
        'inputOptions',
        'settings',
        'activityOptions',
      ].map((key) => [key, state[key]]),
    );
    const summary = {
      count: 100,
      p10Dbfs: -68,
      medianDbfs: -65,
      p95Dbfs: -62,
      maxDbfs: -60,
      nearClipCount: 0,
      conditions,
    };
    return {
      quiet: summary,
      voice: {
        ...summary,
        p10Dbfs: -32,
        medianDbfs: -30,
        p95Dbfs: -28,
        maxDbfs: -26,
      },
    };
  };
  it('keeps numeric meters live while uncalibrated and resets activity on pause, stop and reconfiguration', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    await h.runtime.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.state.dbfs).toBeGreaterThan(-10);
    expect(h.state.activity).toMatchObject({
      phase: 'uncalibrated',
      intensity: 0,
    });
    expect(h.runtime.configureActivity({ mode: 'manual' })).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.state.activity.phase).toBe('active');
    h.runtime.setActivitySuspended(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.state.activity).toMatchObject({ phase: 'paused', intensity: 0 });
    h.runtime.setActivitySuspended(false);
    expect(h.state.activity.phase).toBe('armed');
    await vi.advanceTimersByTimeAsync(100);
    expect(h.state.activity.phase).toBe('active');
    expect(
      h.runtime.configureActivity({ closeThreshold: -20, openThreshold: -30 }),
    ).toBe(false);
    h.runtime.stop();
    expect(h.state.activity).toMatchObject({ phase: 'idle', intensity: 0 });
    h.runtime.destroy();
  });
  it('only applies current complete calibration, retains it on a same-format restart and invalidates real input changes', async () => {
    const h = harness();
    expect(h.runtime.applyActivityCalibration({})).toBe(false);
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    await h.runtime.start();
    const results = calibration(h.state);
    expect(h.runtime.applyActivityCalibration(results)).toBe(true);
    expect(h.state.activityOptions).toMatchObject({
      mode: 'calibration',
      openThreshold: -47,
      closeThreshold: -53,
    });
    expect(h.state.activityCalibrated).toBe(true);
    expect(h.runtime.applyActivityCalibration(results)).toBe(false);
    h.runtime.stop();
    await h.runtime.start();
    expect(h.state.activityCalibrated).toBe(true);
    expect(h.runtime.configureActivity({ openThreshold: -40 })).toBe(false);
    h.runtime.configureActivity({ attackMs: 50 });
    expect(h.state.activityCalibrated).toBe(true);
    h.runtime.configureInput({ gainDb: 3 });
    expect(h.state.activityCalibrated).toBe(false);
    expect(h.state.activity.intensity).toBe(0);
    expect(h.runtime.applyActivityCalibration(results)).toBe(false);
    expect(h.runtime.applyActivityCalibration(calibration(h.state))).toBe(true);
    h.runtime.stop();
    const changed = stream();
    changed.track.getSettings = () => ({
      deviceId: 'mic-a',
      sampleRate: 44100,
      channelCount: 1,
    });
    h.devices.getUserMedia.mockResolvedValue(changed);
    await h.runtime.start();
    expect(h.state.activityCalibrated).toBe(false);
    h.runtime.destroy();
  });
  it('snapshots requested processing at start, verifies actual values, and allows only gain while running', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    expect(
      h.runtime.configureInput({
        noiseSuppression: true,
        highPassHz: 80,
        gainDb: 6,
      }),
    ).toBe(true);
    const input = stream();
    input.track.getSettings = () => ({
      deviceId: 'mic-a',
      sampleRate: 48000,
      channelCount: 1,
      noiseSuppression: false,
    });
    h.devices.getUserMedia.mockResolvedValue(input);
    await h.runtime.start();
    expect(h.devices.getUserMedia.mock.calls[0][0].audio.noiseSuppression).toBe(
      true,
    );
    expect(h.state.settings.noiseSuppression).toBe(false);
    expect(h.state.settings.gainDb).toBe(6);
    expect(h.runtime.configureInput({ echoCancellation: true })).toBe(false);
    expect(h.runtime.configureInput({ highPassHz: 120 })).toBe(false);
    expect(h.runtime.configureInput({ gainDb: -6 })).toBe(true);
    expect(h.state.settings.gainDb).toBe(-6);
    h.runtime.stop();
    expect(h.runtime.configureInput({ highPassHz: 120 })).toBe(true);
    h.runtime.destroy();
  });
  it('rejects processing edits during pending start and cleans failed graph setup', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const pending = deferred();
    h.devices.getUserMedia.mockReturnValue(pending.promise);
    const starting = h.runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.runtime.configureInput({ gainDb: 9 })).toBe(false);
    h.context.createGain.mockImplementation(() => {
      throw new Error('graph failure');
    });
    const input = stream();
    pending.resolve(input);
    await starting;
    expect(h.source.disconnect).toHaveBeenCalled();
    expect(input.track.stop).toHaveBeenCalled();
    expect(h.state.status).toBe('error');
    h.runtime.destroy();
  });
  it('requires selection, preserves fresh list state after stale reads, and handles request timeout', async () => {
    const h = harness();
    expect(await h.runtime.start()).toBe(false);
    expect(h.runtime.selectDevice('missing')).toBe(false);
    const delayed = deferred();
    h.devices.enumerateDevices.mockReturnValueOnce(delayed.promise);
    const reading = h.runtime.refreshDevices();
    await vi.advanceTimersByTimeAsync(0);
    h.runtime.stop();
    delayed.resolve([]);
    await reading;
    expect(h.state.refreshing).toBe(false);
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const input = deferred();
    h.devices.getUserMedia.mockReturnValue(input.promise);
    const starting = h.runtime.start();
    await vi.advanceTimersByTimeAsync(15001);
    expect(h.state.status).toBe('error');
    expect(h.state.intensity).toBe(0);
    const late = stream();
    input.resolve(late);
    await starting;
    expect(late.track.stop).toHaveBeenCalled();
    h.runtime.destroy();
  });

  it('cleans graph setup failures, sample failures and unreadable device changes', async () => {
    for (const phase of ['context', 'sample', 'devices']) {
      const h = harness();
      await h.runtime.refreshDevices();
      h.runtime.selectDevice('mic-a');
      const input = stream();
      h.devices.getUserMedia.mockResolvedValue(input);
      if (phase === 'context')
        h.context.resume.mockRejectedValue(new Error('context failure'));
      await h.runtime.start();
      if (phase === 'sample') {
        h.analyser.getFloatTimeDomainData = () => {
          throw new Error('sample failure');
        };
        await vi.advanceTimersByTimeAsync(40);
      }
      if (phase === 'devices') {
        h.devices.enumerateDevices.mockRejectedValue(
          new Error('device failure'),
        );
        h.devices.dispatchEvent(new Event('devicechange'));
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(h.state.status).toBe('error');
      expect(h.state.intensity).toBe(0);
      expect(input.track.stop).toHaveBeenCalled();
      h.runtime.destroy();
    }
  });
  it('does not request input at creation, enumerates explicit physical inputs and starts exact selected audio only', async () => {
    const h = harness();
    expect(h.devices.getUserMedia).not.toHaveBeenCalled();
    await h.runtime.refreshDevices();
    expect(h.state.devices.map((d) => d.id)).toEqual(['mic-a']);
    expect(h.state.selectedDeviceId).toBe('');
    h.runtime.selectDevice('mic-a');
    await h.runtime.start();
    expect(h.devices.getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        deviceId: { exact: 'mic-a' },
        channelCount: { ideal: 1 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(h.state.status).toBe('running');
    await vi.advanceTimersByTimeAsync(70);
    expect(h.state.dbfs).toBeCloseTo(-6.0206);
    expect(h.state.intensity).toBeGreaterThan(0);
    expect(h.source.connect).toHaveBeenCalledWith(h.analyser);
    h.runtime.destroy();
    expect(h.context.close).toHaveBeenCalledOnce();
  });
  it('stops a stream arriving after stop, without creating an audio graph', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const pending = deferred();
    h.devices.getUserMedia.mockReturnValue(pending.promise);
    const starting = h.runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    h.runtime.stop();
    const late = stream();
    pending.resolve(late);
    await starting;
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(h.context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(h.state.status).toBe('idle');
    h.runtime.destroy();
  });
  it('preserves a newer session when an older request rejects', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const pending = deferred();
    h.devices.getUserMedia.mockReturnValueOnce(pending.promise);
    const first = h.runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    h.runtime.stop();
    await h.runtime.start();
    pending.reject(new Error('private OS detail'));
    await first;
    expect(h.state.status).toBe('running');
    expect(h.state.error).toBe('');
    h.runtime.destroy();
  });
  it('fails closed on replacement input and never falls back', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const wrong = stream('mic-b');
    h.devices.getUserMedia.mockResolvedValue(wrong);
    await h.runtime.start();
    expect(wrong.track.stop).toHaveBeenCalled();
    expect(h.state.status).toBe('error');
    expect(h.state.error).not.toContain('mic-b');
    expect(h.devices.getUserMedia).toHaveBeenCalledOnce();
    h.runtime.destroy();
  });
  it('resets on track mute/ended, device disappearance and audio context interruption', async () => {
    for (const signal of ['mute', 'ended', 'devicechange', 'statechange']) {
      const h = harness();
      await h.runtime.refreshDevices();
      h.runtime.selectDevice('mic-a');
      const input = stream();
      h.devices.getUserMedia.mockResolvedValue(input);
      await h.runtime.start();
      await vi.advanceTimersByTimeAsync(40);
      if (signal === 'devicechange') {
        h.devices.enumerateDevices.mockResolvedValue([]);
        h.devices.dispatchEvent(new Event(signal));
        await vi.advanceTimersByTimeAsync(0);
      } else if (signal === 'statechange') {
        h.context.state = 'suspended';
        h.context.dispatchEvent(new Event(signal));
      } else input.track.dispatchEvent(new Event(signal));
      expect(h.state.status).toBe('lost');
      expect(h.state.intensity).toBe(0);
      expect(h.state.dbfs).toBe(-100);
      expect(input.track.stop).toHaveBeenCalled();
      expect(h.context.close).toHaveBeenCalled();
      h.runtime.destroy();
    }
  });
  it('bounds controls and never exposes native errors', async () => {
    const h = harness();
    h.runtime.configure({
      noiseFloor: -900,
      sensitivity: 999,
      smoothingMs: -20,
    });
    expect(h.state.controls).toEqual({
      noiseFloor: -90,
      sensitivity: 4,
      smoothingMs: 0,
    });
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    h.devices.getUserMedia.mockRejectedValue(
      Object.assign(new Error('secret path/device'), {
        name: 'NotAllowedError',
      }),
    );
    await h.runtime.start();
    expect(h.state.error).not.toContain('secret');
    expect(h.state.status).toBe('error');
    expect(h.onError).toHaveBeenCalledOnce();
    h.runtime.destroy();
  });
  it('handles denied access and unavailable APIs without input or a graph', async () => {
    const h = harness();
    h.access.beginMicrophoneResearch.mockResolvedValue(null);
    await h.runtime.refreshDevices();
    expect(h.state.status).toBe('error');
    expect(h.devices.enumerateDevices).not.toHaveBeenCalled();
    h.runtime.destroy();
    let state;
    const absent = createMicrophoneResearchRuntime({
      publish: (v) => {
        state = v;
      },
    });
    await absent.refreshDevices();
    expect(state.status).toBe('error');
    absent.destroy();
  });
  it('cancels a pending permission response and releases it after teardown', async () => {
    const h = harness();
    await h.runtime.refreshDevices();
    h.runtime.selectDevice('mic-a');
    const pending = deferred();
    h.access.beginMicrophoneResearch.mockReturnValue(pending.promise);
    const starting = h.runtime.start();
    h.runtime.destroy();
    pending.resolve('late-lease');
    await starting;
    expect(h.devices.getUserMedia).not.toHaveBeenCalled();
    expect(h.access.endMicrophoneResearch).toHaveBeenCalledWith('late-lease');
  });
});
