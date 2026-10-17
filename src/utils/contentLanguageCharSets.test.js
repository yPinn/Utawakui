import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCharSetsModule } from '../../scripts/generate-content-language-charsets.mjs';
import { buildCharSets } from './contentLanguageCharSetDerivation.js';
import {
  JAPANESE_ONLY,
  SIMPLIFIED_ONLY,
  TRADITIONAL_ONLY,
} from './contentLanguageCharSets.js';

describe('generated content language character sets', () => {
  const derived = buildCharSets();

  it.each([
    ['japaneseOnly', JAPANESE_ONLY],
    ['simplifiedOnly', SIMPLIFIED_ONLY],
    ['traditionalOnly', TRADITIONAL_ONLY],
  ])('%s matches the OpenCC derivation', (name, generated) => {
    expect(new Set(generated)).toEqual(derived[name]);
  });

  it('holds only single-code-point characters', () => {
    for (const set of Object.values(derived)) {
      for (const char of set) expect([...char]).toHaveLength(1);
    }
  });

  it('is the current generator output (rerun the script after OpenCC upgrades)', () => {
    const committed = readFileSync(
      new URL('./contentLanguageCharSets.js', import.meta.url),
      'utf8',
    );
    expect(committed).toBe(renderCharSetsModule(derived));
  });
});
