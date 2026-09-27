import { describe, expect, it } from 'vitest';
import { buildObservedTrack, normalizeArtistHints } from './observedTrack.js';

describe('provider-neutral observed track', () => {
  it('normalizes bounded fields without parsing provider-specific titles', () => {
    expect(
      buildObservedTrack({
        title: '  Seven - Clean Ver.  ',
        artistCredit: '  정국 (Jung Kook) 和 Latto  ',
        artistHints: ['정국 (Jung Kook)', 'Latto', 'latto'],
        album: '  GOLDEN  ',
        durationSeconds: 184.4,
        isrc: 'us-um7-23-07036',
        source: {
          provider: 'catalog-adapter',
          platform: 'yt-music',
          type: 'track',
          id: 'track-1',
        },
        confidence: { title: 'high', artist: 'medium', album: 'unknown' },
      }),
    ).toEqual({
      title: 'Seven - Clean Ver.',
      artistCredit: '정국 (Jung Kook) 和 Latto',
      artistHints: ['정국 (Jung Kook)', 'Latto'],
      album: 'GOLDEN',
      duration: 184,
      isrc: 'USUM72307036',
      source: {
        provider: 'catalog-adapter',
        platform: 'yt-music',
        type: 'track',
        id: 'track-1',
      },
      confidence: { title: 'high', artist: 'medium', album: 'none' },
    });
  });

  it('keeps a credited group name intact unless the adapter supplies hints', () => {
    expect(
      buildObservedTrack({ title: 'Thunderstruck', artistCredit: 'AC/DC' }),
    ).toMatchObject({
      artistCredit: 'AC/DC',
      artistHints: [],
    });
    expect(normalizeArtistHints(['AC/DC', 'AC/DC'])).toEqual(['AC/DC']);
  });

  it('requires a title observation', () => {
    expect(buildObservedTrack({ artistCredit: 'Aimer' })).toBeNull();
  });

  it('does not guess duration units from the numeric magnitude', () => {
    expect(
      buildObservedTrack({ title: 'Long recording', durationSeconds: 1205 }),
    ).toMatchObject({ duration: 1205 });
  });
});
