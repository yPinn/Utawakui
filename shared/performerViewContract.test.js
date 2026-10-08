import { describe, expect, it } from 'vitest';
import {
  PERFORMER_READING_SCALES,
  normalizePerformerReadingScale,
  parsePerformerLyricsOffsetIntent,
} from './performerViewContract.mjs';

describe('performer view contract', () => {
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
