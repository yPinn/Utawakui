import { describe, expect, it } from 'vitest';

import {
  KINETIC_POP_PUNCH_SECONDS,
  kineticPopBurstDelaySeconds,
  kineticPopEnterPose,
  kineticPopPunchDelays,
  kineticPopPunchStages,
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

  it('stages a short word in a non-linear burst with an immediate leading glyph', () => {
    expect(kineticPopPunchDelays(3, 0)).toEqual([0.052, 0, 0.034]);
    expect(kineticPopPunchDelays(3, 1)).toEqual([0, 0.034, 0.014]);
    expect(kineticPopPunchDelays(1, 0)).toEqual([0]);
    expect(kineticPopPunchDelays(2, 2)[0]).toBeCloseTo(0.02);
    expect(KINETIC_POP_PUNCH_SECONDS).toBeCloseTo(0.183);
  });

  it('rebounds in opposite directions and converges to the authored rest pose', () => {
    const stages = kineticPopPunchStages(0, 0, 'straight');
    const opposite = kineticPopPunchStages(1, 0, 'straight');
    expect(stages.map(({ pose }) => pose.scale)).toEqual([
      0.25, 1.16, 0.938, 1.032, 1,
    ]);
    expect(stages.map(({ pose }) => pose.opacity)).toEqual([0, 1, 1, 1, 1]);
    expect(
      stages.slice(1, 4).map(({ pose }) => Math.sign(parseFloat(pose.y))),
    ).toEqual([-1, 1, -1]);
    expect(
      opposite.slice(1, 4).map(({ pose }) => Math.sign(parseFloat(pose.y))),
    ).toEqual([1, -1, 1]);
    expect(kineticPopPunchStages(0, 4, 'subtle-offset').at(-1).pose).toEqual({
      opacity: 1,
      rotation: -1.6,
      scale: 1.01,
      x: '-0.02em',
      y: '0.025em',
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
