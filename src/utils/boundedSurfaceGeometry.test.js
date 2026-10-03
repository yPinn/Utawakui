import { describe, expect, it } from 'vitest';
import {
  clampBoundedSurfacePosition,
  moveBoundedSurfaceFromKeyboard,
} from './boundedSurfaceGeometry.js';

describe('bounded surface geometry', () => {
  it('keeps a floating player fully inside its shell when it fits', () => {
    expect(
      clampBoundedSurfacePosition(
        { x: -24, y: 500 },
        { width: 360, height: 240 },
        { width: 960, height: 640 },
      ),
    ).toEqual({ x: 0, y: 400 });
  });

  it('preserves a reachable grab area when an expanded surface exceeds the shell', () => {
    expect(
      clampBoundedSurfacePosition(
        { x: -900, y: 900 },
        { width: 500, height: 720 },
        { width: 320, height: 600 },
        48,
      ),
    ).toEqual({ x: -452, y: 552 });
  });

  it('supports the same normal and accelerated keyboard steps as photo objects', () => {
    const options = {
      itemSize: { width: 360, height: 240 },
      containerSize: { width: 960, height: 640 },
    };

    expect(
      moveBoundedSurfaceFromKeyboard(
        { x: 100, y: 100 },
        'ArrowRight',
        false,
        options,
      ),
    ).toEqual({ x: 108, y: 100 });
    expect(
      moveBoundedSurfaceFromKeyboard(
        { x: 100, y: 100 },
        'ArrowUp',
        true,
        options,
      ),
    ).toEqual({ x: 100, y: 76 });
    expect(
      moveBoundedSurfaceFromKeyboard(
        { x: 100, y: 100 },
        'Enter',
        false,
        options,
      ),
    ).toBeNull();
  });
});
