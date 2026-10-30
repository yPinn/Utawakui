import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  countLiteralLines,
  evaluateUiLiterals,
  measureUiLiterals,
} from './uiLiteralRatchet.js';

describe('UI literal ratchet', () => {
  it('counts hardcoded CJK lines but not comments', () => {
    expect(
      countLiteralLines(
        [
          "const label = '曲庫';",
          '// 註解不算',
          ' * 文件註解',
          '<!-- 範本註解 -->',
          '<span>播放</span>',
          "const code = 'library';",
        ].join('\n'),
      ),
    ).toBe(2);
  });

  it('flags only files that grew past their baseline', () => {
    expect(
      evaluateUiLiterals(
        { 'a.vue': 3, 'b.js': 1, 'new.js': 2 },
        { 'a.vue': 3, 'b.js': 4 },
      ),
    ).toEqual([{ file: 'new.js', count: 2, allowed: 0 }]);
  });

  it('adds no hardcoded UI text beyond the baseline', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    // Move new text to shared/locales and read it with t() (AGENTS.md
    // "UI Text And Locale"). Lower counts: npm run i18n:baseline.
    expect(evaluateUiLiterals(measureUiLiterals(), baseline)).toEqual([]);
  });
});
