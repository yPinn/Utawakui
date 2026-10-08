import { describe, expect, it } from 'vitest';
import performerWindowBoundsModule from './performerWindowBounds.js';

const {
  DEFAULT_PERFORMER_WINDOW_BOUNDS,
  MIN_PERFORMER_WINDOW_BOUNDS,
  fitPerformerWindowBounds,
  normalizePerformerWindowBounds,
} = performerWindowBoundsModule;

describe('performer window bounds', () => {
  it('defines the standard desktop default and compact safety floor', () => {
    expect(DEFAULT_PERFORMER_WINDOW_BOUNDS).toEqual({
      width: 960,
      height: 540,
    });
    expect(MIN_PERFORMER_WINDOW_BOUNDS).toEqual({
      width: 800,
      height: 360,
    });
  });

  it('accepts only bounded normal window rectangles', () => {
    expect(
      normalizePerformerWindowBounds({
        x: -1280,
        y: 48,
        width: 1280,
        height: 720,
        ignored: true,
      }),
    ).toEqual({ x: -1280, y: 48, width: 1280, height: 720 });

    for (const value of [
      null,
      [],
      { x: 0, y: 0, width: 799, height: 360 },
      { x: 0, y: 0, width: 800, height: 359 },
      { x: 0.5, y: 0, width: 960, height: 540 },
      { x: 1_000_001, y: 0, width: 960, height: 540 },
      { x: 0, y: 0, width: 16_385, height: 540 },
    ]) {
      expect(normalizePerformerWindowBounds(value), value).toBe(null);
    }
  });

  it('centers a fresh standard window in the available work area', () => {
    expect(
      fitPerformerWindowBounds(null, {
        x: 100,
        y: 40,
        width: 1280,
        height: 800,
      }),
    ).toEqual({ x: 260, y: 170, width: 960, height: 540 });
  });

  it('restores a valid rectangle on its matching display', () => {
    expect(
      fitPerformerWindowBounds(
        { x: 2200, y: 100, width: 1280, height: 720 },
        { x: 1920, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 2200, y: 100, width: 1280, height: 720 });
  });

  it('fits oversized or off-screen persisted bounds inside the work area margin', () => {
    expect(
      fitPerformerWindowBounds(
        { x: 5000, y: -5000, width: 1800, height: 900 },
        { x: 0, y: 0, width: 1280, height: 800 },
      ),
    ).toEqual({ x: 32, y: 32, width: 1216, height: 736 });
  });
});
