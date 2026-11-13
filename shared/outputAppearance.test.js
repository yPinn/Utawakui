import { describe, expect, it } from 'vitest';
import {
  OUTPUT_APPEARANCE_FIELDS,
  OUTPUT_APPEARANCE_GROUPS,
  OUTPUT_PROPERTY_FAMILIES,
  OUTPUT_PROPERTY_TIERS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  carryOutputAppearanceToTemplate,
  normalizeOutputAppearance,
  normalizeOutputElementAppearance,
  outputAppearanceFieldsForTemplate,
  outputElementFontWeight,
  outputElementTargetsForTemplate,
  sanitizeOutputAppearanceSetting,
} from './outputAppearance.mjs';

describe('output appearance schema', () => {
  it('keeps the vertical defaults and accepts independent text, contrast and rule choices', () => {
    const centered = { templateId: 'centered-vertical' };
    const chalkboard = { templateId: 'chalkboard-vertical' };
    const defaults = { textColor: '#fffdfa' };
    expect(normalizeOutputAppearance({}, centered)).toMatchObject({
      ...defaults,
      contrastStyle: 'balanced',
    });
    expect(normalizeOutputAppearance({}, chalkboard)).toMatchObject({
      ...defaults,
      chalkboardRuleColor: '#fffdfa',
    });
    expect(
      normalizeOutputAppearance(
        { textColor: '#abcdef', contrastStyle: 'clean' },
        centered,
      ),
    ).toMatchObject({
      textColor: '#abcdef',
      contrastStyle: 'clean',
    });
    expect(
      normalizeOutputAppearance(
        { textColor: '#abcdef', chalkboardRuleColor: '#123456' },
        chalkboard,
      ),
    ).toMatchObject({
      textColor: '#abcdef',
      chalkboardRuleColor: '#123456',
    });
    expect(
      outputAppearanceFieldsForTemplate(centered.templateId).map(
        ({ key }) => key,
      ),
    ).not.toContain('chalkboardRuleColor');
    expect(
      normalizeOutputAppearance({ chalkboardRuleColor: '#123456' }, centered)
        .chalkboardRuleColor,
    ).toBe('#fffdfa');
  });

  it('defaults Centered Vertical to small and keeps all three size choices', () => {
    const templateId = 'centered-vertical';
    const field = outputAppearanceFieldsForTemplate(templateId).find(
      ({ key }) => key === 'fontScale',
    );
    expect(field.defaultValue).toBe('small');
    expect(field.options.map(({ id }) => id)).toEqual([
      'small',
      'medium',
      'large',
    ]);
    expect(normalizeOutputAppearance({}, { templateId }).fontScale).toBe(
      'small',
    );
    expect(
      normalizeOutputAppearance({ fontScale: 'medium' }, { templateId })
        .fontScale,
    ).toBe('medium');
  });
  it('lets Centered Vertical choose a bundled font or follow the lyric language', () => {
    const templateId = 'centered-vertical';
    const field = outputAppearanceFieldsForTemplate(templateId).find(
      ({ key }) => key === 'fontFamily',
    );
    const options = [
      'lyrics-auto',
      'chen-yu-luo-yan',
      'klee-one',
      'open-huninn',
    ];
    expect(field.defaultValue).toBe('lyrics-auto');
    expect(field.options.map(({ id }) => id)).toEqual(options);
    for (const fontFamily of options) {
      expect(
        normalizeOutputAppearance({ fontFamily }, { templateId }).fontFamily,
      ).toBe(fontFamily);
    }
    expect(
      normalizeOutputAppearance({ fontFamily: 'sans' }, { templateId })
        .fontFamily,
    ).toBe('lyrics-auto');
  });
  const localFont = {
    source: 'local',
    family: 'Noto Sans CJK TC',
    postscriptName: 'NotoSansCJKtc-Regular',
    style: 'Regular',
  };

  it('defaults Chalkboard to the left third and preserves the saved right third', () => {
    const options = { templateId: 'chalkboard-vertical' };
    expect(normalizeOutputAppearance({}, options).positionAnchor).toBe(
      'center-left',
    );
    expect(
      normalizeOutputAppearance({ positionAnchor: 'center' }, options)
        .positionAnchor,
    ).toBe('center-left');
    expect(
      normalizeOutputAppearance({ positionAnchor: 'center-right' }, options)
        .positionAnchor,
    ).toBe('center-right');
  });

  it('defines the inspector hierarchy once in common-to-specific order', () => {
    expect(OUTPUT_APPEARANCE_GROUPS).toEqual([
      { id: 'color-treatment', order: 10 },
      { id: 'custom-color', order: 20 },
      { id: 'typography', order: 30 },
      { id: 'readability', order: 40 },
      { id: 'surface', order: 50 },
      { id: 'layout', order: 60 },
      { id: 'motion', order: 70 },
      { id: 'content', order: 80 },
    ]);
  });

  it('declares family, tier, reflow and template scope for every field', () => {
    for (const field of OUTPUT_APPEARANCE_FIELDS) {
      expect(OUTPUT_PROPERTY_FAMILIES).toContain(field.family);
      expect(OUTPUT_PROPERTY_TIERS).toContain(field.tier);
      expect(typeof field.reflow).toBe('boolean');
      expect(field.scope).toBe('template');
    }
    expect(
      OUTPUT_APPEARANCE_FIELDS.filter(({ tier }) => tier === 'advanced').map(
        ({ key }) => key,
      ),
    ).toEqual([
      'textColor',
      'accentColor',
      'chalkboardRuleColor',
      'positionOffsetX',
      'positionOffsetY',
    ]);
    expect(
      Object.fromEntries(
        OUTPUT_APPEARANCE_FIELDS.map(({ key, family }) => [key, family]),
      ),
    ).toMatchObject({
      paletteId: 'document',
      fontScale: 'document',
      textColor: 'swatch',
      fontFamily: 'character',
      kineticMaterial: 'legibility',
      surface: 'fill',
      receiptDirection: 'layout',
      receiptReview: 'motion',
    });
  });

  it('has no configuration for the retired now-next template', () => {
    expect(outputAppearanceFieldsForTemplate('now-next')).toEqual(
      outputAppearanceFieldsForTemplate('retired-unknown-template'),
    );
  });

  it('exposes the bounded safe-appearance fields for Ornate Vertical', () => {
    const fields = outputAppearanceFieldsForTemplate('ornate-vertical');

    expect(fields.map((field) => field.key)).toEqual([
      'paletteId',
      'lookAmount',
      'textColor',
      'accentColor',
      'fontFamily',
      'fontScale',
      'textShadow',
      'sectionAccent',
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
    ]);
    expect(fields.find((field) => field.key === 'fontFamily')).toMatchObject({
      control: 'select',
      defaultValue: 'ornate',
      options: [{ id: 'ornate' }, { id: 'antique' }],
    });
    expect(fields.find((field) => field.key === 'fontScale')).toMatchObject({
      control: 'select',
      editor: 'font-scale',
    });
    expect(
      fields.find((field) => field.key === 'positionAnchor'),
    ).toMatchObject({
      control: 'select',
      editor: 'position-grid',
    });
    expect(fields.find((field) => field.key === 'textColor')).toMatchObject({
      control: 'color',
      defaultValue: '#fff8ec',
    });
    expect(fields.find((field) => field.key === 'lookAmount')).toMatchObject({
      control: 'range',
      defaultValue: 100,
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
    });
    expect(
      fields.find((field) => field.key === 'positionOffsetX'),
    ).toMatchObject({
      control: 'range',
      defaultValue: 0,
      min: -12,
      max: 12,
      step: 1,
      unit: '%',
    });
  });

  it('uses the standard shadow for legacy settings and honors off only for Ornate Vertical', () => {
    const options = { templateId: 'ornate-vertical' };
    expect(normalizeOutputAppearance({}, options).textShadow).toBe('standard');
    expect(
      normalizeOutputAppearance({ textShadow: 'off' }, options).textShadow,
    ).toBe('off');
    expect(
      normalizeOutputAppearance({ textShadow: 'custom' }, options).textShadow,
    ).toBe('standard');
    expect(
      normalizeOutputAppearance(
        { textShadow: 'off' },
        { templateId: 'centered-vertical' },
      ).textShadow,
    ).toBe('standard');
  });

  it('normalizes legacy and unsafe values through template defaults', () => {
    expect(
      normalizeOutputAppearance(
        {
          fontFamily: 'serif',
          fontScale: 'large',
          textColor: 'url(https://example.com/attack.css)',
          accentColor: '#AABBCC',
          positionAnchor: 'center-left',
          positionOffsetX: 99,
          positionOffsetY: -99,
        },
        { templateId: 'ornate-vertical' },
      ),
    ).toMatchObject({
      fontFamily: 'ornate',
      fontScale: 'large',
      textColor: '#fff8ec',
      accentColor: '#aabbcc',
      positionAnchor: 'top-right',
      positionOffsetX: 12,
      positionOffsetY: -25,
    });
  });

  it('ignores persisted settings that the active template does not expose', () => {
    const preservedSlotSettings = {
      fontFamily: 'rounded',
      fontScale: 'large',
      fontWeight: 'regular',
      alignment: 'right',
      surface: 'solid',
      furigana: 'off',
      kineticMaterial: 'chromatic-depth',
      kineticArrangement: 'subtle-offset',
      textColor: '#abcdef',
      accentColor: '#fedcba',
      positionAnchor: 'bottom-right',
      positionOffsetX: 7,
      positionOffsetY: -9,
    };

    expect(
      normalizeOutputAppearance(preservedSlotSettings, {
        templateId: 'karaoke-stack',
      }),
    ).toEqual({
      paletteId: 'original',
      lookAmount: 100,
      fontFamily: 'sans',
      fontScale: 'large',
      fontWeight: 'semibold',
      alignment: 'left',
      surface: 'transparent',
      furigana: 'auto',
      kineticMaterial: 'candy-rim',
      kineticArrangement: 'straight',
      textColor: '#fff8ec',
      accentColor: '#ffffff',
      chalkboardRuleColor: '#fffdfa',
      positionAnchor: 'center-right',
      positionOffsetX: 0,
      positionOffsetY: 0,
      contrastStyle: 'balanced',
      textShadow: 'standard',
      sectionAccent: 'off',
      spacingDensity: 'normal',
      contentWidth: 'standard',
      receiptDirection: 'down',
      receiptReview: 'on',
      receiptReviewInterval: 15,
      vinylSurfaceLight: 'off',
      fisheyeRim: 100,
      fisheyeLayout: 'auto',
      fisheyeReflection: 100,
      fisheyeEnter: 'arc',
      fisheyeExit: 'auto',
      fisheyePulse: 100,
      fisheyeBlur: 'off',
      fisheyeGranularity: 'line',
    });

    expect(
      normalizeOutputAppearance(preservedSlotSettings, {
        templateId: 'ornate-vertical',
      }),
    ).toMatchObject({
      fontFamily: 'ornate',
      fontScale: 'large',
      fontWeight: 'semibold',
      alignment: 'left',
      surface: 'transparent',
      furigana: 'auto',
      kineticMaterial: 'candy-rim',
      kineticArrangement: 'straight',
      textColor: '#abcdef',
      accentColor: '#fedcba',
      positionAnchor: 'bottom-right',
      positionOffsetX: 7,
      positionOffsetY: -9,
    });
  });

  it('validates recognized values without rejecting unrelated scalar settings', () => {
    expect(sanitizeOutputAppearanceSetting('paletteId', 'cool')).toBe('cool');
    expect(sanitizeOutputAppearanceSetting('lookAmount', 73)).toBe(75);
    expect(
      sanitizeOutputAppearanceSetting('contrastStyle', 'strong-outline'),
    ).toBe('strong-outline');
    expect(sanitizeOutputAppearanceSetting('spacingDensity', 'dense')).toBe(
      undefined,
    );
    expect(sanitizeOutputAppearanceSetting('textColor', '#ABCDEF')).toBe(
      '#abcdef',
    );
    expect(sanitizeOutputAppearanceSetting('textColor', 'red; inset: 0')).toBe(
      undefined,
    );
    expect(sanitizeOutputAppearanceSetting('positionOffsetX', 12.8)).toBe(12);
    expect(sanitizeOutputAppearanceSetting('fontScale', 'huge')).toBe(
      undefined,
    );
    expect(sanitizeOutputAppearanceSetting('showArtist', true)).toBe(undefined);
  });

  it('keeps fixed-template defaults aligned with their existing slot family', () => {
    const defaultsFor = (templateId) =>
      Object.fromEntries(
        outputAppearanceFieldsForTemplate(templateId).map((field) => [
          field.key,
          field.defaultValue,
        ]),
      );

    expect(defaultsFor('focus-line')).toMatchObject({
      fontFamily: 'serif',
      fontWeight: 'bold',
      surface: 'transparent',
    });
    expect(defaultsFor('live-stage')).toMatchObject({
      fontFamily: 'sans',
      fontScale: 'medium',
      contrastStyle: 'balanced',
    });
    expect(defaultsFor('queue-board')).toMatchObject({
      fontFamily: 'sans',
      fontWeight: 'semibold',
      surface: 'solid',
    });
  });

  it('opens local font selection only for the Live Stage pilot', () => {
    const liveStageFont = outputAppearanceFieldsForTemplate('live-stage').find(
      ({ key }) => key === 'fontFamily',
    );
    const focusLineFont = outputAppearanceFieldsForTemplate('focus-line').find(
      ({ key }) => key === 'fontFamily',
    );

    expect(liveStageFont).toMatchObject({
      editor: 'font-family',
      allowLocalFonts: true,
      options: [{ id: 'sans' }, { id: 'serif' }, { id: 'rounded' }],
    });
    expect(focusLineFont).not.toHaveProperty('allowLocalFonts', true);
    expect(focusLineFont.editor).not.toBe('font-family');
  });

  it('sanitizes a bounded local font descriptor without accepting paths or CSS', () => {
    expect(sanitizeOutputAppearanceSetting('fontFamily', localFont)).toEqual(
      localFont,
    );
    expect(
      sanitizeOutputAppearanceSetting('fontFamily', {
        ...localFont,
        family: 'url(https://example.invalid/font.woff2)',
      }),
    ).toBeUndefined();
    expect(
      sanitizeOutputAppearanceSetting('fontFamily', {
        ...localFont,
        postscriptName: 'C:\\private\\font.ttf',
      }),
    ).toBeUndefined();
  });

  it('keeps a local font only on templates that declare the capability', () => {
    expect(
      normalizeOutputAppearance(
        { fontFamily: localFont },
        { templateId: 'live-stage' },
      ).fontFamily,
    ).toEqual(localFont);
    expect(
      normalizeOutputAppearance(
        { fontFamily: localFont },
        { templateId: 'focus-line' },
      ).fontFamily,
    ).toBe('serif');
    expect(
      normalizeOutputAppearance(
        { fontFamily: localFont },
        { templateId: 'kinetic-pop' },
      ).fontFamily,
    ).toBe('sans');
  });

  it('exposes only appearance controls consumed by each non-Lyrics template', () => {
    const keysFor = (templateId) =>
      outputAppearanceFieldsForTemplate(templateId).map(({ key }) => key);

    expect(keysFor('queue-board')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'spacingDensity',
    ]);
    expect(keysFor('art-card')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'vinylSurfaceLight',
    ]);
    expect(keysFor('cover-player')).toEqual([
      'paletteId',
      'lookAmount',
      'fontScale',
      'fontWeight',
      'surface',
    ]);
  });

  it('limits record highlight presets to Starry Vinyl', () => {
    const value = (settings, templateId = 'art-card') =>
      normalizeOutputAppearance(settings, { templateId }).vinylSurfaceLight;
    expect(value({})).toBe('off');
    expect(value({ vinylSurfaceLight: 'soft' })).toBe('soft');
    expect(value({ vinylSurfaceLight: 'standard' })).toBe('standard');
    expect(value({ vinylSurfaceLight: 'unexpected' })).toBe('off');
    expect(value({ vinylSurfaceLight: 'standard' }, 'ticket-stub')).toBe('off');
  });

  it('keeps shared controls in a stable product-facing category order', () => {
    const fields = outputAppearanceFieldsForTemplate('focus-line');

    expect(fields.map(({ key }) => key)).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'contrastStyle',
      'surface',
      'alignment',
      'spacingDensity',
      'contentWidth',
    ]);
    expect(fields.map(({ group }) => group)).toEqual([
      'color-treatment',
      'color-treatment',
      'typography',
      'typography',
      'typography',
      'readability',
      'surface',
      'layout',
      'layout',
      'layout',
    ]);
    expect(fields.map(({ groupOrder }) => groupOrder)).toEqual([
      10, 10, 30, 30, 30, 40, 50, 60, 60, 60,
    ]);
  });

  it.each([
    'art-card',
    'cover-player',
    'queue-board',
    'focus-line',
    'karaoke-stack',
    'kinetic-pop',
    'ornate-vertical',
    'manga-frame',
    'live-stage',
  ])('offers an effective semantic Look for %s', (templateId) => {
    expect(outputAppearanceFieldsForTemplate(templateId)[0]).toMatchObject({
      key: 'paletteId',
      control: 'select',
      editor: 'look',
      group: 'color-treatment',
      defaultValue: 'original',
      options: [
        { id: 'original' },
        { id: 'warm' },
        { id: 'cool' },
        { id: 'monochrome' },
        { id: 'high-contrast' },
      ],
    });
  });

  it('carries only customized values when the template changes', () => {
    const carried = carryOutputAppearanceToTemplate(
      { fontFamily: 'serif', fontWeight: 'regular', captureSize: 'full' },
      {
        fromTemplateId: 'focus-line',
        toTemplateId: 'manga-frame',
        slotDefaults: OUTPUT_SLOT_APPEARANCE_DEFAULTS.lyrics,
      },
    );

    expect(carried).toEqual({
      fontFamily: 'antique',
      fontWeight: 'regular',
      captureSize: 'full',
    });
  });

  it('keeps a customized local font and leaves same-template saves alone', () => {
    const localFont = {
      source: 'local',
      family: 'Noto Sans CJK TC',
      postscriptName: 'NotoSansCJKtc-Regular',
      style: 'Regular',
    };

    expect(
      carryOutputAppearanceToTemplate(
        { fontFamily: { ...localFont } },
        {
          fromTemplateId: 'live-stage',
          toTemplateId: 'focus-line',
          slotDefaults: { fontFamily: localFont },
        },
      ).fontFamily,
    ).toEqual({ ...localFont });
    expect(
      carryOutputAppearanceToTemplate(
        { fontFamily: 'sans' },
        { fromTemplateId: 'manga-frame', toTemplateId: 'manga-frame' },
      ),
    ).toEqual({ fontFamily: 'sans' });
  });
});

describe('output element appearance', () => {
  it('declares Cover Player elements and leaves other templates without any', () => {
    const targets = outputElementTargetsForTemplate('cover-player');
    expect(targets.map(({ id }) => id)).toEqual([
      'title',
      'artist',
      'progress',
      'transport',
    ]);
    expect(targets[0].fields.map(({ key }) => key)).toEqual([
      'element.title.fontWeight',
      'element.title.fontSizeScale',
    ]);
    for (const field of targets.flatMap(({ fields }) => fields)) {
      expect(field.scope).toBe('element');
    }
    expect(outputElementTargetsForTemplate('art-card')).toEqual([]);
  });

  it('normalizes element values to their defaults and bounds', () => {
    expect(
      normalizeOutputElementAppearance(
        {
          'element.title.fontSizeScale': 63,
          'element.artist.visible': 'hidden',
          'element.title.visible': 'hidden',
        },
        { templateId: 'cover-player' },
      ),
    ).toEqual({
      'element.title.fontWeight': 'inherit',
      'element.title.fontSizeScale': 80,
      'element.artist.fontWeight': 'inherit',
      'element.artist.fontSizeScale': 100,
      'element.artist.visible': 'hidden',
      'element.progress.visible': 'shown',
      'element.transport.visible': 'shown',
    });
    expect(outputElementFontWeight('inherit')).toBeUndefined();
    expect(outputElementFontWeight('bold')).toBe(700);
  });

  it('drops element values when the next template does not declare them', () => {
    const settings = {
      fontWeight: 'regular',
      'element.artist.visible': 'hidden',
    };
    expect(
      carryOutputAppearanceToTemplate(settings, {
        fromTemplateId: 'cover-player',
        toTemplateId: 'art-card',
      }),
    ).toEqual({ fontWeight: 'regular' });
    expect(
      carryOutputAppearanceToTemplate(settings, {
        fromTemplateId: 'cover-player',
        toTemplateId: 'cover-player',
      }),
    ).toEqual(settings);
  });
});
