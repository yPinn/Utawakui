import { describe, expect, it, vi } from 'vitest';
import {
  analyzeArtworkPixels,
  createVinylContourGeometry,
  createVinylNebulaGeometry,
  createVinylSurface,
  formatArtworkAccent,
  readArtworkAccent,
  selectArtworkAccent,
  selectArtworkPalette,
} from './artworkLayout.mjs';

function pixels(...colors) {
  return new Uint8ClampedArray(colors.flat());
}

function decodeSvgMask(mask) {
  const prefix = 'url("data:image/svg+xml,';
  return decodeURIComponent(mask.slice(prefix.length, -2));
}

describe('artwork accent selection', () => {
  it('selects a bounded chromatic color while ignoring transparent and neutral pixels', () => {
    const accent = selectArtworkAccent(
      pixels(
        ...Array.from({ length: 12 }, () => [236, 74, 28, 255]),
        ...Array.from({ length: 4 }, () => [4, 5, 6, 255]),
        ...Array.from({ length: 4 }, () => [250, 250, 248, 255]),
        ...Array.from({ length: 4 }, () => [50, 130, 180, 0]),
      ),
    );

    expect(accent).not.toBeNull();
    expect(accent.r).toBeGreaterThan(accent.g);
    expect(accent.g).toBeGreaterThan(accent.b);
    expect(formatArtworkAccent(accent)).toMatch(
      /^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/,
    );
  });

  it('returns no accent when artwork has no useful chroma', () => {
    expect(
      selectArtworkAccent(
        pixels(
          ...Array.from({ length: 8 }, () => [20, 20, 20, 255]),
          ...Array.from({ length: 8 }, () => [230, 230, 230, 255]),
        ),
      ),
    ).toBeNull();
  });

  it('selects up to three visually distinct artwork colors', () => {
    const palette = selectArtworkPalette(
      pixels(
        ...Array.from({ length: 12 }, () => [224, 62, 54, 255]),
        ...Array.from({ length: 10 }, () => [42, 154, 104, 255]),
        ...Array.from({ length: 8 }, () => [48, 92, 214, 255]),
        ...Array.from({ length: 6 }, () => [238, 236, 232, 255]),
      ),
    );

    expect(palette).toHaveLength(3);
    expect(new Set(palette.map(formatArtworkAccent)).size).toBe(3);
  });

  it('creates one stable hybrid vinyl surface per track', () => {
    const first = createVinylSurface('track-one');
    const repeated = createVinylSurface('track-one');
    const different = createVinylSurface('track-two');

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first.ink).toContain('radial-gradient(');
    expect(first.ink).not.toContain('conic-gradient(');
    expect(first.ink).toContain('var(--ovl-color-artwork-accent)');
    expect(first.ink).toContain('var(--ovl-color-artwork-secondary)');
    expect(first.ink).toContain('var(--ovl-color-artwork-tertiary)');
    expect(
      first.ink.match(/radial-gradient\(/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(first.ink).not.toContain('repeating-');
    expect(first.shadowMask).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(first.highlightMask).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(first.sprayMask).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(first.surfaceSprayMask).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  it('builds a stable asymmetric nebula from broad veils and local color knots', () => {
    const first = createVinylNebulaGeometry('track-one');
    const repeated = createVinylNebulaGeometry('track-one');
    const different = createVinylNebulaGeometry('track-two');

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first.veils.length).toBeGreaterThanOrEqual(2);
    expect(first.veils.length).toBeLessThanOrEqual(3);
    expect(first.knots.length).toBeGreaterThanOrEqual(1);
    expect(first.knots.length).toBeLessThanOrEqual(2);
    expect(
      first.veils.every(
        ({ width, height, x, y, strength }) =>
          width >= 58 &&
          width <= 88 &&
          height >= 42 &&
          height <= 76 &&
          x >= 12 &&
          x <= 88 &&
          y >= 12 &&
          y <= 88 &&
          strength >= 48 &&
          strength <= 76,
      ),
    ).toBe(true);
    expect(
      first.knots.every(
        ({ width, height, x, y, strength }) =>
          width >= 18 &&
          width <= 38 &&
          height >= 12 &&
          height <= 30 &&
          x >= 16 &&
          x <= 84 &&
          y >= 16 &&
          y <= 84 &&
          strength >= 30 &&
          strength <= 58,
      ),
    ).toBe(true);
  });

  it('keeps broad shadow and highlight contours in independent masks', () => {
    const surface = createVinylSurface('track-one');
    const shadow = decodeSvgMask(surface.shadowMask);
    const highlight = decodeSvgMask(surface.highlightMask);

    expect(surface.shadowMask).not.toBe(surface.highlightMask);
    expect(shadow).toContain('data-layer="shadow-contours"');
    expect(highlight).toContain('data-layer="highlight-contours"');
    expect(shadow).toContain('stdDeviation="3.2"');
    expect(highlight).toContain('stdDeviation="2.6"');
    for (const mask of [shadow, highlight]) {
      expect(mask).toContain('fill="white"');
      expect(mask).toContain('filter="url(#contour-soft)"');
      expect(mask).not.toMatch(/web|spoke|connector|ripple/i);
      expect(mask).not.toContain('stroke-dasharray');
      expect(mask).not.toMatch(/<line|<polyline|<polygon|feTurbulence/i);
    }
    expect(shadow).not.toContain('stroke=');
    expect(highlight).toContain('data-pigment="spiral-trajectory"');
    expect(highlight).toContain('fill="none"');
    expect(highlight).toContain('stroke="white"');
    expect(highlight).toContain('stroke-linecap="round"');
    expect(highlight.match(/data-pigment="spiral-trajectory"/g)).toHaveLength(
      4,
    );
  });

  it('adds bounded soft spray blooms and sparse satellite dabs inside the annulus', () => {
    const surface = createVinylSurface('track-one');
    const spray = decodeSvgMask(surface.sprayMask);
    const highlight = decodeSvgMask(surface.highlightMask);
    const surfaceSpray = decodeSvgMask(surface.surfaceSprayMask);
    const shadowBlooms = spray.match(/data-pigment="spray-bloom"/g) ?? [];
    const shadowDabs = spray.match(/data-pigment="spray-dab"/g) ?? [];
    const surfaceDabs =
      surfaceSpray.match(/data-pigment="surface-spray-dab"/g) ?? [];

    expect(spray).toContain('data-layer="spray-ink"');
    expect(surfaceSpray).toContain('data-layer="surface-spray"');
    expect(spray).toContain('clip-path="url(#annulus)"');
    expect(highlight).toContain('clip-path="url(#annulus)"');
    expect(surfaceSpray).toContain('clip-path="url(#annulus)"');
    for (const mask of [spray, highlight, surfaceSpray]) {
      expect(mask).toContain('M50 31a19 19');
      expect(mask).not.toContain('M50 19a31 31');
    }
    expect(shadowBlooms.length).toBeGreaterThanOrEqual(1);
    expect(shadowBlooms.length).toBeLessThanOrEqual(2);
    expect(shadowDabs.length).toBeGreaterThanOrEqual(6);
    expect(shadowDabs.length).toBeLessThanOrEqual(14);
    expect(surfaceDabs.length).toBeGreaterThanOrEqual(160);
    expect(surfaceDabs.length).toBeLessThanOrEqual(200);
    expect(surfaceDabs.length % 10).toBe(0);
    expect(spray).toContain('filter="url(#spray-soft)"');
    expect(surfaceSpray).toContain('filter="url(#dab-soft)"');
    expect(highlight).not.toContain('data-pigment="spray-dab"');
    expect(surfaceSpray).not.toMatch(
      /spray-bloom|<path[^>]+data-pigment|stroke=|feTurbulence/i,
    );
  });

  it('uses sparse local tonal clouds instead of overlapping concentric bands', () => {
    const {
      shadowContours,
      highlightContours,
      sprayBlooms,
      shadowDabs,
      surfaceDabs,
      surfaceFieldDabs,
      surfaceSpiralDabs,
      surfaceSpiral,
      spiralTrajectorySegments,
    } = createVinylContourGeometry('track-one');

    expect(shadowContours.length).toBeGreaterThanOrEqual(2);
    expect(shadowContours.length).toBeLessThanOrEqual(3);
    expect(highlightContours.length).toBeGreaterThanOrEqual(2);
    expect(highlightContours.length).toBeLessThanOrEqual(3);
    expect(
      shadowContours.every(
        ({ width, span, opacity, path }) =>
          width >= 8 &&
          width <= 14 &&
          span >= 48 &&
          span <= 110 &&
          opacity >= 0.14 &&
          opacity <= 0.27 &&
          path.endsWith('Z'),
      ),
    ).toBe(true);
    expect(
      highlightContours.every(
        ({ width, span, opacity, path }) =>
          width >= 5 &&
          width <= 10 &&
          span >= 34 &&
          span <= 88 &&
          opacity >= 0.1 &&
          opacity <= 0.23 &&
          path.endsWith('Z'),
      ),
    ).toBe(true);
    expect(
      shadowContours.reduce((total, contour) => total + contour.span, 0),
    ).toBeLessThanOrEqual(330);
    expect(
      highlightContours.reduce((total, contour) => total + contour.span, 0),
    ).toBeLessThanOrEqual(264);
    expect(
      [...shadowContours, ...highlightContours].every(
        ({ path }) => !/[HV]/.test(path),
      ),
    ).toBe(true);
    expect(sprayBlooms.length).toBeGreaterThanOrEqual(1);
    expect(sprayBlooms.length).toBeLessThanOrEqual(2);
    expect(
      [...shadowDabs, ...surfaceDabs].every(({ x, y }) => {
        const radius = Math.hypot(x - 50, y - 50);
        return radius >= 20.5 && radius <= 47;
      }),
    ).toBe(true);
    expect(surfaceDabs.length).toBeGreaterThanOrEqual(160);
    expect(surfaceDabs.length).toBeLessThanOrEqual(200);
    expect(surfaceDabs.length % 10).toBe(0);
    expect(
      surfaceDabs.every(
        ({ radius, opacity }) =>
          radius >= 0.34 &&
          radius <= 0.82 &&
          opacity >= 0.52 &&
          opacity <= 0.82,
      ),
    ).toBe(true);
    const occupiedSurfaceCells = new Set(
      surfaceFieldDabs.map(({ x, y }) => {
        const offsetX = x - 50;
        const offsetY = y - 50;
        const angle =
          ((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 360) % 360;
        const angularSector = Math.floor(angle / 30);
        const innerSquared = 20.5 ** 2;
        const outerSquared = 47 ** 2;
        const normalizedRadius =
          (offsetX ** 2 + offsetY ** 2 - innerSquared) /
          (outerSquared - innerSquared);
        const radialBand = Math.min(3, Math.floor(normalizedRadius * 4));
        return `${angularSector}:${radialBand}`;
      }),
    );
    expect(occupiedSurfaceCells.size).toBe(48);
    expect(surfaceFieldDabs.length).toBe(Math.round(surfaceDabs.length * 0.3));
    expect(surfaceSpiralDabs.length).toBe(
      surfaceDabs.length - surfaceFieldDabs.length,
    );
    expect(surfaceSpiral).toMatchObject({ armCount: 2 });
    expect(surfaceSpiral.turns).toBeGreaterThanOrEqual(0.72);
    expect(surfaceSpiral.turns).toBeLessThanOrEqual(0.95);
    expect(spiralTrajectorySegments).toHaveLength(4);
    expect(
      spiralTrajectorySegments.every(
        ({ width, opacity, progressStart, progressEnd, path }) =>
          width >= 4.5 &&
          width <= 6.5 &&
          opacity >= 0.12 &&
          opacity <= 0.24 &&
          progressStart >= 0.01 &&
          progressEnd <= 0.78 &&
          progressEnd - progressStart >= 0.2 &&
          path.startsWith('M ') &&
          !path.endsWith('Z'),
      ),
    ).toBe(true);
    const trajectoryByArm = [0, 1].map((arm) =>
      spiralTrajectorySegments
        .filter((segment) => segment.arm === arm)
        .sort((first, second) => first.progressStart - second.progressStart),
    );
    expect(trajectoryByArm.every((segments) => segments.length === 2)).toBe(
      true,
    );
    expect(
      trajectoryByArm.every(
        ([inner, outer]) => outer.progressStart - inner.progressEnd >= 0.06,
      ),
    ).toBe(true);
    expect(
      trajectoryByArm.flat().every(({ startPoint, endPoint }) =>
        [startPoint, endPoint].every((point) => {
          const radius = Math.hypot(point.x - 50, point.y - 50);
          return radius >= 20.5 && radius <= 47;
        }),
      ),
    ).toBe(true);
    const [firstArmStart, secondArmStart] = trajectoryByArm.map(
      ([segment]) => segment.startAngle,
    );
    const centralArmSeparation = Math.abs(
      ((((secondArmStart - firstArmStart) % 360) + 540) % 360) - 180,
    );
    expect(centralArmSeparation).toBeGreaterThanOrEqual(42);
    expect(centralArmSeparation).toBeLessThanOrEqual(62);

    const armCounts = [0, 1].map(
      (arm) => surfaceSpiralDabs.filter((dab) => dab.arm === arm).length,
    );
    expect(Math.abs(armCounts[0] - armCounts[1])).toBeLessThanOrEqual(1);
    expect(
      surfaceSpiralDabs.every((dab) => {
        const offsetX = dab.x - 50;
        const offsetY = dab.y - 50;
        const actualAngle =
          ((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 360) % 360;
        const expectedAngle = dab.centerAngle;
        const angularDeviation = Math.abs(
          ((((actualAngle - expectedAngle) % 360) + 540) % 360) - 180,
        );
        const innerSquared = 20.5 ** 2;
        const normalizedRadius =
          (offsetX ** 2 + offsetY ** 2 - innerSquared) /
          (47 ** 2 - innerSquared);
        return (
          dab.distribution === 'spiral' &&
          angularDeviation <= 6.1 &&
          Math.abs(normalizedRadius - dab.centerNormalizedRadius) <= 0.021
        );
      }),
    ).toBe(true);
    const innerSpiralDabs = surfaceSpiralDabs.filter(
      ({ progress }) => progress <= 0.25,
    );
    expect(
      Math.min(
        ...innerSpiralDabs.map(({ x, y }) => Math.hypot(x - 50, y - 50)),
      ),
    ).toBeLessThanOrEqual(21.8);
    expect(
      Math.max(
        ...innerSpiralDabs.map(({ centerNormalizedRadius }) =>
          Number(centerNormalizedRadius),
        ),
      ),
    ).toBeLessThanOrEqual(0.17);
  });

  it('uses dark copy over a neutral light lower region without inventing an accent', () => {
    const presentation = analyzeArtworkPixels(
      pixels(
        ...Array.from({ length: 4 }, () => [24, 24, 24, 255]),
        ...Array.from({ length: 4 }, () => [244, 242, 236, 255]),
      ),
      { width: 4, height: 2 },
    );

    expect(presentation).toEqual({
      accent: null,
      copyTone: 'dark',
      palette: [],
    });
  });

  it('keeps light copy over a dark lower region', () => {
    expect(
      analyzeArtworkPixels(
        pixels(...Array.from({ length: 8 }, () => [18, 20, 22, 255])),
        { width: 4, height: 2 },
      ),
    ).toEqual({ accent: null, copyTone: 'light', palette: [] });
  });

  it('samples a small same-origin canvas once and tolerates unavailable pixels', () => {
    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({
      data: pixels(...Array.from({ length: 4 }, () => [38, 150, 146, 255])),
    }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage, getImageData })),
    };
    const documentRef = { createElement: vi.fn(() => canvas) };

    expect(readArtworkAccent({}, { documentRef, sampleSize: 2 })).toMatchObject(
      { g: expect.any(Number), b: expect.any(Number) },
    );
    expect(canvas).toMatchObject({ width: 2, height: 2 });
    expect(drawImage).toHaveBeenCalledOnce();

    getImageData.mockImplementationOnce(() => {
      throw new Error('tainted');
    });
    expect(readArtworkAccent({}, { documentRef, sampleSize: 2 })).toBeNull();
  });
});
