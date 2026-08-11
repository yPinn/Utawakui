import { describe, expect, it } from 'vitest';
import {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  splitArtistVariants,
  stripParenthesizedDecorations,
  stripTrackDecorations,
} from './musicTitle.js';

const fadedTitle = '\u892A\u8272';
const atarayoTitle = '\u590f\u971e';

describe('normalizeForCompare', () => {
  it('normalizes width, punctuation, and common video words', () => {
    expect(normalizeForCompare('Espresso (Official Music Video)')).toBe(
      'espresso',
    );
  });
});

describe('stripTrackDecorations', () => {
  it('removes official video decorations from latin titles', () => {
    expect(stripTrackDecorations('Aimer - Spark-Again [Official Video]')).toBe(
      'Aimer - Spark-Again',
    );
  });

  it('keeps bracketed song titles when the bracket is not decoration', () => {
    expect(
      stripTrackDecorations(`VH (Vast & Hazy)\u3010${fadedTitle}\u3011 MV`),
    ).toBe(`VH (Vast & Hazy)\u3010${fadedTitle}\u3011`);
  });
});

describe('stripParenthesizedDecorations', () => {
  it('removes bracketed version decorations for fallback title-only queries', () => {
    expect(stripParenthesizedDecorations('Orange (Music Video)')).toBe(
      'Orange',
    );
  });
});

describe('splitArtistVariants', () => {
  it('keeps the original artist and parenthesized aliases', () => {
    expect(splitArtistVariants('VH (Vast & Hazy)')).toEqual([
      'VH (Vast & Hazy)',
      'Vast & Hazy',
      'VH',
    ]);
  });
});

describe('extractTitleDerivedSearchParts', () => {
  it('extracts artist and title from CJK title brackets', () => {
    expect(
      extractTitleDerivedSearchParts(
        `VH (Vast & Hazy)\u3010${fadedTitle}\u3011 Official Music Video`,
      )[0],
    ).toEqual({
      trackName: fadedTitle,
      artistNames: ['VH (Vast & Hazy)', 'Vast & Hazy', 'VH'],
    });
  });

  it('extracts artist and title from dash-separated titles', () => {
    expect(
      extractTitleDerivedSearchParts(
        `\u3042\u305f\u3089\u3088 - ${atarayoTitle}(Music Video)`,
      )[0],
    ).toEqual({
      trackName: atarayoTitle,
      artistNames: ['\u3042\u305f\u3089\u3088'],
    });
  });
});

describe('looksLikeChannelArtist', () => {
  it('detects channel-like uploader labels across common languages', () => {
    expect(
      looksLikeChannelArtist('\u6dfb\u7ffc\u97f3\u6a02 TEAM EAR MUSIC'),
    ).toBe(true);
    expect(looksLikeChannelArtist('ROCK RECORDS')).toBe(true);
    expect(looksLikeChannelArtist('ONE OK ROCK')).toBe(false);
  });
});
