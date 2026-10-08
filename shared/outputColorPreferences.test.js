import { describe, expect, it } from 'vitest';
import {
  MAX_OUTPUT_RECENT_COLORS,
  MAX_OUTPUT_SAVED_COLORS,
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
  prependOutputRecentColor,
  toggleOutputSavedColor,
} from './outputColorPreferences.mjs';

describe('Output color preferences', () => {
  it('normalizes, deduplicates, and bounds six-digit recent colors', () => {
    expect(
      normalizeOutputRecentColors([
        '#AABBCC',
        '#aabbcc',
        '#123456',
        'red',
        '#12345',
        ...Array.from(
          { length: 12 },
          (_, index) => `#${String(index).padStart(6, '0')}`,
        ),
      ]),
    ).toEqual([
      '#aabbcc',
      '#123456',
      '#000000',
      '#000001',
      '#000002',
      '#000003',
      '#000004',
      '#000005',
    ]);
    expect(MAX_OUTPUT_RECENT_COLORS).toBe(8);
  });

  it('moves a committed recent color to the front without mutating the input', () => {
    const history = ['#112233', '#aabbcc', '#445566'];

    expect(prependOutputRecentColor(history, '#AABBCC')).toEqual([
      '#aabbcc',
      '#112233',
      '#445566',
    ]);
    expect(history).toEqual(['#112233', '#aabbcc', '#445566']);
    expect(prependOutputRecentColor(history, 'invalid')).toEqual(history);
  });

  it('bounds candidate scanning before accepting renderer-provided values', () => {
    const oversized = [
      ...Array.from({ length: 32 }, () => 'invalid'),
      '#112233',
    ];

    expect(normalizeOutputRecentColors(oversized)).toEqual([]);
  });

  it('keeps a stable bounded saved palette separate from recent order', () => {
    expect(
      normalizeOutputSavedColors([
        '#AABBCC',
        '#112233',
        '#aabbcc',
        'red',
        '#445566',
      ]),
    ).toEqual(['#aabbcc', '#112233', '#445566']);
    expect(MAX_OUTPUT_SAVED_COLORS).toBe(8);
  });

  it('adds saved colors at the end, removes existing colors, and never evicts a full palette', () => {
    const savedColors = ['#112233', '#445566'];

    expect(toggleOutputSavedColor(savedColors, '#AABBCC')).toEqual([
      '#112233',
      '#445566',
      '#aabbcc',
    ]);
    expect(toggleOutputSavedColor(savedColors, '#445566')).toEqual(['#112233']);
    expect(savedColors).toEqual(['#112233', '#445566']);

    const fullPalette = Array.from(
      { length: MAX_OUTPUT_SAVED_COLORS },
      (_, index) => `#${String(index).padStart(6, '0')}`,
    );
    expect(toggleOutputSavedColor(fullPalette, '#ffffff')).toEqual(fullPalette);
    expect(toggleOutputSavedColor(savedColors, 'invalid')).toEqual(savedColors);
  });
});
