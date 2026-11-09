import { describe, expect, it } from 'vitest';
import {
  matchesTrackTitle,
  trackTitlePresentation,
  trackTitleQueries,
} from './trackTitlePresentation.js';

const earendel = {
  title: '螺旋 - Acoustic Ver. - / Covered by 厄倫蒂兒 𝑬𝒂𝒓𝒆𝒏𝒅𝒆𝒍',
  artist: 'Earendel ch. 厄倫蒂兒',
};

describe('track title presentation', () => {
  it('uses the exact reference title in display while querying the same recording', () => {
    const track = {
      ...earendel,
      workPresentation: {
        title: 'RASEN Acoustic Ver',
        searchTitles: ['RASEN', '螺旋'],
      },
    };
    expect(trackTitlePresentation(track)).toEqual({
      title: 'RASEN Acoustic Ver',
      queryTitle: '螺旋 Acoustic',
    });
    expect(trackTitleQueries(track)).toEqual([
      '螺旋 Acoustic',
      'RASEN acoustic',
    ]);
    expect(matchesTrackTitle(track, 'RASEN')).toBe(true);
    expect(matchesTrackTitle(track, '螺旋 Acoustic')).toBe(true);
    expect(matchesTrackTitle({ title: '你在 不在' }, '你在，不在')).toBe(true);
    expect(matchesTrackTitle({ title: '螺旋' }, 'RASEN')).toBe(false);
  });
  it('removes the repeated cover credit and keeps the version in the source title', () => {
    expect(trackTitlePresentation(earendel)).toEqual({
      title: '螺旋 - Acoustic Ver.',
      queryTitle: '螺旋 Acoustic',
    });
    expect(earendel.title).toContain('/ Covered by');
  });

  it('keeps other meaningful version wording when only the credit is repeated', () => {
    expect(
      trackTitlePresentation({
        ...earendel,
        title: '螺旋 (台北場) / Covered by 厄倫蒂兒 Earendel',
      }),
    ).toEqual({
      title: '螺旋 (台北場)',
      queryTitle: '螺旋 (台北場)',
    });
  });

  it.each([
    earendel.title.replace('𝑬𝒂𝒓𝒆𝒏𝒅𝒆𝒍', 'Earendel feat. Guest'),
    'RASEN Acoustic Ver',
    '你在 不在',
    'Covered by Snow',
  ])('preserves %s when the credit is absent or adds information', (title) => {
    expect(trackTitlePresentation({ ...earendel, title })).toEqual({
      title,
      queryTitle: title,
    });
  });
});
