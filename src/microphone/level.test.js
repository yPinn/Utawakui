import { describe, expect, it } from 'vitest';
import { measureMicrophoneLevel, projectMicrophoneLevel } from './level.js';

describe('microphone level measurement', () => {
  it('measures RMS dBFS and sample peak without inventing a signal', () => {
    expect(measureMicrophoneLevel(new Float32Array(32))).toEqual({
      dbfs: -100,
      peak: 0,
      clipped: false,
    });
    const measured = measureMicrophoneLevel(new Float32Array([0.5, -0.5]));
    expect(measured.dbfs).toBeCloseTo(-6.0206);
    expect(measured.peak).toBe(0.5);
    expect(measured.clipped).toBe(false);
    expect(measureMicrophoneLevel(new Float32Array([1, -1])).clipped).toBe(
      true,
    );
  });
  it('fails closed on invalid samples', () => {
    expect(measureMicrophoneLevel(new Float32Array([NaN, Infinity])).dbfs).toBe(
      -100,
    );
    expect(measureMicrophoneLevel(new Float32Array()).peak).toBe(0);
  });
  it('gates noise, bounds sensitivity and smooths by elapsed time', () => {
    expect(projectMicrophoneLevel(-70, 0.5, 33, { noiseFloor: -55 })).toBe(0);
    const next = projectMicrophoneLevel(-20, 0, 33, {
      noiseFloor: -55,
      sensitivity: 1,
      smoothingMs: 150,
    });
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
    const split = projectMicrophoneLevel(-20, next, 33, {
      noiseFloor: -55,
      sensitivity: 1,
      smoothingMs: 150,
    });
    expect(split).toBeCloseTo(
      projectMicrophoneLevel(-20, 0, 66, {
        noiseFloor: -55,
        sensitivity: 1,
        smoothingMs: 150,
      }),
    );
    expect(
      projectMicrophoneLevel(0, 0, 1000, { sensitivity: 999, smoothingMs: 0 }),
    ).toBe(1);
  });
});
