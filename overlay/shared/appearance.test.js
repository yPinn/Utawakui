import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyOverlayAppearance,
  normalizeOverlayAppearance,
  OVERLAY_APPEARANCE_DEFAULTS,
  overlayAppearanceOptionIds,
} from './appearance.mjs';

const sharedValues = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../shared/outputAppearanceValues.json', import.meta.url),
    ),
    'utf8',
  ),
);

describe('overlay appearance', () => {
  it('keeps browser mappings aligned with renderer option ids', () => {
    const optionIds = overlayAppearanceOptionIds();
    for (const [key, options] of Object.entries(
      sharedValues.appearanceOptions,
    )) {
      expect(optionIds[key]).toEqual(options.map((option) => option.id));
    }
  });

  it('keeps browser fallbacks aligned with the shared appearance contract', () => {
    expect(OVERLAY_APPEARANCE_DEFAULTS).toEqual(sharedValues.defaultSettings);
  });

  it('falls back from unsupported values instead of exposing raw CSS', () => {
    expect(
      normalizeOverlayAppearance({
        fontFamily: 'url(https://example.com/font)',
        fontScale: 'large',
        alignment: 'fixed; inset: 0',
      }),
    ).toEqual({
      fontFamily: 'sans',
      fontScale: 'large',
      fontWeight: 'semibold',
      alignment: 'left',
      surface: 'transparent',
    });
  });

  it('applies only normalized ids and the selected template to the root', () => {
    const document = { documentElement: { dataset: {} } };
    applyOverlayAppearance(document, {
      templateId: 'karaoke-stack',
      settings: {
        fontFamily: 'serif',
        fontScale: 'large',
        fontWeight: 'bold',
        alignment: 'left',
        surface: 'soft',
      },
    });

    expect(document.documentElement.dataset).toEqual({
      ovlFont: 'serif',
      ovlScale: 'large',
      ovlWeight: 'bold',
      ovlAlign: 'left',
      ovlSurface: 'soft',
      ovlTemplate: 'karaoke-stack',
    });
  });
});
