import { describe, expect, it } from 'vitest';
import { warpFisheyeInk } from './fisheyePaint.mjs';

function image(width, height, bytes) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(bytes ?? width * height * 4),
  };
}

function pixel({ width, data }, x, y) {
  const offset = 4 * (y * width + x);
  return Array.from(data.slice(offset, offset + 4));
}

describe('Fisheye Canvas swirl', () => {
  it('leaves a fully transparent sample clear even when it has RGB values', () => {
    const source = image(
      2,
      2,
      [255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0],
    );
    const target = image(2, 2);
    warpFisheyeInk(source, target, { turn: 0, bend: 0 });
    expect(target.data).toEqual(new Uint8ClampedArray(16));
  });

  it('preserves the existing bounds and ignores color in transparent pixels', () => {
    const source = image(
      3,
      3,
      [
        255, 30, 60, 0, 40, 80, 120, 127, 50, 80, 100, 255, 30, 40, 50, 255, 90,
        80, 70, 63, 50, 80, 100, 255, 50, 80, 100, 255, 50, 80, 100, 255, 50,
        80, 100, 255,
      ],
    );
    const target = image(3, 3);
    warpFisheyeInk(source, target, { turn: 0, bend: 0 });
    expect(pixel(target, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(target, 1, 0)).toEqual([40, 80, 120, 127]);
    expect(pixel(target, 1, 1)).toEqual([90, 80, 70, 63]);
    expect(pixel(target, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(target, 1, 2)).toEqual([0, 0, 0, 0]);
  });

  it('samples both directions with alpha-weighted color at fractional coordinates', () => {
    const source = image(4, 4);
    source.data.set([250, 5, 10, 0], 4 * (1 * 4 + 1));
    source.data.set([255, 25, 10, 200], 4 * (1 * 4 + 2));
    source.data.set([20, 110, 220, 120], 4 * (2 * 4 + 1));
    source.data.set([10, 200, 20, 70], 4 * (2 * 4 + 2));

    const right = image(4, 4);
    const left = image(4, 4);
    const pose = { turn: 0.32, bend: 0.28 };
    warpFisheyeInk(source, right, pose, 1);
    warpFisheyeInk(source, left, pose, -1);
    expect(pixel(right, 1, 2)).toEqual([11, 193, 35, 8]);
    expect(pixel(left, 1, 2)).toEqual([243, 33, 11, 177]);
  });
});
