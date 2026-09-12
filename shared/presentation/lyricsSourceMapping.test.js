import { describe, expect, it } from 'vitest';

import {
  alignDisplayTextsToSourceRanges,
  interpolateSourceTimeAtOffset,
} from './lyricsSourceMapping.mjs';

describe('lyrics presentation source mapping', () => {
  it('aligns preserved display text after omitted fillers and punctuation', () => {
    const sourceText = 'Oh, Kitsch, kitsch 再唱一次';

    expect(
      alignDisplayTextsToSourceRanges(sourceText, ['Kitsch', '再唱一次']),
    ).toEqual([
      { sourceStart: sourceText.indexOf('Kitsch'), sourceEnd: 10 },
      {
        sourceStart: sourceText.indexOf('再唱一次'),
        sourceEnd: sourceText.length,
      },
    ]);
  });

  it('aligns cross-language display pages case-insensitively in source order', () => {
    const sourceText = '想看見天上璀璨的星光 sing it with me tonight';
    const ranges = alignDisplayTextsToSourceRanges(sourceText, [
      '想看見天上璀璨的星光',
      'Sing it with me tonight',
    ]);

    expect(ranges?.[0].sourceStart).toBe(0);
    expect(ranges?.[1].sourceStart).toBe(sourceText.indexOf('sing'));
    expect(ranges?.[1].sourceEnd).toBe(sourceText.length);
  });

  it('fails closed when display text cannot be aligned to the source', () => {
    expect(
      alignDisplayTextsToSourceRanges('source text', ['invented text']),
    ).toBeNull();
  });

  it('interpolates a source boundary within an authored timed segment', () => {
    expect(
      interpolateSourceTimeAtOffset(
        [
          {
            sourceStart: 0,
            sourceEnd: 10,
            startMs: 1000,
            endMs: 5000,
          },
        ],
        5,
      ),
    ).toBe(3000);
    expect(interpolateSourceTimeAtOffset([], 5)).toBeNull();
  });
});
