import { describe, expect, it, vi } from 'vitest';
import { createMetronomeClickEngine } from './metronomeClickEngine.js';

function fixture(options = {}) {
  const contexts = [];
  class Context {
    currentTime = 10;
    destination = {};
    gains = [];
    oscillators = [];
    state = 'running';
    constructor(config = {}) {
      this.options = config;
      this.sinkId = '';
      contexts.push(this);
    }
    createGain() {
      const node = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      this.gains.push(node);
      return node;
    }
    createOscillator() {
      const node = {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      this.oscillators.push(node);
      return node;
    }
    resume() {
      return options.resume?.() ?? Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  return {
    contexts,
    engine: createMetronomeClickEngine({
      AudioContextImpl: Context,
      ...options,
    }),
  };
}

describe('metronome click volume', () => {
  it('only uses system default output and exposes no device-selection API', async () => {
    const { engine, contexts } = fixture();
    expect(engine.prepareOutputDevice).toBeUndefined();
    expect(engine.invalidateOutput).toBeUndefined();
    await engine.resume();
    expect(contexts[0].options).toEqual({});
    expect(contexts[0].sinkId).toBe('');
  });
  it('bounds a stalled default-output resume and releases its deadline timer', async () => {
    vi.useFakeTimers();
    try {
      const { engine, contexts } = fixture({
        resume: () => new Promise(() => {}),
      });
      const rejected = expect(engine.resume()).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5000);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      await engine.close();
      expect(contexts[0].gains[0].disconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('stays lazy and routes every synthesized click through an independent master gain', () => {
    const { engine, contexts } = fixture();
    engine.setVolume(0.35);
    expect(contexts).toHaveLength(0);
    engine.scheduleClick(10, true);
    const ctx = contexts[0];
    const [master, envelope] = ctx.gains;
    expect(master.gain.value).toBe(0.35);
    expect(master.connect).toHaveBeenCalledWith(ctx.destination);
    expect(envelope.connect).toHaveBeenCalledWith(master);
    expect(ctx.oscillators[0].frequency.value).toBe(1500);
    engine.setVolume(0);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.005);
    engine.setVolume(2);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.005);
    engine.setVolume(NaN);
    expect(master.gain.setTargetAtTime).toHaveBeenCalledTimes(2);
  });

  it('retains volume after recreating its audio context', async () => {
    const { engine, contexts } = fixture();
    engine.setVolume(0.2);
    engine.scheduleClick(10, false);
    expect(contexts[0].oscillators[0].frequency.value).toBe(900);
    await engine.close();
    engine.scheduleClick(10, true);
    expect(contexts[1].gains[0].gain.value).toBe(0.2);
  });
});
