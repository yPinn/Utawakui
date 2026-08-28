import { describe, expect, it } from 'vitest';

import * as timingUnitsModule from './lyricsTimingUnits.mjs';

const { estimatedLyricsTextUnits } = timingUnitsModule;

describe('minimal lyrics timing units', () => {
  it('exposes only the universally required T1 timing-unit operation', () => {
    expect(Object.keys(timingUnitsModule)).toEqual([
      'estimatedLyricsTextUnits',
    ]);
  });

  it('preserves authored punctuation, whitespace, and line breaks without semantic labels', () => {
    const sourceText = '你好， world!\nAgain';
    const units = estimatedLyricsTextUnits(sourceText);

    expect(units).toEqual([
      { text: '你', weight: 1 },
      { text: '好， ', weight: 1 },
      { text: 'world!\n', weight: 5 },
      { text: 'Again', weight: 5 },
    ]);
    expect(units.map((unit) => unit.text).join('')).toBe(sourceText);
    expect(
      units.every(
        (unit) => Object.keys(unit).sort().join(',') === 'text,weight',
      ),
    ).toBe(true);
  });

  it('adds no punctuation weight and gives punctuation-only text a deterministic minimum', () => {
    expect(estimatedLyricsTextUnits('Go?!')).toEqual([
      { text: 'Go?!', weight: 2 },
    ]);
    expect(estimatedLyricsTextUnits('?!')).toEqual([{ text: '?!', weight: 1 }]);
    expect(estimatedLyricsTextUnits('')).toEqual([]);
  });

  it('does not normalize authored edge whitespace around visible text', () => {
    const sourceText = '  Sing!  ';
    const units = estimatedLyricsTextUnits(sourceText);

    expect(units).toEqual([{ text: sourceText, weight: 4 }]);
  });
});
