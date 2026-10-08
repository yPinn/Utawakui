import { describe, expect, it } from 'vitest';
import {
  isOutputLocalFontAvailable,
  normalizeOutputLocalFonts,
} from './outputLocalFonts.js';

describe('output local font catalog', () => {
  it('groups font faces by family and prefers a regular face identity', () => {
    expect(
      normalizeOutputLocalFonts([
        {
          family: 'Noto Sans CJK TC',
          fullName: 'Noto Sans CJK TC Bold',
          postscriptName: 'NotoSansCJKtc-Bold',
          style: 'Bold',
        },
        {
          family: 'Noto Sans CJK TC',
          fullName: 'Noto Sans CJK TC Regular',
          postscriptName: 'NotoSansCJKtc-Regular',
          style: 'Regular',
        },
        {
          family: 'Microsoft JhengHei',
          fullName: 'Microsoft JhengHei',
          postscriptName: 'MicrosoftJhengHeiRegular',
          style: 'Normal',
        },
      ]),
    ).toEqual([
      {
        source: 'local',
        family: 'Microsoft JhengHei',
        postscriptName: 'MicrosoftJhengHeiRegular',
        style: 'Normal',
      },
      {
        source: 'local',
        family: 'Noto Sans CJK TC',
        postscriptName: 'NotoSansCJKtc-Regular',
        style: 'Regular',
      },
    ]);
  });

  it('reads browser FontData metadata exposed through prototype getters', () => {
    class FontDataLike {
      get family() {
        return 'Stage Platform Sans';
      }

      get postscriptName() {
        return 'StagePlatformSans-Regular';
      }

      get style() {
        return 'Regular';
      }
    }

    expect(normalizeOutputLocalFonts([new FontDataLike()])).toEqual([
      {
        source: 'local',
        family: 'Stage Platform Sans',
        postscriptName: 'StagePlatformSans-Regular',
        style: 'Regular',
      },
    ]);
  });

  it('drops unsafe metadata and caps the catalog before it reaches the UI', () => {
    const valid = Array.from({ length: 520 }, (_, index) => ({
      family: `Stage Font ${String(index).padStart(3, '0')}`,
      fullName: `Stage Font ${index}`,
      postscriptName: `StageFont-${index}`,
      style: 'Regular',
    }));

    const catalog = normalizeOutputLocalFonts([
      { ...valid[0], family: 'url(https://example.invalid/font)' },
      { ...valid[1], postscriptName: 'C:\\private\\font.ttf' },
      ...valid,
    ]);

    expect(catalog).toHaveLength(500);
    expect(catalog[0].family).toBe('Stage Font 000');
    expect(catalog.at(-1).family).toBe('Stage Font 499');
  });

  it('matches a saved selection by PostScript identity or family fallback', () => {
    const catalog = normalizeOutputLocalFonts([
      {
        family: 'Noto Sans CJK TC',
        fullName: 'Noto Sans CJK TC',
        postscriptName: 'NotoSansCJKtc-Regular',
        style: 'Regular',
      },
    ]);

    expect(
      isOutputLocalFontAvailable(catalog, {
        source: 'local',
        family: 'Noto Sans CJK TC',
        postscriptName: 'NotoSansCJKtc-Regular',
        style: 'Regular',
      }),
    ).toBe(true);
    expect(
      isOutputLocalFontAvailable(catalog, {
        source: 'local',
        family: 'Noto Sans CJK TC',
        postscriptName: 'Other-Regular',
        style: 'Regular',
      }),
    ).toBe(true);
    expect(
      isOutputLocalFontAvailable(catalog, {
        source: 'local',
        family: 'Missing Stage Font',
        postscriptName: 'MissingStageFont-Regular',
        style: 'Regular',
      }),
    ).toBe(false);
  });
});
