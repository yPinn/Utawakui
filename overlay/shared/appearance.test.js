import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_LOOK_PRESETS,
  outputArtworkGradeMatrix,
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

function mixHex(left, right, amount) {
  const channels = (hex) =>
    hex.match(/[0-9a-f]{2}/giu).map((channel) => Number.parseInt(channel, 16));
  const leftChannels = channels(left);
  const rightChannels = channels(right);
  return `#${leftChannels
    .map((channel, index) =>
      Math.round(channel + (rightChannels[index] - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const gradedLooks = Object.entries(OUTPUT_LOOK_PRESETS).filter(
  ([, { colors }]) => colors,
);

describe('overlay appearance', () => {
  const localFont = {
    source: 'local',
    family: 'Noto Sans CJK TC',
    postscriptName: 'NotoSansCJKtc-Regular',
    style: 'Regular',
  };

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
        { fontFamily: 'unrecognized-font', positionAnchor: 'center' },
        { templateId: 'ornate-vertical' },
      ),
    ).toMatchObject({
      fontFamily: 'ornate',
      positionAnchor: 'top-right',
    });
  });

  it('applies distinct Chalkboard ink and guide colors to Browser Source', () => {
    const setProperty = vi.fn();
    const document = {
      documentElement: { dataset: {}, style: { setProperty } },
    };
    applyOverlayAppearance(document, {
      templateId: 'chalkboard-vertical',
      settings: { textColor: '#ffeeaa', chalkboardRuleColor: '#aabbcc' },
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      '#ffeeaa',
    );
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-chalkboard-rule-color',
      '#aabbcc',
    );

    applyOverlayAppearance(document, {
      templateId: 'centered-vertical',
      settings: { textColor: '#bbddee', contrastStyle: 'strong-outline' },
    });
    expect(setProperty).toHaveBeenCalledWith(
      '--ovl-user-text-color',
      '#bbddee',
    );
    expect(document.documentElement.dataset.ovlContrast).toBe('strong-outline');
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
        lookAmount: 65,
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
      ovlReceiptDirection: 'down',
      ovlReceiptReview: 'on',
      ovlReceiptReviewInterval: '15',
      ovlContrast: 'balanced',
      ovlTextShadow: 'standard',
      ovlSectionAccent: 'off',
      ovlDensity: 'normal',
      ovlContentWidth: 'standard',
      ovlPosition: 'bottom-right',
      ovlTemplate: 'ornate-vertical',
    });
    expect(setProperty).toHaveBeenCalledWith('--ovl-look-amount', '65%');
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

  it.each([
    'live-stage',
    'chalkboard-vertical',
    'ribbon-setlist',
    'cover-player',
  ])(
    'projects a validated local font and clears it when restoring a preset in %s',
    (templateId) => {
      const setProperty = vi.fn();
      const removeProperty = vi.fn();
      const document = {
        documentElement: {
          dataset: {},
          style: { setProperty, removeProperty },
        },
      };

      applyOverlayAppearance(document, {
        templateId,
        settings: { fontFamily: localFont },
      });

      expect(document.documentElement.dataset.ovlFont).toBe('local');
      expect(setProperty).toHaveBeenCalledWith(
        '--ovl-user-local-font-family',
        '"Noto Sans CJK TC"',
      );
      expect(setProperty).toHaveBeenCalledWith(
        '--ovl-local-font-prefix',
        '"Noto Sans CJK TC",',
      );

      setProperty.mockClear();
      applyOverlayAppearance(document, {
        templateId,
        settings: { fontFamily: 'sans' },
      });
      expect(removeProperty).toHaveBeenCalledWith(
        '--ovl-user-local-font-family',
      );
      expect(removeProperty).toHaveBeenCalledWith('--ovl-local-font-prefix');
    },
  );

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

  it('defines every semantic Look and bounded layout/readability projection', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./appearance.css', import.meta.url)),
      'utf8',
    );

    const roles = [...new Set(css.match(/--ovl-look-color-[a-z-]+/gu))].sort();
    for (const [, { colors }] of gradedLooks) {
      expect(
        Object.keys(colors)
          .map((role) => `--ovl-look-color-${role}`)
          .sort(),
      ).toEqual(roles);
    }
    expect(css).toContain('--ovl-look-amount: 100%');
    expect(css).toContain('var(--ovl-look-amount)');
    expect(css).toContain("[data-ovl-contrast='clean']");
    expect(css).toContain("[data-ovl-contrast='strong-outline']");
    expect(css).toContain("[data-ovl-density='compact']");
    expect(css).toContain("[data-ovl-density='relaxed']");
    expect(css).toContain("[data-ovl-content-width='narrow']");
    expect(css).toContain("[data-ovl-content-width='wide']");
    expect(css).toContain("[data-ovl-font='local']");
    expect(css).toContain('var(--ovl-user-local-font-family');

    const lyricsCss = readFileSync(
      fileURLToPath(new URL('../lyrics/lyrics.css', import.meta.url)),
      'utf8',
    );
    expect(lyricsCss).toContain('var(--ovl-user-panel-gap)');
    expect(lyricsCss).toContain('var(--ovl-user-current-stroke-width)');
    expect(css).toContain(":root[data-ovl-content-width='wide']");
    expect(css).toContain(":root[data-ovl-density='compact']");
  });

  it('keeps preset text roles readable against each palette ink role', () => {
    for (const [lookId, { colors }] of gradedLooks) {
      for (const role of ['text-primary', 'text-secondary', 'current']) {
        expect(
          contrastRatio(colors[role], colors.ink),
          `${lookId}.${role}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps text roles readable through intermediate Look Amount values', () => {
    const fallbackCss = readFileSync(
      fileURLToPath(new URL('./fallback.css', import.meta.url)),
      'utf8',
    );
    const original = {
      ink: fallbackCss.match(
        /--ovl-primitive-color-ink:\s*(#[0-9a-f]{6})/iu,
      )[1],
      'text-primary': fallbackCss.match(
        /--ovl-primitive-color-paper:\s*(#[0-9a-f]{6})/iu,
      )[1],
      'text-secondary': fallbackCss.match(
        /--ovl-primitive-color-mist:\s*(#[0-9a-f]{6})/iu,
      )[1],
      current: fallbackCss.match(
        /--ovl-primitive-color-coral:\s*(#[0-9a-f]{6})/iu,
      )[1],
    };

    for (const [lookId, { colors }] of gradedLooks) {
      for (let step = 1; step < 20; step += 1) {
        const amount = step / 20;
        const ink = mixHex(original.ink, colors.ink, amount);
        for (const role of ['text-primary', 'text-secondary', 'current']) {
          const text = mixHex(original[role], colors[role], amount);
          expect(
            contrastRatio(text, ink),
            `${lookId}.${role}.${amount}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('applies artwork grading only where the image filter exists and clears it at zero strength', () => {
    const setAttribute = vi.fn();
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    const documentElement = { dataset: {}, style };
    const document = {
      documentElement,
      getElementById: vi.fn(() => ({ setAttribute })),
    };
    const slot = {
      templateId: 'ticket-stub',
      settings: { paletteId: 'monochrome', lookAmount: 50 },
    };
    applyOverlayAppearance(document, slot);
    expect(documentElement.dataset.ovlArtworkGrade).toBe('on');
    expect(setAttribute).toHaveBeenCalledWith(
      'values',
      outputArtworkGradeMatrix('monochrome', 50).join(' '),
    );

    applyOverlayAppearance(document, {
      ...slot,
      settings: { ...slot.settings, lookAmount: 0 },
    });
    expect(documentElement.dataset.ovlPalette).toBe('original');
    expect(documentElement.dataset.ovlArtworkGrade).toBeUndefined();
    expect(style.removeProperty).toHaveBeenCalledWith('--ovl-look-color-ink');
  });

  it('scales fixed look grain and user-controlled lyrics grain independently', () => {
    const element = (tag) => ({
      tag,
      attributes: {},
      nodes: [],
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
      append(...nodes) {
        this.nodes.push(...nodes);
      },
    });
    const properties = new Map();
    const document = {
      documentElement: {
        dataset: {},
        style: {
          setProperty: (key, value) => properties.set(key, value),
          removeProperty: (key) => properties.delete(key),
        },
      },
      body: element('body'),
      createElementNS: (_, tag) => element(tag),
    };
    const settings = {
      paletteId: 'cool-film',
      lookAmount: 50,
      filmGrainAmount: 60,
      filmGrainSize: 'coarse',
    };
    const apply = (overrides, templateId = 'karaoke-stack') =>
      applyOverlayAppearance(document, {
        templateId,
        settings: { ...settings, ...overrides },
      });
    const filters = () => properties.get('--ovl-grain-filters');
    const strength = (node) => Number(node.attributes.values.split(' ')[0]) * 3;
    apply({});
    expect(filters()).toBe(
      "url('#output-look-grain') url('#output-film-grain')",
    );
    const [look, material] = document.body.nodes[0].nodes;
    const [lookNoise, lookLevels] = look.nodes;
    const [materialNoise, materialLevels] = material.nodes;
    expect(lookNoise.attributes.baseFrequency).toBe('0.72');
    expect(materialNoise.attributes.baseFrequency).toBe('0.24');
    expect(lookNoise.attributes.seed).not.toBe(materialNoise.attributes.seed);
    expect(strength(lookLevels)).toBeCloseTo(0.14);
    expect(strength(materialLevels)).toBeCloseTo(0.6);
    for (const filter of [look, material]) {
      expect(filter.nodes.at(-1).attributes).toMatchObject({
        in2: 'SourceAlpha',
        operator: 'in',
      });
    }

    apply({ lookAmount: 100 });
    expect(strength(lookLevels)).toBeCloseTo(0.28);
    expect(strength(materialLevels)).toBeCloseTo(0.6);
    apply({ lookAmount: 100, filmGrainAmount: 25, filmGrainSize: 'medium' });
    expect(strength(lookLevels)).toBeCloseTo(0.28);
    expect(strength(materialLevels)).toBeCloseTo(0.25);
    expect(materialNoise.attributes.baseFrequency).toBe('0.46');
    apply({ lookAmount: 0 });
    expect(filters()).toBe("url('#output-film-grain')");
    apply({ filmGrainAmount: 0 });
    expect(filters()).toBe("url('#output-look-grain')");
    apply({}, 'queue-board');
    expect(filters()).toBe(
      "url('#output-look-grain') url('#output-film-grain')",
    );
    apply({ paletteId: 'original', filmGrainAmount: 0 }, 'queue-board');
    expect(filters()).toBeUndefined();
    expect(document.documentElement.dataset.ovlGrain).toBeUndefined();

    for (const templateId of [
      'centered-vertical',
      'chalkboard-vertical',
      'fisheye-lens',
      'receipt-setlist',
    ]) {
      apply({ paletteId: 'warm', filmGrainAmount: 0 }, templateId);
      expect(document.documentElement.dataset.ovlCompositionGrade).toBe('on');
      expect(filters()).toBeUndefined();
      apply({ lookAmount: 0, filmGrainAmount: 0 }, templateId);
      expect(
        document.documentElement.dataset.ovlCompositionGrade,
      ).toBeUndefined();
    }
  });
});

describe('overlay element appearance', () => {
  function fakeDocument() {
    const properties = new Map();
    return {
      properties,
      documentElement: {
        dataset: {},
        style: {
          setProperty: (name, value) => properties.set(name, value),
          removeProperty: (name) => properties.delete(name),
        },
      },
    };
  }

  it('projects declared element values and clears them for other templates', () => {
    const document = fakeDocument();
    applyOverlayAppearance(document, {
      templateId: 'cover-player',
      settings: {
        'element.title.fontWeight': 'bold',
        'element.title.fontSizeScale': 110,
        'element.artist.visible': 'hidden',
      },
    });

    expect(document.properties.get('--ovl-el-title-font-weight')).toBe('700');
    expect(document.properties.get('--ovl-el-title-size-scale')).toBe('1.1');
    expect(document.properties.has('--ovl-el-artist-size-scale')).toBe(false);
    expect(document.documentElement.dataset.ovlElArtistVisible).toBe('hidden');
    expect(
      document.documentElement.dataset.ovlElProgressVisible,
    ).toBeUndefined();

    applyOverlayAppearance(document, {
      templateId: 'art-card',
      settings: { 'element.artist.visible': 'hidden' },
    });
    expect(
      [...document.properties.keys()].filter((name) =>
        name.startsWith('--ovl-el-'),
      ),
    ).toEqual([]);
    expect(document.documentElement.dataset.ovlElArtistVisible).toBeUndefined();
  });

  it('reads element values only from Cover Player rules with a text floor', () => {
    const artworkCss = readFileSync(
      fileURLToPath(new URL('../now-playing/artwork.css', import.meta.url)),
      'utf8',
    );
    const baseCss = readFileSync(
      fileURLToPath(new URL('./base.css', import.meta.url)),
      'utf8',
    );

    expect(baseCss).toMatch(
      /@layer ovl-constraints \{\s*:root \{[^}]*--ovl-text-min-size:/u,
    );
    for (const id of ['title', 'artist']) {
      expect(artworkCss).toContain(`var(--ovl-el-${id}-size-scale, 1)`);
      expect(artworkCss).toContain(`var(--ovl-el-${id}-font-weight,`);
    }
    for (const id of ['artist', 'progress', 'transport']) {
      expect(artworkCss).toContain(
        `:root[data-ovl-template='cover-player'][data-ovl-el-${id}-visible='hidden']`,
      );
    }
    expect(
      artworkCss.match(/--ovl-el-[a-z]+-(?:size-scale|font-weight)/gu).length,
    ).toBe(4);
  });
});
