import { describe, expect, it } from 'vitest';
import {
  ALIAS_KINDS,
  MAX_IDENTITY_ALIASES_PER_FIELD,
  buildIdentityProfile,
  buildIdentityProfiles,
} from './profiles.js';

describe('provider-neutral identity profiles', () => {
  it('preserves credited form and normalizes explicit aliases with provenance', () => {
    expect(
      buildIdentityProfile({
        title: 'Thunderstruck',
        artistCredit: 'AC/DC',
        artistHints: ['AC/DC'],
        album: 'The Razors Edge',
        durationSeconds: 292,
        source: { provider: 'catalog', platform: 'musicbrainz', id: 'rec-1' },
        confidence: { title: 'high', artist: 'high', album: 'medium' },
        titleAliases: [
          {
            value: 'Thunderstruck (Remastered)',
            kind: 'catalog-alias',
            source: 'catalog',
            confidence: 'high',
          },
          'THUNDERSTRUCK',
        ],
        artistAliases: [
          {
            value: 'ACDC',
            kind: 'romanization',
            source: 'catalog',
            confidence: 'low',
          },
        ],
      }),
    ).toMatchObject({
      title: 'Thunderstruck',
      artistCredit: 'AC/DC',
      artistHints: ['AC/DC'],
      aliases: {
        title: [
          {
            value: 'Thunderstruck (Remastered)',
            kind: 'catalog-alias',
            source: 'catalog',
            confidence: 'high',
          },
        ],
        artist: [
          {
            value: 'ACDC',
            kind: 'romanization',
            source: 'catalog',
            confidence: 'low',
          },
        ],
        album: [],
      },
    });
  });

  it('preserves input order, deduplicates, and bounds without choosing a feature policy', () => {
    const profiles = buildIdentityProfiles(
      [
        {
          title: 'Medium',
          artistCredit: 'Artist',
          confidence: { title: 'medium', artist: 'medium' },
        },
        {
          title: 'High',
          artistCredit: 'Artist',
          confidence: { title: 'high', artist: 'high' },
        },
        {
          title: 'Ｈｉｇｈ',
          artistCredit: 'ARTIST',
          confidence: { title: 'high', artist: 'high' },
        },
        {
          title: 'Low',
          artistCredit: 'Artist',
          confidence: { title: 'low', artist: 'low' },
        },
      ],
      { maxProfiles: 2 },
    );

    expect(profiles.map((profile) => profile.title)).toEqual([
      'Medium',
      'High',
    ]);
  });

  it('applies bounded alias defaults without inventing a primary identity', () => {
    expect(buildIdentityProfile({ artistCredit: 'Artist' })).toBeNull();
    expect(
      buildIdentityProfile({
        title: 'Song',
        album: 'Album',
        source: { platform: 'catalog-platform' },
        titleAliases: [
          'Alternate Song',
          { value: '', kind: 'fuzzy' },
          { value: 'Loose Song', confidence: 'unknown' },
          {
            value: 'Unsafe Romanization',
            kind: 'romanisation',
            confidence: 'high',
          },
        ],
        albumAliases: ['Alternate Album'],
      }),
    ).toMatchObject({
      aliases: {
        title: [
          {
            value: 'Alternate Song',
            kind: 'catalog-alias',
            source: 'catalog-platform',
            confidence: 'medium',
          },
          {
            value: 'Loose Song',
            kind: 'catalog-alias',
            confidence: 'medium',
          },
        ],
        album: [{ value: 'Alternate Album' }],
      },
    });
    expect(ALIAS_KINDS).toEqual([
      'catalog-alias',
      'script-normalized',
      'romanization',
      'fuzzy',
    ]);
    expect(Object.isFrozen(ALIAS_KINDS)).toBe(true);
  });

  it('merges complementary aliases and provenance from duplicate profiles', () => {
    const profiles = buildIdentityProfiles([
      {
        title: 'Song',
        artistCredit: 'Artist',
        source: { provider: 'catalog-a' },
        titleAliases: [
          {
            value: '歌曲',
            kind: 'catalog-alias',
            source: 'catalog-a',
            confidence: 'high',
          },
        ],
        artistHints: ['Artist A'],
      },
      {
        title: 'Song',
        artistCredit: 'Artist',
        source: { provider: 'catalog-b' },
        titleAliases: [
          {
            value: '歌曲',
            kind: 'catalog-alias',
            source: 'catalog-b',
            confidence: 'medium',
          },
          {
            value: 'Chanson',
            kind: 'catalog-alias',
            source: 'catalog-b',
            confidence: 'high',
          },
        ],
        artistHints: ['Artist B'],
      },
    ]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].aliases.title).toEqual([
      {
        value: '歌曲',
        kind: 'catalog-alias',
        source: 'catalog-a',
        confidence: 'high',
      },
      {
        value: '歌曲',
        kind: 'catalog-alias',
        source: 'catalog-b',
        confidence: 'medium',
      },
      {
        value: 'Chanson',
        kind: 'catalog-alias',
        source: 'catalog-b',
        confidence: 'high',
      },
    ]);
    expect(profiles[0].artistHints).toEqual(['Artist A', 'Artist B']);
  });

  it('preserves distinct provenance for the same alias in one observation', () => {
    const profile = buildIdentityProfile({
      title: 'Song',
      titleAliases: [
        {
          value: '歌曲',
          kind: 'catalog-alias',
          source: 'catalog-a',
          confidence: 'high',
        },
        {
          value: '歌曲',
          kind: 'catalog-alias',
          source: 'catalog-b',
          confidence: 'medium',
        },
      ],
    });

    expect(profile.aliases.title.map((alias) => alias.source)).toEqual([
      'catalog-a',
      'catalog-b',
    ]);
  });

  it('uses the default and hard profile bounds for untrusted collections', () => {
    const observations = Array.from({ length: 30 }, (_, index) => ({
      title: `Song ${index}`,
      confidence: { title: 'none' },
    }));

    expect(buildIdentityProfiles(observations)).toHaveLength(12);
    expect(
      buildIdentityProfiles(observations, { maxProfiles: 999 }),
    ).toHaveLength(24);
    expect(buildIdentityProfiles(null)).toEqual([]);
  });

  it('bounds aliases independently for each field', () => {
    const profile = buildIdentityProfile({
      title: 'Song',
      titleAliases: Array.from(
        { length: 20 },
        (_, index) => `Song alias ${index}`,
      ),
    });

    expect(profile.aliases.title).toHaveLength(MAX_IDENTITY_ALIASES_PER_FIELD);
  });
});
