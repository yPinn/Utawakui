import { describe, expect, it } from 'vitest';
import providerDiscoveryModule from './providerDiscovery.js';

const { buildYoutubeMusicSearchUrl, buildYoutubeMusicSongsSearchUrl } =
  providerDiscoveryModule;

describe('buildYoutubeMusicSearchUrl', () => {
  it('builds one fixed YT Music search URL from normalized Unicode text', () => {
    const result = buildYoutubeMusicSearchUrl('  宇多田ヒカル\nFirst Love  ');
    const url = new URL(result);

    expect(url.origin).toBe('https://music.youtube.com');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('宇多田ヒカル First Love');
  });

  it('keeps URL-shaped and delimiter text inside the query parameter', () => {
    const input = 'https://example.test/private?x=1&next=javascript:alert(1)';
    const url = new URL(buildYoutubeMusicSearchUrl(input));

    expect(url.origin).toBe('https://music.youtube.com');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe(input);
  });

  it.each(['', ' \n\u0000 ', 'x'.repeat(201)])(
    'rejects an empty or overlong query without a fallback URL',
    (input) => {
      expect(buildYoutubeMusicSearchUrl(input)).toBe(null);
    },
  );
});

describe('buildYoutubeMusicSongsSearchUrl', () => {
  it('uses the fixed songs section for native recording discovery', () => {
    const result = buildYoutubeMusicSongsSearchUrl('  楊丞琳\n雨愛  ');
    const url = new URL(result);

    expect(url.origin).toBe('https://music.youtube.com');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('楊丞琳 雨愛');
    expect(url.hash).toBe('#songs');
  });

  it.each(['', ' \n\u0000 ', 'x'.repeat(201)])(
    'rejects an empty or overlong songs query',
    (input) => {
      expect(buildYoutubeMusicSongsSearchUrl(input)).toBe(null);
    },
  );
});
