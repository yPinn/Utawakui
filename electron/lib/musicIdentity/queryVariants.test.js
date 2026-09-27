import { describe, expect, it } from 'vitest';
import { buildIdentityProfile } from './profiles.js';
import {
  buildIdentityQueryVariants,
  chineseScriptForms,
  crossScriptTitleVariants,
} from './queryVariants.js';

describe('identity query variants', () => {
  it('builds an ordered bounded union without an alias Cartesian product', () => {
    const profile = buildIdentityProfile({
      title: '月面着陸計画 - Moon Landing Plan',
      artistCredit: 'tuki.',
      titleAliases: [
        {
          value: 'Lunar Landing Plan',
          kind: 'catalog-alias',
          source: 'catalog',
          confidence: 'high',
        },
      ],
      artistAliases: [
        {
          value: 'ツキ',
          kind: 'catalog-alias',
          source: 'catalog',
          confidence: 'medium',
        },
      ],
      source: { provider: 'catalog' },
      confidence: { title: 'high', artist: 'high' },
    });

    const variants = buildIdentityQueryVariants(profile, {
      maxQueries: 6,
      allowTitleOnly: true,
    });

    expect(variants.map((variant) => variant.reason)).toEqual([
      'original',
      'title-variant',
      'title-variant',
      'title-variant',
      'artist-variant',
      'title-only',
    ]);
    expect(variants[0]).toMatchObject({
      title: { value: '月面着陸計画 - Moon Landing Plan', kind: 'original' },
      artist: { value: 'tuki.', kind: 'original' },
    });
    expect(variants.slice(1, 4).map((variant) => variant.title.value)).toEqual([
      'Lunar Landing Plan',
      '月面着陸計画',
      'Moon Landing Plan',
    ]);
    expect(variants[4]).toMatchObject({
      title: { value: '月面着陸計画 - Moon Landing Plan' },
      artist: { value: 'ツキ', kind: 'catalog-alias' },
    });
    expect(variants).toHaveLength(6);
  });

  it('keeps romanization and fuzzy variants opt-in', () => {
    const profile = buildIdentityProfile({
      title: '隠れんぼ',
      artistCredit: '優里',
      titleAliases: [
        { value: 'Kakurenbo', kind: 'romanization', source: 'catalog' },
        { value: 'Kakurenbo song', kind: 'fuzzy', source: 'manual' },
      ],
    });

    expect(
      buildIdentityQueryVariants(profile, { allowTitleOnly: false }).map(
        (variant) => variant.title.value,
      ),
    ).toEqual(['隠れんぼ']);
    expect(
      buildIdentityQueryVariants(profile, {
        allowTitleOnly: false,
        allowRomanization: true,
        allowFuzzy: true,
      }).map((variant) => variant.title.value),
    ).toEqual(['隠れんぼ', 'Kakurenbo', 'Kakurenbo song']);
  });

  it('derives controlled cross-script and Chinese comparison forms', () => {
    expect(
      crossScriptTitleVariants('궁금해 (Next Page)').map(
        (variant) => variant.value,
      ),
    ).toEqual(['궁금해', 'Next Page']);
    expect(chineseScriptForms('後來')).toEqual({
      original: '後來',
      simplified: '后来',
      traditional: '後來',
    });
  });

  it('uses adapter hints and opt-in Chinese forms while respecting the hard limit', () => {
    const profile = buildIdentityProfile({
      title: '後來',
      artistCredit: '劉若英',
      artistHints: ['René Liu'],
      titleAliases: Array.from({ length: 20 }, (_, index) => ({
        value: `Later ${index}`,
        kind: 'catalog-alias',
        source: 'catalog',
        confidence: 'medium',
      })),
    });

    const variants = buildIdentityQueryVariants(profile, {
      includeChineseScriptVariants: true,
      maxQueries: 99,
    });

    expect(variants).toHaveLength(12);
    expect(variants.some((variant) => variant.title.value === '后来')).toBe(
      true,
    );
    expect(
      variants.some((variant) => variant.artist?.value === 'René Liu'),
    ).toBe(true);
  });

  it('can disable all script-normalized aliases and title-only fallback', () => {
    const profile = buildIdentityProfile({
      title: '後來 Later',
      artistCredit: '劉若英',
      titleAliases: [
        {
          value: '后来',
          kind: 'script-normalized',
          source: 'catalog',
        },
      ],
      artistHints: ['René Liu'],
    });

    const variants = buildIdentityQueryVariants(profile, {
      includeGeneratedScriptVariants: false,
      allowTitleOnly: false,
    });

    expect(variants.map((variant) => variant.reason)).toEqual([
      'original',
      'artist-variant',
    ]);
    expect(variants[1].artist).toMatchObject({
      value: 'René Liu',
      source: 'adapter-hint',
    });
    expect(buildIdentityQueryVariants(null)).toEqual([]);
  });
});
