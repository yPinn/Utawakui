import { describe, expect, it } from 'vitest';
import { pseudoText } from './pseudoLocale.mjs';

describe('pseudo locale', () => {
  it('accents, pads and brackets translated text', () => {
    expect(pseudoText('Play Seven')).toBe('⟦Pļáý Šévéñ····⟧');
    expect(pseudoText('Saved')).toBe('⟦Šávéđ··⟧');
  });

  it('keeps surrounding spaces and leaves separators alone', () => {
    expect(pseudoText(' to queue')).toBe(' ⟦ţö qûéûé····⟧');
    expect(pseudoText(', ')).toBe(', ');
    expect(pseudoText(' · ')).toBe(' · ');
    expect(pseudoText('42')).toBe('42');
  });
});
