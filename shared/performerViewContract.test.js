import { describe, expect, it } from 'vitest';
import {
  PERFORMER_READING_SCALES,
  PERFORMER_READING_VARIANTS,
  normalizePerformerReadingVariant,
  normalizePerformerReadingScale,
  parsePerformerLyricsOffsetIntent,
  parsePerformerControlIntent,
} from './performerViewContract.mjs';

describe('performer view contract', () => {
  it.each([
    'play',
    'pause',
    'reading-off',
    'reading-furigana',
    'reading-romaji',
  ])('accepts bounded toolbar action %s', (action) => {
    expect(
      parsePerformerControlIntent({
        action,
        revision: 3,
        trackId: 'a',
        path: 'private',
      }),
    ).toEqual({ action, revision: 3, trackId: 'a' });
  });
  it.each([
    { action: 'next', revision: 3, trackId: 'a' },
    { action: 'play', revision: -1, trackId: 'a' },
    { action: 'play', revision: 3, trackId: '' },
    null,
  ])('rejects unsupported toolbar intent %j', (value) => {
    expect(() => parsePerformerControlIntent(value)).toThrow(
      'Invalid performer control intent',
    );
  });
  it('bounds the shared reading preference and defaults unknown values to off', () => {
    expect(PERFORMER_READING_VARIANTS).toEqual(['off', 'furigana', 'romaji']);
    for (const value of PERFORMER_READING_VARIANTS)
      expect(normalizePerformerReadingVariant(value)).toBe(value);
    expect(normalizePerformerReadingVariant(undefined)).toBe('off');
    expect(normalizePerformerReadingVariant('both')).toBe('off');
  });

  it('keeps the three explicit reading-distance scales', () => {
    expect(PERFORMER_READING_SCALES).toEqual(['near', 'desk', 'stage']);
    expect(normalizePerformerReadingScale('near')).toBe('near');
    expect(normalizePerformerReadingScale('stage')).toBe('stage');
    expect(normalizePerformerReadingScale('invalid')).toBe('desk');
  });

  it.each(['delay', 'reset', 'advance', 'retry'])(
    'accepts the bounded %s intent',
    (action) => {
      expect(
        parsePerformerLyricsOffsetIntent({
          action,
          revision: 12,
          trackId: 'track-1',
        }),
      ).toEqual({ action, revision: 12, trackId: 'track-1' });
    },
  );

  it.each([
    [{ action: 'seek', revision: 12, trackId: 'track-1' }],
    [{ action: 'advance', revision: -1, trackId: 'track-1' }],
    [{ action: 'advance', revision: 12, trackId: '' }],
    [{ action: 'advance', revision: 12, trackId: 'x'.repeat(201) }],
  ])('rejects an unbounded or stale-shape intent', (intent) => {
    expect(() => parsePerformerLyricsOffsetIntent(intent)).toThrow(
      'Invalid performer lyrics offset intent',
    );
  });
});
