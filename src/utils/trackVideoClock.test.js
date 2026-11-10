import { describe, expect, it } from 'vitest';
import { trackVideoFrame } from './trackVideoClock.js';

const sample = { phase: 'playing', positionMs: 10000, rate: 1 };

describe('trackVideoFrame', () => {
  it('keeps key independent of rate and compensates for audible monitor delay', () => {
    expect(trackVideoFrame(sample, 500, 120, 60)).toEqual({
      position: 10.38,
      rate: 1,
      playing: true,
    });
  });

  it('uses the actual rate and converts monitor delay to media time', () => {
    const frame = trackVideoFrame({ ...sample, rate: 0.75 }, 0, 200, 60);
    expect(frame).toEqual({ position: 9.85, rate: 0.75, playing: true });
  });

  it('holds the seek landing while paused and hides out-of-range frames', () => {
    expect(
      trackVideoFrame({ ...sample, phase: 'paused' }, 500, 120, 60),
    ).toEqual({ position: 10.5, rate: 1, playing: false });
    expect(trackVideoFrame(sample, 0, 0, 10)).toBeNull();
    expect(trackVideoFrame(sample, -11000, 0, 60)).toBeNull();
  });
});
