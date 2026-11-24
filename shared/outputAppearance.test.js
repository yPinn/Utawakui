import { describe, expect, it } from 'vitest';
import outputTemplates from './outputTemplateValues.json';
import {
  OUTPUT_APPEARANCE_FIELDS,
  OUTPUT_APPEARANCE_GROUPS,
  OUTPUT_PROPERTY_FAMILIES,
  OUTPUT_PROPERTY_TIERS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  carryOutputAppearanceToTemplate,
  fisheyeDecorationStrength,
  normalizeOutputAppearance,
  normalizeOutputElementAppearance,
  outputAppearanceFieldsForTemplate,
  outputArtworkGradeMatrix,
  outputAuthoredFontRem,
  outputElementFontWeight,
  outputElementTargetsForTemplate,
  outputFontFamilyCss,
  sanitizeOutputAppearanceSetting,
} from './outputAppearance.mjs';

describe('output appearance schema', () => {
  it('uses the calibrated Kinetic Pop large preset before fine sizing', () => {
    const templateId = 'kinetic-pop';
    const appearance = normalizeOutputAppearance(
      { fontScale: 'large' },
      { templateId },
    );
    expect(outputAuthoredFontRem(templateId, appearance)).toBe(8.5);
    expect(
      outputAuthoredFontRem(templateId, {
        ...appearance,
        fontScaleAdjustment: 90,
      }),
    ).toBeCloseTo(7.65);
  });

  it('keeps fine font sizing local to the template and within layout limits', () => {
    const settings = { fontScale: 'small', fontScaleAdjustment: 72 };
    const karaoke = normalizeOutputAppearance(settings, {
      templateId: 'karaoke-stack',
    });
    expect(karaoke.fontScaleAdjustment).toBe(70);
    expect(outputAuthoredFontRem('karaoke-stack', karaoke)).toBeCloseTo(2.8);
    const carried = carryOutputAppearanceToTemplate(karaoke, {
      fromTemplateId: 'karaoke-stack',
      toTemplateId: 'ornate-vertical',
      slotDefaults: OUTPUT_SLOT_APPEARANCE_DEFAULTS.lyrics,
    });
    expect(carried).not.toHaveProperty('fontScaleAdjustment');
    expect(
      normalizeOutputAppearance(carried, { templateId: 'ornate-vertical' })
        .fontScaleAdjustment,
    ).toBe(100);
    expect(
      normalizeOutputAppearance(settings, { templateId: 'manga-frame' })
        .fontScaleAdjustment,
    ).toBe(80);
    expect(
      sanitizeOutputAppearanceSetting('fontScaleAdjustment', 85, {
        templateId: 'ribbon-setlist',
      }),
    ).toBeUndefined();
  });

  it('exposes ticket title scaling independently of the artist', () => {
    expect(
      normalizeOutputElementAppearance(
        {
          'element.title.fontSizeScale': 83,
          'element.artist.fontSizeScale': 80,
        },
        { templateId: 'ticket-stub' },
      ),
    ).toEqual({ 'element.title.fontSizeScale': 85 });
  });

  it('defaults Textured Credits to its middle block and supports both side blocks', () => {
    const templateId = 'textured-credits';
    const field = outputAppearanceFieldsForTemplate(templateId).find(
      ({ key }) => key === 'alignment',
    );
    expect(field.options.map(({ id }) => id)).toEqual([
      'left',
      'center',
      'right',
    ]);
    const defaults = OUTPUT_SLOT_APPEARANCE_DEFAULTS.lyrics;
    expect(
      carryOutputAppearanceToTemplate(defaults, {
        fromTemplateId: 'karaoke-stack',
        toTemplateId: templateId,
        slotDefaults: defaults,
      }).alignment,
    ).toBe('center');
    expect(normalizeOutputAppearance({}, { templateId }).alignment).toBe(
      'center',
    );
    for (const alignment of ['left', 'right']) {
      expect(
        normalizeOutputAppearance({ alignment }, { templateId }).alignment,
      ).toBe(alignment);
    }
  });

  it('interpolates artwork grading and preserves alpha at every strength', () => {
    expect(outputArtworkGradeMatrix('monochrome', 0)).toBeUndefined();
    expect(outputArtworkGradeMatrix('original', 100)).toBeUndefined();
    expect(outputArtworkGradeMatrix('warm', 100)).toBeUndefined();

    const grayscale = outputArtworkGradeMatrix('monochrome', 100);
    expect(grayscale.slice(0, 5)).toEqual([0.2126, 0.7152, 0.0722, 0, 0]);
    expect(grayscale.slice(5, 10)).toEqual(grayscale.slice(0, 5));
    expect(grayscale.slice(10, 15)).toEqual(grayscale.slice(0, 5));
    expect(outputArtworkGradeMatrix('monochrome', 50)[0]).toBeCloseTo(0.6063);

    for (const id of [
      'monochrome',
      'warm-film',
      'cool-film',
      'velvia-style',
      'kodak-gold-200-style',
      'polaroid-600-style',
    ]) {
      for (const strength of [5, 50, 100]) {
        const matrix = outputArtworkGradeMatrix(id, strength);
        expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
        expect([matrix[3], matrix[8], matrix[13]]).toEqual([0, 0, 0]);
      }
    }

    const neutralGray = (matrix, row) =>
      matrix
        .slice(row * 5, row * 5 + 3)
        .reduce((sum, value) => sum + value * 0.5, 0) + matrix[row * 5 + 4];
    const warm = outputArtworkGradeMatrix('warm-film', 100);
    const cool = outputArtworkGradeMatrix('cool-film', 100);
    expect(neutralGray(warm, 0)).toBeGreaterThan(neutralGray(warm, 2));
    expect(neutralGray(cool, 0)).toBeLessThan(neutralGray(cool, 2));
    const vivid = outputArtworkGradeMatrix('velvia-style', 100);
    expect(vivid[0]).toBeGreaterThan(1);
    expect(vivid[1]).toBeLessThan(0);
    const gold = outputArtworkGradeMatrix('kodak-gold-200-style', 100);
    const instant = outputArtworkGradeMatrix('polaroid-600-style', 100);
    expect(neutralGray(gold, 0)).toBeGreaterThan(neutralGray(gold, 2));
    expect(gold[1]).toBeLessThan(0);
    expect(instant[4]).toBeGreaterThan(0.07);
  });

  it.each([
    [-5, 'off', 0],
    [2, 'off', 0],
    [3, 'soft', 50],
    [70, 'soft', 50],
    [73, 'standard', 100],
    [100, 'standard', 100],
    ['off', 'off', 0],
    ['soft', 'soft', 50],
    ['standard', 'standard', 100],
    ['unknown', 'standard', 100],
    [undefined, 'standard', 100],
  ])(
    'normalizes Fisheye decorations with value %s to %s',
    (value, style, strength) => {
      const appearance = normalizeOutputAppearance(
        { fisheyeRim: value, fisheyeReflection: value },
        { templateId: 'fisheye-lens' },
      );
      expect(appearance.fisheyeRim).toBe(style);
      expect(appearance.fisheyeReflection).toBe(style);
      expect(fisheyeDecorationStrength(style)).toBe(strength);
    },
  );

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
      'sans',
      'serif',
      'rounded',
      'black-han-sans',
      'gowun-batang',
      'jua',
      'single-day',
    ];
    expect(field.defaultValue).toBe('lyrics-auto');
    expect(field.options.map(({ id }) => id)).toEqual(options);
    for (const fontFamily of options) {
      expect(
        normalizeOutputAppearance({ fontFamily }, { templateId }).fontFamily,
      ).toBe(fontFamily);
    }
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
      { id: 'decoration', order: 55 },
      { id: 'material', order: 56 },
      { id: 'layout', order: 60 },
      { id: 'portrait', order: 65 },
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
      'fontScaleAdjustment',
      'ornateArrangement',
      'ornateColumnMode',
      'ornateEntrance',
      'textShadow',
      'sectionAccent',
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
      'filmGrainAmount',
      'filmGrainSize',
    ]);
    expect(fields.find((field) => field.key === 'fontFamily')).toMatchObject({
      control: 'select',
      defaultValue: 'ornate',
      options: [
        { id: 'ornate' },
        { id: 'antique' },
        { id: 'sans' },
        { id: 'serif' },
        { id: 'rounded' },
        { id: 'black-han-sans' },
        { id: 'gowun-batang' },
        { id: 'jua' },
        { id: 'single-day' },
      ],
    });
    expect(fields.find((field) => field.key === 'fontScale')).toMatchObject({
      control: 'select',
      editor: 'font-scale',
    });
    expect(
      normalizeOutputAppearance({}, { templateId: 'ornate-vertical' }),
    ).toMatchObject({
      ornateColumnMode: 'retain',
      ornateEntrance: 'random-slide',
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

  it('keeps mixed sizes opt-in and limited to Ornate Vertical', () => {
    const settings = { ornateArrangement: 'mixed-sizes' };
    const options = { templateId: 'ornate-vertical' };
    expect(normalizeOutputAppearance({}, options).ornateArrangement).toBe(
      'uniform',
    );
    expect(normalizeOutputAppearance(settings, options).ornateArrangement).toBe(
      'mixed-sizes',
    );
    expect(
      normalizeOutputAppearance({ ornateArrangement: 'invalid' }, options)
        .ornateArrangement,
    ).toBe('uniform');
    expect(
      normalizeOutputAppearance(settings, { templateId: 'centered-vertical' })
        .ornateArrangement,
    ).toBe('uniform');
  });

  it('normalizes legacy and unsafe values through template defaults', () => {
    expect(
      normalizeOutputAppearance(
        {
          fontFamily: 'unknown-font',
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
      fontFamily: 'rounded',
      fontScale: 'large',
      fontScaleAdjustment: 100,
      ornateArrangement: 'uniform',
      ornateColumnMode: 'retain',
      ornateEntrance: 'random-slide',
      fontWeight: 'semibold',
      phantomMode: 'side-card',
      phantomChatShape: 'bubble',
      mangaBubbleStyle: 'spoken',
      mangaTailDirection: 'performer',
      phantomCardStyle: 'portrait',
      phantomPortraitColor: '',
      phantomArtistName: '',
      phantomPortraitPhoto: '',
      phantomRansomFont: 'kaitou',
      phantomCorner: 'auto',
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
      filmGrainAmount: 0,
      filmGrainSize: 'medium',
      fisheyeRim: 'standard',
      fisheyeLayout: 'auto',
      fisheyeReflection: 'standard',
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
      fontFamily: 'rounded',
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

  it.each(Object.keys(outputTemplates.templateKinds))(
    'offers template, common and local fonts for %s',
    (templateId) => {
      const font = outputAppearanceFieldsForTemplate(templateId).find(
        ({ key }) => key === 'fontFamily',
      );
      expect(font).toMatchObject({
        editor: 'font-family',
        allowLocalFonts: true,
      });
      expect(font.options.map(({ id }) => id)).toEqual(
        expect.arrayContaining([
          ...new Set([font.defaultValue, 'sans', 'serif', 'rounded']),
          'black-han-sans',
          'gowun-batang',
          'jua',
          'single-day',
        ]),
      );
      expect(normalizeOutputAppearance({}, { templateId }).fontFamily).toBe(
        font.defaultValue,
      );
      expect(
        normalizeOutputAppearance({ fontFamily: localFont }, { templateId })
          .fontFamily,
      ).toEqual(localFont);
    },
  );

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

  it('previews local glyph fallback in the template stack and script', () => {
    expect(outputFontFamilyCss(localFont, 'centered-vertical', 'ja')).toBe(
      `"${localFont.family}", 'Utawakui Klee One', 'Utawakui Open Huninn', sans-serif`,
    );
    expect(outputFontFamilyCss('template', 'kinetic-pop')).toContain(
      'Utawakui Keifont',
    );
    expect(
      outputFontFamilyCss(
        'template',
        'kinetic-pop',
        'zh-Hant',
        'chromatic-depth',
      ),
    ).toContain('Utawakui Open Huninn');
    expect(outputFontFamilyCss(localFont, 'ribbon-setlist', 'ko')).toContain(
      'Malgun Gothic',
    );
  });

  it('places the selected Hangul face and its bundled fallback before the template', () => {
    expect(
      outputFontFamilyCss('black-han-sans', 'centered-vertical', 'ja'),
    ).toBe(
      "'Utawakui Black Han Sans', 'Utawakui Gowun Batang', 'Utawakui Klee One', 'Utawakui Open Huninn', sans-serif",
    );
    expect(outputFontFamilyCss('jua', 'karaoke-stack', 'ko')).toMatch(
      /^'Utawakui Jua', 'Utawakui Gowun Batang', 'Utawakui Open Huninn',/,
    );
  });

  it('exposes only appearance controls consumed by each non-Lyrics template', () => {
    const keysFor = (templateId) =>
      outputAppearanceFieldsForTemplate(templateId).map(({ key }) => key);

    expect(keysFor('queue-board')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontScaleAdjustment',
      'fontWeight',
      'surface',
      'spacingDensity',
      'filmGrainAmount',
      'filmGrainSize',
    ]);
    expect(keysFor('art-card')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontScaleAdjustment',
      'fontWeight',
      'vinylSurfaceLight',
      'filmGrainAmount',
      'filmGrainSize',
    ]);
    expect(keysFor('cover-player')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontScaleAdjustment',
      'fontWeight',
      'surface',
      'filmGrainAmount',
      'filmGrainSize',
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
      'fontScaleAdjustment',
      'fontWeight',
      'contrastStyle',
      'surface',
      'alignment',
      'spacingDensity',
      'contentWidth',
      'filmGrainAmount',
      'filmGrainSize',
    ]);
    expect(fields.map(({ group }) => group)).toEqual([
      'color-treatment',
      'color-treatment',
      'typography',
      'typography',
      'typography',
      'typography',
      'readability',
      'surface',
      'layout',
      'layout',
      'layout',
      'material',
      'material',
    ]);
    expect(fields.map(({ groupOrder }) => groupOrder)).toEqual([
      10, 10, 30, 30, 30, 30, 40, 50, 60, 60, 60, 56, 56,
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
        { id: 'warm-film' },
        { id: 'cool-film' },
        { id: 'velvia-style' },
        { id: 'kodak-gold-200-style' },
        { id: 'polaroid-600-style' },
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

describe('template-scoped decoration settings', () => {
  it('drops a template asset field for templates that do not own it', () => {
    expect(
      sanitizeOutputAppearanceSetting('fisheyeRim', 'soft', {
        templateId: 'fisheye-lens',
      }),
    ).toBe('soft');
    expect(
      sanitizeOutputAppearanceSetting('fisheyeRim', 'soft', {
        templateId: 'queue-board',
      }),
    ).toBeUndefined();
  });
});
