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

  it('holds the seek landing and keeps a boundary frame outside the video duration', () => {
    expect(
      trackVideoFrame({ ...sample, phase: 'paused' }, 500, 120, 60),
    ).toEqual({ position: 10.5, rate: 1, playing: false });
    expect(trackVideoFrame(sample, 0, 0, 10)).toEqual({
      position: 9.999,
      rate: 1,
      playing: false,
    });
    expect(trackVideoFrame(sample, -11000, 0, 60)).toEqual({
      position: 0,
      rate: 1,
      playing: false,
    });
    expect(trackVideoFrame({ ...sample, phase: 'ended' }, 500, 0, 20)).toEqual({
      position: 10.5,
      rate: 1,
      playing: false,
    });
    expect(trackVideoFrame(sample, 0, 0, NaN)).toBeNull();
  });

  it('continues the prior section through a gap and switches at the next audible anchor', () => {
    const segments = [
      { startMs: 0, endMs: 171000, offsetMs: 18766 },
      { startMs: 174229, endMs: 240729, offsetMs: 77825 },
    ];
    const at = (positionMs, delay = 0, offset = 18766) =>
      trackVideoFrame(
        { ...sample, positionMs },
        offset,
        delay,
        318.57,
        segments,
      );
    expect(at(60000).position).toBe(78.766);
    expect(at(172000)).toMatchObject({
      position: 190.766,
      playing: true,
      segmentStartMs: 0,
    });
    expect(at(174229).position).toBe(252.054);
    expect(at(174229, 50)).toMatchObject({
      position: 192.945,
      segmentStartMs: 0,
    });
    expect(at(200000, 100, 18816).position).toBe(277.775);
    expect(at(240729).position).toBe(318.554);
    expect(at(242000)).toMatchObject({ position: 318.569, playing: false });
  });
});
