import { describe, expect, it, vi } from 'vitest';
import {
  anchoredFloatingLayout,
  anchoredFloatingPosition,
  customLengthPixels,
  pointFloatingPosition,
} from './floatingPosition.js';

describe('customLengthPixels', () => {
  it('uses the rem fallback without a browser document', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(customLengthPixels('--ui-floating-gap', 0.5)).toBe(8);
    vi.unstubAllGlobals();
  });

  it('reads a rem-backed component token and keeps a bounded fallback', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('window', {
      getComputedStyle: () => ({
        fontSize: '20px',
        getPropertyValue: (name) =>
          name === '--ui-floating-gap' ? '0.5rem' : '',
      }),
    });

    expect(customLengthPixels('--ui-floating-gap', 0.25)).toBe(10);
    expect(customLengthPixels('--missing', 0.25)).toBe(5);
    vi.unstubAllGlobals();
  });

  it('resolves token aliases and accepts pixel-backed lengths', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('window', {
      getComputedStyle: () => ({
        fontSize: '16px',
        getPropertyValue: (name) =>
          ({
            '--ui-floating-gap': 'var(--ui-space-2)',
            '--ui-space-2': '8px',
          })[name] ?? '',
      }),
    });

    expect(customLengthPixels('--ui-floating-gap', 0.25)).toBe(8);
    vi.unstubAllGlobals();
  });
});

describe('anchoredFloatingPosition', () => {
  const anchor = {
    top: 100,
    right: 180,
    bottom: 140,
    left: 100,
    width: 80,
    height: 40,
  };
  const surface = { width: 120, height: 60 };
  const viewport = { width: 500, height: 400 };

  it('centers tooltips and aligns popovers to logical start', () => {
    expect(
      anchoredFloatingPosition({
        anchor,
        surface,
        viewport,
        placement: 'top',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 80, top: 32 });
    expect(
      anchoredFloatingPosition({
        anchor,
        surface,
        viewport,
        placement: 'bottom-start',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 100, top: 148 });
  });

  it('flips logical alignment for RTL and clamps to viewport inset', () => {
    expect(
      anchoredFloatingPosition({
        anchor: { ...anchor, left: 2, right: 82 },
        surface,
        viewport,
        placement: 'bottom-start',
        direction: 'rtl',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 8, top: 148 });
    expect(
      anchoredFloatingPosition({
        anchor: { ...anchor, top: 370, bottom: 410 },
        surface,
        viewport,
        placement: 'bottom',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 80, top: 302 });
    expect(
      anchoredFloatingPosition({
        anchor,
        surface,
        viewport,
        placement: 'bottom-end',
        direction: 'rtl',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 100, top: 148 });
  });

  it('flips to the opposite side before clamping over its anchor', () => {
    expect(
      anchoredFloatingPosition({
        anchor: { ...anchor, top: 4, bottom: 44 },
        surface,
        viewport,
        placement: 'top',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 80, top: 52 });
    expect(
      anchoredFloatingPosition({
        anchor: { ...anchor, left: 4, right: 84 },
        surface,
        viewport,
        placement: 'start',
        direction: 'ltr',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 92, top: 90 });
    expect(
      anchoredFloatingPosition({
        anchor: { ...anchor, left: 416, right: 496 },
        surface,
        viewport,
        placement: 'start',
        direction: 'rtl',
        gap: 8,
        inset: 8,
      }),
    ).toEqual({ left: 288, top: 90 });
  });
});

describe('context-menu floating geometry', () => {
  const viewport = { width: 500, height: 400 };

  it('treats a pointer as logical top-start and only clamps it to the safe inset', () => {
    expect(
      pointFloatingPosition({
        point: { x: 490, y: 390 },
        surface: { width: 120, height: 60 },
        viewport,
        direction: 'ltr',
        inset: 8,
      }),
    ).toEqual({ left: 372, top: 332 });

    expect(
      pointFloatingPosition({
        point: { x: 200, y: 100 },
        surface: { width: 120, height: 60 },
        viewport,
        direction: 'rtl',
        inset: 8,
      }),
    ).toEqual({ left: 80, top: 100 });
  });

  it('aligns a button menu to logical bottom-end and flips it above the trigger', () => {
    expect(
      anchoredFloatingLayout({
        anchor: {
          top: 350,
          right: 380,
          bottom: 390,
          left: 300,
          width: 80,
          height: 40,
        },
        surface: { width: 120, height: 80 },
        viewport,
        placement: 'bottom-end',
        direction: 'ltr',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 260, top: 266, side: 'top', width: 120 });

    expect(
      anchoredFloatingLayout({
        anchor: {
          top: 100,
          right: 380,
          bottom: 140,
          left: 300,
          width: 80,
          height: 40,
        },
        surface: { width: 120, height: 80 },
        viewport,
        placement: 'bottom-end',
        direction: 'rtl',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 300, top: 144, side: 'bottom', width: 120 });
  });

  it('opens a submenu toward logical inline-end and mirrors when that side cannot fit', () => {
    const surface = { width: 120, height: 64 };

    expect(
      anchoredFloatingLayout({
        anchor: {
          left: 100,
          right: 320,
          top: 140,
          bottom: 172,
          width: 220,
          height: 32,
        },
        surface,
        viewport: { width: 800, height: 600 },
        placement: 'end-start',
        direction: 'ltr',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 324, top: 140, side: 'right', width: 120 });

    expect(
      anchoredFloatingLayout({
        anchor: {
          left: 260,
          right: 480,
          top: 160,
          bottom: 192,
          width: 220,
          height: 32,
        },
        surface,
        viewport,
        placement: 'end-start',
        direction: 'ltr',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 136, top: 160, side: 'left', width: 120 });

    expect(
      anchoredFloatingLayout({
        anchor: {
          left: 300,
          right: 520,
          top: 140,
          bottom: 172,
          width: 220,
          height: 32,
        },
        surface,
        viewport: { width: 800, height: 600 },
        placement: 'end-start',
        direction: 'rtl',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 176, top: 140, side: 'left', width: 120 });
  });

  it('chooses the wider submenu side and shrinks only when neither side fits', () => {
    expect(
      anchoredFloatingLayout({
        anchor: {
          left: 180,
          right: 400,
          top: 140,
          bottom: 172,
          width: 220,
          height: 32,
        },
        surface: { width: 240, height: 64 },
        viewport,
        placement: 'end-start',
        direction: 'ltr',
        gap: 4,
        inset: 8,
      }),
    ).toEqual({ left: 8, top: 140, side: 'left', width: 168 });
  });
});
