import { describe, expect, it } from 'vitest';
import policyModule from './policy.js';

const {
  AUTOMATIC_LYRICS_PROVIDER_IDS,
  MANUAL_LYRICS_PROVIDER_IDS,
  lyricsProviderPolicy,
} = policyModule;

describe('lyrics provider policy', () => {
  it('keeps manual discovery separate from automatic acquisition authority', () => {
    expect(MANUAL_LYRICS_PROVIDER_IDS).toEqual([
      'lrclib',
      'netease',
      'betterlyrics',
    ]);
    expect(AUTOMATIC_LYRICS_PROVIDER_IDS).toEqual(['lrclib', 'netease']);
    expect(lyricsProviderPolicy('betterlyrics')).toMatchObject({
      manualSearch: true,
      automaticDiscovery: false,
      automaticSave: false,
    });
  });

  it('exposes immutable, exact-only automatic policies', () => {
    expect(lyricsProviderPolicy('lrclib')).toMatchObject({
      automaticDiscovery: true,
      automaticSave: true,
      automaticMatchBand: 'exact',
    });
    expect(lyricsProviderPolicy('netease')).toMatchObject({
      automaticDiscovery: true,
      automaticSave: true,
      automaticMatchBand: 'exact',
    });
    expect(lyricsProviderPolicy('unknown')).toBeNull();
    expect(Object.isFrozen(lyricsProviderPolicy('lrclib'))).toBe(true);
  });
});
