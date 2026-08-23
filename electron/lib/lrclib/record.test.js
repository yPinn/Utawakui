import { describe, expect, it } from 'vitest';
import { LRCLIB_RECORD_LIMITS, normalizeLrclibRecord } from './record.js';

function completeRecord(overrides = {}) {
  return {
    id: 42,
    name: 'Espresso - Sabrina Carpenter',
    trackName: 'Espresso',
    artistName: 'Sabrina Carpenter',
    albumName: 'Short n’ Sweet',
    duration: 175.25,
    instrumental: false,
    plainLyrics: 'Now he is thinking about me',
    syncedLyrics: '[00:01.00]Now he is thinking about me',
    lyricsfile: 'version: 1.0\nlines: []\n',
    ...overrides,
  };
}

describe('normalizeLrclibRecord', () => {
  it('preserves every documented provider field in a stable complete shape', () => {
    expect(normalizeLrclibRecord(completeRecord())).toEqual({
      status: 'ok',
      record: completeRecord(),
    });
  });

  it('normalizes missing nullable provider fields to null', () => {
    const result = normalizeLrclibRecord({
      id: 7,
      trackName: 'Song',
      artistName: 'Artist',
      instrumental: true,
    });

    expect(result).toEqual({
      status: 'ok',
      record: {
        id: 7,
        name: null,
        trackName: 'Song',
        artistName: 'Artist',
        albumName: null,
        duration: null,
        instrumental: true,
        plainLyrics: null,
        syncedLyrics: null,
        lyricsfile: null,
      },
    });
  });

  it.each([
    ['non-object root', null, 'invalid-root'],
    [
      'unsafe id',
      completeRecord({ id: Number.MAX_SAFE_INTEGER + 1 }),
      'invalid-id',
    ],
    [
      'missing title',
      completeRecord({ trackName: '   ' }),
      'invalid-track-name',
    ],
    [
      'missing artist',
      completeRecord({ artistName: null }),
      'invalid-artist-name',
    ],
    ['invalid duration', completeRecord({ duration: -1 }), 'invalid-duration'],
    [
      'invalid instrumental flag',
      completeRecord({ instrumental: 'false' }),
      'invalid-instrumental',
    ],
    [
      'invalid lyrics field',
      completeRecord({ plainLyrics: [] }),
      'invalid-plain-lyrics',
    ],
  ])('rejects %s with a stable issue code', (_label, input, issue) => {
    expect(normalizeLrclibRecord(input)).toEqual({
      status: 'error',
      reason: 'invalid-record',
      issues: [issue],
    });
  });

  it('rejects bounded metadata and lyric fields before they cross main', () => {
    expect(
      normalizeLrclibRecord(
        completeRecord({
          trackName: 'x'.repeat(LRCLIB_RECORD_LIMITS.metadataChars + 1),
          lyricsfile: 'x'.repeat(LRCLIB_RECORD_LIMITS.lyricsChars + 1),
        }),
      ),
    ).toEqual({
      status: 'error',
      reason: 'invalid-record',
      issues: ['track-name-too-large', 'lyricsfile-too-large'],
    });
  });

  it('rejects control characters in identity metadata', () => {
    expect(
      normalizeLrclibRecord(completeRecord({ artistName: 'Artist\u0000Name' })),
    ).toEqual({
      status: 'error',
      reason: 'invalid-record',
      issues: ['invalid-artist-name'],
    });
  });
});
