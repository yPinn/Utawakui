import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  outputAppearanceOptionIds,
} from '../../shared/outputAppearance.mjs';
import {
  applyOverlayAppearance,
  normalizeOverlayAppearance,
  OVERLAY_APPEARANCE_DEFAULTS,
  overlayAppearanceOptionIds,
} from './appearance.mjs';

function channelToLinear(value) {
  const channel = Number.parseInt(value, 16) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/giu).map(channelToLinear);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(left, right) {
  const light = Math.max(luminance(left), luminance(right));
  const dark = Math.min(luminance(left), luminance(right));
  return (light + 0.05) / (dark + 0.05);
}

function paletteRole(css, paletteId, role) {
  const block = css.match(
    new RegExp(`\\[data-ovl-palette='${paletteId}'\\]\\s*\\{([^}]+)\\}`, 'u'),
  )?.[1];
  return block?.match(
    new RegExp(`--ovl-color-${role}:\\s*(#[0-9a-f]{6})`, 'iu'),
  )?.[1];
}

describe('overlay appearance', () => {
  it('keeps browser mappings aligned with renderer option ids', () => {
    expect(overlayAppearanceOptionIds()).toEqual(outputAppearanceOptionIds());
  });

  it('keeps browser fallbacks aligned with the shared appearance contract', () => {
    expect(OVERLAY_APPEARANCE_DEFAULTS).toEqual(OUTPUT_APPEARANCE_DEFAULTS);
  });

  it('falls back from unsupported values instead of exposing raw CSS', () => {
    expect(
      normalizeOverlayAppearance({
        fontFamily: 'url(https://example.com/font)',
        fontScale: 'large',
        alignment: 'fixed; inset: 0',
        textColor: 'var(--private-value)',
        positionOffsetX: 500,
      }),
    ).toEqual({
      ...OUTPUT_APPEARANCE_DEFAULTS,
      fontScale: 'large',
      positionOffsetX: 12,
    });
  });

  it('uses template-specific fallbacks for fixed-identity controls', () => {
    expect(
      normalizeOverlayAppearance(
        { fontFamily: 'serif', positionAnchor: 'center' },
        { templateId: 'ornate-vertical' },
      ),
    ).toMatchObject({
      fontFamily: 'ornate',
      positionAnchor: 'center-right',
    });
  });

  it('applies only active-template ids and normalized CSS values to the root', () => {
    const setProperty = vi.fn();
    const document = {
      documentElement: { dataset: {}, style: { setProperty } },
    };
    applyOverlayAppearance(document, {
      templateId: 'ornate-vertical',
      settings: {
        paletteId: 'cool',
        fontFamily: 'antique',
        fontScale: 'large',
        fontWeight: 'bold',
        alignment: 'left',
        surface: 'soft',
        kineticMaterial: 'cycle',
        kineticArrangement: 'subtle-offset',
        textColor: '#F6E5D3',
        accentColor: 'linear-gradient(red, blue)',
        positionAnchor: 'bottom-right',
        positionOffsetX: 7,
        positionOffsetY: -9,
      },
    });

    expect(document.documentElement.dataset).toEqual({
      ovlPalette: 'cool',
      ovlFont: 'antique',
      ovlScale: 'large',
      ovlWeight: 'semibold',
      ovlAlign: 'left',
      ovlSurface: 'transparent',
      ovlFurigana: 'auto',
      ovlKineticMaterial: 'candy-rim',
      ovlKineticArrangement: 'straight',
      ovlContrast: 'balanced',
      ovlDensity: 'normal',
      ovlContentWidth: 'standard',
      ovlPosition: 'bottom-right',
      ovlTemplate: 'ornate-vertical',
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      '#f6e5d3',
    );
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-accent-color',
      'var(--ovl-color-ornate-echo)',
    );
    expect(setProperty).toHaveBeenCalledWith('--ovl-user-position-x', '7%');
    expect(setProperty).toHaveBeenCalledWith('--ovl-user-position-y', '-9%');
  });

  it('lets an Ornate palette color the template defaults without overriding custom colors', () => {
    const setProperty = vi.fn();
    const document = {
      documentElement: { dataset: {}, style: { setProperty } },
    };

    applyOverlayAppearance(document, {
      templateId: 'ornate-vertical',
      settings: { paletteId: 'warm' },
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      'var(--ovl-color-ornate-paper)',
    );
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-accent-color',
      'var(--ovl-color-ornate-echo)',
    );

    setProperty.mockClear();
    applyOverlayAppearance(document, {
      templateId: 'ornate-vertical',
      settings: {
        paletteId: 'warm',
        textColor: '#123456',
        accentColor: '#abcdef',
      },
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      '#123456',
    );
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-accent-color',
      '#abcdef',
    );
  });

  it('defines every semantic palette and bounded layout/readability projection', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./appearance.css', import.meta.url)),
      'utf8',
    );

    for (const paletteId of ['warm', 'cool', 'monochrome', 'high-contrast']) {
      expect(css).toContain(`[data-ovl-palette='${paletteId}']`);
    }
    expect(css).toContain('--ovl-color-ktv-fill-unsung:');
    expect(css).toContain('--ovl-color-kinetic-yellow:');
    expect(css).toContain("[data-ovl-contrast='clean']");
    expect(css).toContain("[data-ovl-contrast='strong-outline']");
    expect(css).toContain("[data-ovl-density='compact']");
    expect(css).toContain("[data-ovl-density='relaxed']");
    expect(css).toContain("[data-ovl-content-width='narrow']");
    expect(css).toContain("[data-ovl-content-width='wide']");

    const lyricsCss = readFileSync(
      fileURLToPath(new URL('../lyrics/lyrics.css', import.meta.url)),
      'utf8',
    );
    expect(lyricsCss).toContain('var(--ovl-user-panel-gap)');
    expect(lyricsCss).toContain('var(--ovl-user-current-stroke-width)');
    expect(lyricsCss).toContain(
      "[data-ovl-template='quiet-caption'][data-ovl-content-width='wide']",
    );
    expect(lyricsCss).toContain(
      "[data-ovl-template='quiet-caption'][data-ovl-density='compact']",
    );
  });

  it('keeps preset text roles readable against each palette ink role', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./appearance.css', import.meta.url)),
      'utf8',
    );

    for (const paletteId of ['warm', 'cool', 'monochrome', 'high-contrast']) {
      const ink = paletteRole(css, paletteId, 'ink');
      for (const role of ['text-primary', 'text-secondary', 'current']) {
        expect(
          contrastRatio(paletteRole(css, paletteId, role), ink),
          `${paletteId}.${role}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
