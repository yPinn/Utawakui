import { describe, expect, it } from 'vitest';
import {
  OUTPUT_APPEARANCE_GROUPS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  carryOutputAppearanceToTemplate,
  normalizeOutputAppearance,
  outputAppearanceFieldsForTemplate,
  sanitizeOutputAppearanceSetting,
} from './outputAppearance.mjs';

describe('output appearance schema', () => {
  const localFont = {
    source: 'local',
    family: 'Noto Sans CJK TC',
    postscriptName: 'NotoSansCJKtc-Regular',
    style: 'Regular',
  };

  it('defines the inspector hierarchy once in common-to-specific order', () => {
    expect(OUTPUT_APPEARANCE_GROUPS).toEqual([
      { id: 'color-treatment', label: '色彩處理', order: 10 },
      { id: 'custom-color', label: '自訂色彩', order: 20 },
      { id: 'typography', label: '文字', order: 30 },
      { id: 'readability', label: '可讀性', order: 40 },
      { id: 'surface', label: '背景', order: 50 },
      { id: 'layout', label: '版面', order: 60 },
      { id: 'motion', label: '動態', order: 70 },
      { id: 'content', label: '內容顯示', order: 80 },
    ]);
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
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
    ]);
    expect(fields.find((field) => field.key === 'fontFamily')).toMatchObject({
      control: 'select',
      defaultValue: 'ornate',
      options: [
        { id: 'ornate', label: '華麗明朝（Hina Mincho）' },
        { id: 'antique', label: '古典明朝（GenEi Antique）' },
      ],
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
      positionAnchor: 'center-right',
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
      positionAnchor: 'center-right',
      positionOffsetX: 0,
      positionOffsetY: 0,
      contrastStyle: 'balanced',
      spacingDensity: 'normal',
      contentWidth: 'standard',
      receiptDirection: 'down',
      receiptReview: 'on',
      receiptReviewInterval: 15,
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
    expect(defaultsFor('now-next')).toMatchObject({
      fontFamily: 'sans',
      fontWeight: 'bold',
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
      options: [
        { id: 'sans', label: '無襯線' },
        { id: 'serif', label: '襯線' },
        { id: 'rounded', label: '圓體' },
      ],
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
    expect(keysFor('now-next')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'alignment',
      'spacingDensity',
    ]);
    expect(keysFor('art-card')).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
    ]);
    expect(keysFor('cover-player')).toEqual([
      'paletteId',
      'lookAmount',
      'fontScale',
      'fontWeight',
      'surface',
    ]);
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
    'now-next',
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
      groupLabel: '色彩處理',
      label: 'Look',
      defaultValue: 'original',
      options: [
        { id: 'original', label: '模板原色' },
        { id: 'warm', label: '暖色舞台' },
        { id: 'cool', label: '冷色舞台' },
        { id: 'monochrome', label: '黑白' },
        { id: 'high-contrast', label: '高對比' },
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
