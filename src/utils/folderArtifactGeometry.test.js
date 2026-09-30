import { describe, expect, it } from 'vitest';
import {
  clampFolderArtifactPosition,
  getFolderArtifactVisualBounds,
  moveFolderArtifactFromKeyboard,
} from './folderArtifactGeometry.js';

describe('folder artifact geometry', () => {
  it('keeps an artifact that fits fully inside the outer canvas', () => {
    expect(
      clampFolderArtifactPosition(
        { x: -30, y: 500 },
        { width: 240, height: 160 },
        { width: 800, height: 420 },
      ),
    ).toEqual({ x: 0, y: 260 });
  });

  it('derives the visual AABB around the unchanged layout centre', () => {
    expect(
      getFolderArtifactVisualBounds({ width: 240, height: 160 }, 0),
    ).toEqual({ width: 240, height: 160, offsetX: 0, offsetY: 0 });

    const quarterTurn = getFolderArtifactVisualBounds(
      { width: 240, height: 160 },
      90,
    );
    expect(quarterTurn.width).toBeCloseTo(160);
    expect(quarterTurn.height).toBeCloseTo(240);
    expect(quarterTurn.offsetX).toBeCloseTo(40);
    expect(quarterTurn.offsetY).toBeCloseTo(-40);

    const clockwise = getFolderArtifactVisualBounds(
      { width: 240, height: 160 },
      30,
    );
    const counterClockwise = getFolderArtifactVisualBounds(
      { width: 240, height: 160 },
      -30,
    );
    expect(clockwise.width).toBeCloseTo(287.8461, 4);
    expect(clockwise.height).toBeCloseTo(258.5641, 4);
    expect(clockwise.offsetX).toBeCloseTo(-23.923, 4);
    expect(clockwise.offsetY).toBeCloseTo(-49.282, 4);
    expect(counterClockwise).toEqual(clockwise);
  });

  it('clamps the rotated visual edges instead of the unrotated layout box', () => {
    const topLeft = clampFolderArtifactPosition(
      { x: 0, y: 0 },
      { width: 240, height: 160 },
      { width: 800, height: 420 },
      48,
      30,
    );
    expect(topLeft.x).toBeCloseTo(23.923, 4);
    expect(topLeft.y).toBeCloseTo(49.282, 4);

    const bottomRight = clampFolderArtifactPosition(
      { x: 900, y: 900 },
      { width: 240, height: 160 },
      { width: 800, height: 420 },
      48,
      -30,
    );
    expect(bottomRight.x).toBeCloseTo(536.07695, 4);
    expect(bottomRight.y).toBeCloseTo(210.71797, 4);
  });

  it('keeps at least the minimum grab area visible when an artifact is larger than the canvas', () => {
    expect(
      clampFolderArtifactPosition(
        { x: -900, y: 900 },
        { width: 500, height: 540 },
        { width: 320, height: 300 },
        48,
      ),
    ).toEqual({ x: -452, y: 252 });

    expect(
      clampFolderArtifactPosition(
        { x: -900, y: 900 },
        { width: 500, height: 540 },
        { width: 320, height: 300 },
        48,
        90,
      ),
    ).toEqual({ x: -472, y: 232 });
  });

  it('normalizes invalid measurements instead of producing NaN transforms', () => {
    expect(
      clampFolderArtifactPosition(
        { x: Number.NaN, y: undefined },
        { width: -1, height: Number.POSITIVE_INFINITY },
        { width: 0, height: -20 },
        48,
        Number.NaN,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it('moves by the normal or accelerated keyboard step and clamps the result', () => {
    const sizes = {
      itemSize: { width: 120, height: 80 },
      canvasSize: { width: 300, height: 200 },
    };

    expect(
      moveFolderArtifactFromKeyboard(
        { x: 176, y: 20 },
        'ArrowRight',
        false,
        sizes,
      ),
    ).toEqual({ x: 180, y: 20 });
    const rotated = moveFolderArtifactFromKeyboard(
      { x: 535, y: 100 },
      'ArrowRight',
      false,
      {
        ...sizes,
        itemSize: { width: 240, height: 160 },
        canvasSize: { width: 800, height: 420 },
        rotation: 30,
      },
    );
    expect(rotated.x).toBeCloseTo(536.07695, 4);
    expect(rotated.y).toBe(100);
    expect(
      moveFolderArtifactFromKeyboard(
        { x: 100, y: 20 },
        'ArrowDown',
        true,
        sizes,
      ),
    ).toEqual({ x: 100, y: 44 });
    expect(
      moveFolderArtifactFromKeyboard({ x: 100, y: 20 }, 'Enter', false, sizes),
    ).toBeNull();
  });
});
