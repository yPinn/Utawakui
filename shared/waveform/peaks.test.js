import { describe, expect, it } from 'vitest';
import { summarizeMonoWaveform } from './peaks.mjs';

describe('summarizeMonoWaveform', () => {
  it('keeps per-bucket min, max and RMS in original frame coordinates', () => {
    // 1 kHz with 2 ms buckets -> 2 frames per bucket; the last bucket is short.
    const samples = new Float32Array([0.5, -0.5, 1, 0, -0.25]);
    const result = summarizeMonoWaveform(samples, 1000, 2);

    expect(result.sampleRate).toBe(1000);
    expect(result.frames).toBe(5);
    expect(result.peaks).toMatchObject({
      startFrame: 0,
      endFrame: 5,
      strideFrames: 2,
    });
    expect([...result.peaks.min]).toEqual([-0.5, 0, -0.25]);
    expect([...result.peaks.max]).toEqual([0.5, 1, -0.25]);
    expect(result.peaks.rms[0]).toBeCloseTo(0.5);
    expect(result.peaks.rms[1]).toBeCloseTo(Math.SQRT1_2);
    expect(result.peaks.rms[2]).toBeCloseTo(0.25);
  });

  it('never uses a stride below one frame', () => {
    const result = summarizeMonoWaveform(new Float32Array([0.2, 0.4]), 100, 1);

    expect(result.peaks.strideFrames).toBe(1);
    expect(result.peaks.rms).toHaveLength(2);
  });

  it('returns empty buckets for empty input', () => {
    const result = summarizeMonoWaveform(new Float32Array(), 48000, 5);

    expect(result.frames).toBe(0);
    expect(result.peaks.min).toHaveLength(0);
  });
});
