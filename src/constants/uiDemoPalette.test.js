import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FOLDER_REFERENCE_SWATCHES,
  STATUS_COLOR_SWATCHES,
  STATUS_ROLE_SAMPLES,
} from './uiDemoPalette';

const componentSource = readFileSync(
  new URL('../components/demo/DemoFoundations.vue', import.meta.url),
  'utf8',
);
const statusPaletteSource = readFileSync(
  new URL('../components/demo/DemoStatusPalette.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

const folderTabMix = componentSource.match(
  /\.demo-folder-swatch__tab[\s\S]*?color-mix\([\s\S]*?var\((--[^)]+)\) (\d+)%/,
);
if (!folderTabMix) throw new Error('Expected the Folder tab token mix');
const folderTabOverlayToken = folderTabMix[1];
const folderTabAmount = Number(folderTabMix[2]) / 100;

function resolveThemeValues(token) {
  const semanticMatches = [
    ...tokenSource.matchAll(
      new RegExp(`${token}:\\s*var\\((--[^)]+)\\);`, 'g'),
    ),
  ];
  if (semanticMatches.length !== 2) {
    throw new Error(`Expected dark and light mappings for ${token}`);
  }

  return Object.fromEntries(
    ['dark', 'light'].map((theme, index) => {
      const primitiveToken = semanticMatches[index][1];
      const primitiveValue = tokenSource.match(
        new RegExp(`${primitiveToken}:\\s*(#[\\da-f]{6});`, 'i'),
      )?.[1];
      if (!primitiveValue) {
        throw new Error(`Expected a hex value for ${primitiveToken}`);
      }
      return [theme, primitiveValue.toUpperCase()];
    }),
  );
}

function resolvePrimitiveValue(token) {
  const value = tokenSource.match(
    new RegExp(`${token}:\\s*(#[\\da-f]{6});`, 'i'),
  )?.[1];
  if (!value) throw new Error(`Expected a hex value for ${token}`);
  return value.toUpperCase();
}

function channels(hex) {
  return hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16));
}

function mix(foreground, background, amount) {
  const front = channels(foreground);
  const back = channels(background);
  return front.map((value, index) =>
    Math.round(value * amount + back[index] * (1 - amount)),
  );
}

function luminance(rgb) {
  const linear = rgb
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(
    Array.isArray(foreground) ? foreground : channels(foreground),
  );
  const backgroundLuminance = luminance(
    Array.isArray(background) ? background : channels(background),
  );
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('F9 palette review contrast', () => {
  it('keeps folder copy and darkened tabs at WCAG AA contrast', () => {
    const overlay = resolvePrimitiveValue(folderTabOverlayToken);
    for (const swatch of FOLDER_REFERENCE_SWATCHES) {
      expect(contrast(swatch.ink, swatch.value)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(swatch.ink, mix(overlay, swatch.value, folderTabAmount)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('renders the primary status specimens at full strength', () => {
    expect(statusPaletteSource).toMatch(
      /\.demo-status-swatch__color[\s\S]*?background: var\(--demo-status-color\)/,
    );
    expect(statusPaletteSource).not.toContain('demo-status-swatch__marker');
    expect(statusPaletteSource).not.toContain('--demo-status-soft: color-mix');
  });

  it('keeps live and danger identical until the owner chooses whether to split them', () => {
    const live = STATUS_COLOR_SWATCHES.find(
      (swatch) => swatch.label === '即時',
    );
    const danger = STATUS_COLOR_SWATCHES.find(
      (swatch) => swatch.label === '危險',
    );

    expect({ dark: live.dark, light: live.light }).toEqual({
      dark: danger.dark,
      light: danger.light,
    });
  });

  it('keeps displayed status values mapped to the actual candidate tokens', () => {
    for (const swatch of STATUS_COLOR_SWATCHES) {
      expect(resolveThemeValues(swatch.token)).toEqual({
        dark: swatch.dark,
        light: swatch.light,
      });
    }
  });

  it('keeps current on the accent role while live and danger use distinct semantics', () => {
    expect(STATUS_ROLE_SAMPLES).toEqual([
      expect.objectContaining({ key: 'current', token: '--ui-color-accent' }),
      expect.objectContaining({ key: 'live', token: '--ui-color-live' }),
      expect.objectContaining({ key: 'danger', token: '--ui-color-danger' }),
    ]);
    expect(new Set(STATUS_ROLE_SAMPLES.map((sample) => sample.cue)).size).toBe(
      STATUS_ROLE_SAMPLES.length,
    );
  });
});
