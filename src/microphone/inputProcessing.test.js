import { describe, expect, it, vi } from 'vitest';
import {
  normalizeMicrophoneInputOptions,
  microphoneProcessingSupport,
  createMicrophoneInputGraph,
} from './inputProcessing.js';

function harness(options = {}) {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0, setTargetAtTime: vi.fn() },
  };
  const filter = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    frequency: { value: 0 },
    Q: { value: 0 },
  };
  const analysers = [0.8, 0.4].map((value) => ({
    fftSize: 0,
    disconnect: vi.fn(),
    getFloatTimeDomainData: (data) => data.fill(value),
  }));
  const context = {
    currentTime: 2,
    createMediaStreamSource: () => source,
    createGain: () => gain,
    createBiquadFilter: () => filter,
    createAnalyser: vi
      .fn()
      .mockReturnValueOnce(analysers[0])
      .mockReturnValueOnce(analysers[1]),
  };
  const graph = createMicrophoneInputGraph(context, {}, options);
  return { graph, source, gain, filter, analysers };
}
describe('microphone analysis input processing', () => {
  it('reports disconnect errors without preventing disposal of other nodes', () => {
    const h = harness();
    h.source.disconnect.mockImplementation(() => {
      throw Error('disconnect');
    });
    expect(() => h.graph.dispose()).not.toThrow();
    expect(h.gain.disconnect).toHaveBeenCalled();
    expect(() => h.graph.sample()).toThrow('disposed');
  });
  it('bounds digital gain and low-cut, accepting only boolean processing choices', () => {
    expect(normalizeMicrophoneInputOptions()).toEqual({
      gainDb: 0,
      highPassHz: 0,
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    });
    expect(
      normalizeMicrophoneInputOptions({
        gainDb: 90,
        highPassHz: 999,
        noiseSuppression: 'yes',
        autoGainControl: true,
      }),
    ).toMatchObject({
      gainDb: 24,
      highPassHz: 0,
      noiseSuppression: false,
      autoGainControl: true,
    });
    expect(
      normalizeMicrophoneInputOptions({ gainDb: -90, highPassHz: 80 }),
    ).toMatchObject({ gainDb: -24, highPassHz: 80 });
  });
  it('reports unsupported constraints conservatively', () => {
    expect(microphoneProcessingSupport()).toEqual({
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    });
    expect(
      microphoneProcessingSupport({
        getSupportedConstraints: () => ({ noiseSuppression: true }),
      }).noiseSuppression,
    ).toBe(true);
    expect(
      microphoneProcessingSupport({
        getSupportedConstraints: () => {
          throw Error('unavailable');
        },
      }).noiseSuppression,
    ).toBe(false);
  });
  it('keeps device-returned and processed meters separate without an output destination', () => {
    const h = harness();
    expect(h.source.connect).toHaveBeenCalledWith(h.analysers[0]);
    expect(h.source.connect).toHaveBeenCalledWith(h.gain);
    expect(h.gain.gain.value).toBe(1);
    expect(h.filter.connect).not.toHaveBeenCalled();
    const result = h.graph.sample();
    expect(result.rawDbfs).toBeCloseTo(20 * Math.log10(0.8));
    expect(result.dbfs).toBeCloseTo(20 * Math.log10(0.4));
    h.graph.setGainDb(6);
    expect(h.gain.gain.setTargetAtTime).toHaveBeenCalledWith(
      10 ** (6 / 20),
      2,
      0.01,
    );
    h.graph.dispose();
    h.graph.dispose();
    expect(h.source.disconnect).toHaveBeenCalledOnce();
    expect(h.gain.disconnect).toHaveBeenCalledOnce();
    expect(h.graph.setGainDb(0)).toBe(false);
  });
  it('inserts only the selected high-pass before gain', () => {
    const h = harness({ highPassHz: 120, gainDb: -6 });
    expect(h.filter.type).toBe('highpass');
    expect(h.filter.frequency.value).toBe(120);
    expect(h.filter.Q.value).toBeCloseTo(-3.0103);
    expect(h.source.connect).toHaveBeenCalledWith(h.filter);
    expect(h.filter.connect).toHaveBeenCalledWith(h.gain);
    expect(h.gain.gain.value).toBeCloseTo(10 ** (-6 / 20));
    h.graph.dispose();
    expect(h.filter.disconnect).toHaveBeenCalledOnce();
  });
});
