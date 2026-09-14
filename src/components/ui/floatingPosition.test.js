import { describe, expect, it, vi } from 'vitest';
import {
  anchoredFloatingPosition,
  customLengthPixels,
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
