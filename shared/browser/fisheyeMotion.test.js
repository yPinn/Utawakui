import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { createFisheyeMotion } from './fisheyeMotion.mjs';
import { FISHEYE_FRAME_MS } from '../presentation/fisheyeLyrics.mjs';

describe('Fisheye GSAP motion', () => {
  it('interpolates subframes and can sample the same frame after seeking backward', () => {
    const motion = createFisheyeMotion(gsap);
    try {
      const sample = (frame, overrides = {}) =>
        motion.lyricPose({
          ageMs: frame * FISHEYE_FRAME_MS,
          durationMs: 24 * FISHEYE_FRAME_MS,
          animate: true,
          blur: true,
          ...overrides,
        });
      const arc = sample(0.5);
      expect(arc.orbit.turn).toBeCloseTo(-0.52);
      expect(arc.orbit.face).toBeGreaterThan(sample(0).orbit.face);
      expect(sample(19).orbit.turn).toBe(0);
      expect(sample(19.5).orbit.turn).toBeGreaterThan(0);
      expect(sample(20.5).orbit.turn).toBeGreaterThan(0.24);
      expect(sample(22.1).visible).toBe(false);
      expect(sample(0.5)).toEqual(arc);
      expect(sample(1.5, { enter: 'swirl' }).swirl.bend).toBeCloseTo(0.555);
      expect(sample(20, { exit: 'swirl' }).swirl.bend).toBe(0);
      expect(sample(20.5, { exit: 'swirl' }).swirl.bend).toBeGreaterThan(0);
      expect(sample(23.8, { exit: 'swirl' }).swirl.opacity).toBeLessThan(0.2);
      expect(
        sample(1, { enter: 'scale' }).letterScales.right.some(
          (scale) => scale > 0,
        ),
      ).toBe(true);
      expect(sample(0.5, { enter: 'smoke' }).smoke).toBeGreaterThan(0);
      expect(sample(3, { enter: 'smoke' }).particles).toBeGreaterThan(0);
      expect(sample(20, { animate: false })).toMatchObject({
        visible: true,
        orbit: null,
      });
    } finally {
      motion.dispose();
    }
  });

  it('eases the framing and settles at either endpoint', () => {
    const motion = createFisheyeMotion(gsap);
    try {
      const sample = (target, elapsedMs) =>
        motion.layoutMix({ target, elapsedMs, durationMs: 560 });
      expect(sample(1, -10)).toBe(0);
      expect(sample(1, 140)).toBeGreaterThan(0);
      expect(sample(1, 140)).toBeLessThan(0.25);
      expect(sample(1, 280)).toBeCloseTo(0.5);
      expect(sample(1, 560)).toBe(1);
      expect(sample(0, 280)).toBeCloseTo(0.5);
      expect(sample(0, 900)).toBe(0);
    } finally {
      motion.dispose();
    }
  });
});
