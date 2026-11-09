import { describe, expect, it } from 'vitest';
import { readTrackTitleHints } from './trackTitleHints.mjs';

describe('recording title hints', () => {
  it.each([
    ['螺旋 - Acoustic Ver. - / Covered by Earendel', '螺旋', 'acoustic', true],
    ['RASEN Acoustic Ver', 'RASEN', 'acoustic', false],
    ['Song (Remix)', 'Song', 'remix', false],
    ['Live and Let Die', 'Live and Let Die', '', false],
    ['Song (English Version)', 'Song (English Version)', '', false],
    ['Song (Cover)', 'Song', '', true],
  ])('reads only explicit qualifiers in %s', (input, title, version, cover) => {
    expect(readTrackTitleHints(input)).toMatchObject({ title, version, cover });
  });
});
