import { describe, expect, it } from 'vitest';
import { normalizeForCompare, normalizeText } from './text.js';

describe('music identity text normalization', () => {
  it('trims display text without rewriting its script or punctuation', () => {
    expect(normalizeText('  後來 Later  ')).toBe('後來 Later');
    expect(normalizeText(null)).toBe('');
  });

  it('normalizes lexical form without removing provider or version terms', () => {
    expect(normalizeForCompare('Ｓｏｎｇ（Live Session）')).toBe(
      'song live session',
    );
    expect(normalizeForCompare('Beyoncé / BEYONCÉ')).toBe('beyoncé beyoncé');
  });
});
