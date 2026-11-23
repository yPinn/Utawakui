import { describe, expect, it } from 'vitest';
import {
  nearestOutputInlineClearance,
  outputBoxesOverlap,
  outputOccupancyBounds,
  shiftOutputBox,
} from './outputOccupancy.mjs';

describe('output occupancy', () => {
  it('converts bounded model geometry to normalized canvas edges', () => {
    expect(
      outputOccupancyBounds({ x: 0.75, y: 0.5, width: 0.5, height: 0.5 }),
    ).toEqual({ left: 0.5, top: 0.25, right: 1, bottom: 0.75 });
    expect(
      outputOccupancyBounds({ x: 0.75, y: 0.5, width: Infinity, height: 0.5 }),
    ).toBeNull();
    expect(outputOccupancyBounds(null)).toBeNull();
  });

  it('moves to the nearest clear position within the viewport and other boxes', () => {
    const model = { left: 0.6, top: 0.1, right: 0.85, bottom: 0.9 };
    const box = { left: 0.7, top: 0.25, right: 0.84, bottom: 0.7 };
    const leftBubble = { left: 0.2, top: 0.1, right: 0.4, bottom: 0.9 };
    const shift = nearestOutputInlineClearance(box, [model, leftBubble], 0.01);
    expect(shift).toBeCloseTo(-0.25);
    expect(outputBoxesOverlap(shiftOutputBox(box, shift), model)).toBe(false);
    expect(
      nearestOutputInlineClearance(
        box,
        [{ ...model, left: 0, right: 1 }],
        0.01,
      ),
    ).toBeUndefined();
  });
});
