import { describe, expect, it, vi } from 'vitest';
import {
  analyzeArtworkPixels,
  createVinylContourGeometry,
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
    expect(first.shadowMask).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(first.highlightMask).toMatch(/^url\("data:image\/svg\+xml,/);
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
      expect(mask).not.toContain('stroke=');
      expect(mask).not.toContain('stroke-width');
      expect(mask).not.toContain('stroke-dasharray');
    }
  });

  it('uses sparse local tonal clouds instead of overlapping concentric bands', () => {
    const { shadowContours, highlightContours } =
      createVinylContourGeometry('track-one');

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
