import { describe, expect, it } from 'vitest';

import {
  kineticPopBurstDelaySeconds,
  kineticPopEnterPose,
  kineticPopRestPose,
} from './kineticPopMotion.mjs';

describe('Kinetic Pop motion contract', () => {
  it('uses a bounded deterministic odd-even burst instead of source-order sweep timing', () => {
    const delays = Array.from({ length: 24 }, (_unit, index) =>
      kineticPopBurstDelaySeconds(index),
    );

    expect(delays.slice(0, 8)).toEqual([
      0.018, 0, 0.025, 0.006, 0.021, 0.003, 0.028, 0.009,
    ]);
    expect(delays.slice(8, 16)).toEqual(delays.slice(0, 8));
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.028);
    expect(delays[0]).toBeGreaterThan(delays[1]);
    expect(
      delays.some((delay, index) => index > 0 && delay < delays[index - 1]),
    ).toBe(true);
  });

  it('anchors each glyph horizontally while alternating its vertical, rotational and scale phase', () => {
    expect(kineticPopEnterPose(0)).toEqual({
      rotation: -5,
      scale: 0.78,
      x: 0,
      y: 14,
    });
    expect(kineticPopEnterPose(1)).toEqual({
      rotation: 5,
      scale: 1.14,
      x: 0,
      y: -12,
    });
  });

  it('keeps straight rows neutral and gives subtle rows a bounded deterministic rest pose', () => {
    const straight = Array.from({ length: 8 }, (_unit, index) =>
      kineticPopRestPose(index, 'straight'),
    );
    const subtle = Array.from({ length: 16 }, (_unit, index) =>
      kineticPopRestPose(index, 'subtle-offset'),
    );

    expect(straight).toEqual(
      Array.from({ length: 8 }, () => ({
        rotation: 0,
        scale: 1,
        xEm: 0,
        yEm: 0,
      })),
    );
    expect(subtle.slice(8)).toEqual(subtle.slice(0, 8));
    expect(subtle.some((pose) => pose.rotation < 0)).toBe(true);
    expect(subtle.some((pose) => pose.rotation > 0)).toBe(true);
    expect(Math.max(...subtle.map((pose) => Math.abs(pose.rotation)))).toBe(
      1.8,
    );
    expect(
      Math.max(...subtle.map((pose) => Math.abs(pose.xEm))),
    ).toBeLessThanOrEqual(0.025);
    expect(
      Math.max(...subtle.map((pose) => Math.abs(pose.yEm))),
    ).toBeLessThanOrEqual(0.035);
    expect(kineticPopRestPose(0, 'unsupported')).toEqual(straight[0]);
  });
});
