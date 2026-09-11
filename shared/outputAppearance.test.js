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
      'fontFamily',
      'fontScale',
      'textColor',
      'accentColor',
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

  it('validates recognized values without rejecting unrelated scalar settings', () => {
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
      'fontFamily',
      'fontScale',
      'fontWeight',
      'alignment',
      'surface',
    ]);
    expect(keysFor('now-next')).toEqual([
      'fontFamily',
      'fontScale',
      'fontWeight',
      'alignment',
      'surface',
    ]);
    expect(keysFor('art-card')).toEqual([
      'fontFamily',
      'fontScale',
      'fontWeight',
    ]);
    expect(keysFor('cover-player')).toEqual([
      'fontScale',
      'fontWeight',
      'surface',
    ]);
  });
});
