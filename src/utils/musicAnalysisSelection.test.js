import { describe, expect, it } from 'vitest';
import { rangeTrackIds } from './musicAnalysisSelection.js';

describe('rangeTrackIds', () => {
  const visibleIds = ['a', 'b', 'c', 'd'];

  it('returns an inclusive range in visible order', () => {
    expect(rangeTrackIds(visibleIds, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeTrackIds(visibleIds, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to the target when the previous anchor is not visible', () => {
    expect(rangeTrackIds(visibleIds, 'missing', 'c')).toEqual(['c']);
  });
});
