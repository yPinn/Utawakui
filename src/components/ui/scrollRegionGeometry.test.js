import { describe, expect, it } from 'vitest';
import {
  getOverlayThumbGeometry,
  getScrollOffsetFromThumbDelta,
} from './scrollRegionGeometry.js';

describe('scroll region overlay geometry', () => {
  it('hides an axis when its content fits the viewport', () => {
    expect(
      getOverlayThumbGeometry({
        viewportSize: 176,
        contentSize: 176,
        scrollOffset: 0,
        trackSize: 168,
        minThumbSize: 32,
      }),
    ).toEqual({
      visible: false,
      length: 0,
      offset: 0,
      maxScroll: 0,
      travel: 0,
    });
  });

  it('projects native scroll progress into the overlay track', () => {
    expect(
      getOverlayThumbGeometry({
        viewportSize: 176,
        contentSize: 352,
        scrollOffset: 88,
        trackSize: 168,
        minThumbSize: 32,
        maxThumbSize: 72,
      }),
    ).toEqual({
      visible: true,
      length: 72,
      offset: 48,
      maxScroll: 176,
      travel: 96,
    });
  });

  it('caps a near-full proportional thumb so the overlay stays visually quiet', () => {
    expect(
      getOverlayThumbGeometry({
        viewportSize: 180,
        contentSize: 200,
        scrollOffset: 10,
        trackSize: 180,
        minThumbSize: 32,
        maxThumbSize: 72,
      }),
    ).toEqual({
      visible: true,
      length: 72,
      offset: 54,
      maxScroll: 20,
      travel: 108,
    });
  });

  it('clamps tiny thumbs and their final position inside the rail', () => {
    expect(
      getOverlayThumbGeometry({
        viewportSize: 176,
        contentSize: 1760,
        scrollOffset: 1584,
        trackSize: 168,
        minThumbSize: 32,
      }),
    ).toEqual({
      visible: true,
      length: 32,
      offset: 136,
      maxScroll: 1584,
      travel: 136,
    });
  });

  it('maps pointer drag distance back to a bounded native scroll offset', () => {
    const options = {
      startScrollOffset: 400,
      maxScroll: 1200,
      travel: 120,
    };

    expect(getScrollOffsetFromThumbDelta({ ...options, delta: 30 })).toBe(700);
    expect(getScrollOffsetFromThumbDelta({ ...options, delta: -300 })).toBe(0);
    expect(getScrollOffsetFromThumbDelta({ ...options, delta: 900 })).toBe(
      1200,
    );
  });
});
