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

  it('applies only normalized ids and CSS values to the root', () => {
    const setProperty = vi.fn();
    const document = {
      documentElement: { dataset: {}, style: { setProperty } },
    };
    applyOverlayAppearance(document, {
      templateId: 'ornate-vertical',
      settings: {
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
      ovlFont: 'antique',
      ovlScale: 'large',
      ovlWeight: 'bold',
      ovlAlign: 'left',
      ovlSurface: 'soft',
      ovlFurigana: 'auto',
      ovlKineticMaterial: 'cycle',
      ovlKineticArrangement: 'subtle-offset',
      ovlPosition: 'bottom-right',
      ovlTemplate: 'ornate-vertical',
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      '#f6e5d3',
    );
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-accent-color',
      '#ffffff',
    );
    expect(setProperty).toHaveBeenCalledWith('--ovl-user-position-x', '7%');
    expect(setProperty).toHaveBeenCalledWith('--ovl-user-position-y', '-9%');
  });
});
