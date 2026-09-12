import { describe, expect, it } from 'vitest';
import {
  normalizeOutputAppearance,
  outputAppearanceFieldsForTemplate,
  sanitizeOutputAppearanceSetting,
} from './outputAppearance.mjs';

describe('output appearance schema', () => {
  it('exposes the bounded safe-appearance fields for Ornate Vertical', () => {
    const fields = outputAppearanceFieldsForTemplate('ornate-vertical');

    expect(fields.map((field) => field.key)).toEqual([
      'paletteId',
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
    expect(fields.find((field) => field.key === 'textColor')).toMatchObject({
      control: 'color',
      defaultValue: '#fff8ec',
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

  it('exposes only appearance controls consumed by each non-Lyrics template', () => {
    const keysFor = (templateId) =>
      outputAppearanceFieldsForTemplate(templateId).map(({ key }) => key);

    expect(keysFor('queue-board')).toEqual([
      'paletteId',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'spacingDensity',
    ]);
    expect(keysFor('now-next')).toEqual([
      'paletteId',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'alignment',
      'spacingDensity',
    ]);
    expect(keysFor('art-card')).toEqual([
      'paletteId',
      'fontFamily',
      'fontScale',
      'fontWeight',
    ]);
    expect(keysFor('cover-player')).toEqual([
      'paletteId',
      'fontScale',
      'fontWeight',
      'surface',
    ]);
  });

  it('keeps shared controls in a stable product-facing category order', () => {
    const fields = outputAppearanceFieldsForTemplate('focus-line');

    expect(fields.map(({ key }) => key)).toEqual([
      'paletteId',
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
      'color',
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
      10, 20, 20, 20, 30, 40, 50, 50, 50,
    ]);
  });

  it.each([
    'now-next',
    'art-card',
    'cover-player',
    'queue-board',
    'quiet-caption',
    'focus-line',
    'karaoke-stack',
    'kinetic-pop',
    'ornate-vertical',
    'manga-frame',
    'live-stage',
  ])('offers an effective semantic palette for %s', (templateId) => {
    expect(outputAppearanceFieldsForTemplate(templateId)[0]).toMatchObject({
      key: 'paletteId',
      group: 'color',
      groupLabel: '色彩',
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
});
