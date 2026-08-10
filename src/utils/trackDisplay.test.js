import { describe, expect, it } from 'vitest';
import { getTrackInitial } from './trackDisplay.js';

describe('getTrackInitial', () => {
  it('uses the first title character when available', () => {
    expect(getTrackInitial({ title: 'Song', id: 'abc' })).toBe('S');
  });

  it('falls back to the track id', () => {
    expect(getTrackInitial({ title: '', id: 'abc' })).toBe('A');
  });

  it('returns a placeholder for empty input', () => {
    expect(getTrackInitial({ title: '   ', id: '' })).toBe('?');
    expect(getTrackInitial(null)).toBe('?');
  });
});
