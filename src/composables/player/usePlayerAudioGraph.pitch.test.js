import { describe, expect, it } from 'vitest';

import { combinedSemitones } from './usePlayerAudioGraph.js';

describe('combinedSemitones', () => {
  it('returns 0 when both controls are at their defaults', () => {
    expect(combinedSemitones(0, 0)).toBe(0);
  });

  it('adds coarse transpose semitones directly', () => {
    expect(combinedSemitones(5, 0)).toBe(5);
    expect(combinedSemitones(-12, 0)).toBe(-12);
  });

  it('converts fine pitch cents to semitones (100 cents = 1 semitone)', () => {
    expect(combinedSemitones(0, 100)).toBe(1);
    expect(combinedSemitones(0, -50)).toBe(-0.5);
  });

  it('combines transpose and cents additively', () => {
    expect(combinedSemitones(2, 12)).toBeCloseTo(2.12);
    expect(combinedSemitones(-3, -50)).toBeCloseTo(-3.5);
  });

  it('handles the extremes of both control ranges', () => {
    expect(combinedSemitones(12, 50)).toBeCloseTo(12.5);
    expect(combinedSemitones(-12, -50)).toBeCloseTo(-12.5);
  });
});
