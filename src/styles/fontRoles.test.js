import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const ROLES = ['base', 'display', 'utility'];

function languageBlock(language) {
  const start = tokens.indexOf(`[data-ui-system='v2'] :lang(${language}) {`);
  if (start < 0) return '';
  return tokens.slice(start, tokens.indexOf('}', start));
}

describe('font role tokens', () => {
  it('declares every role at the surface root', () => {
    for (const role of ROLES) {
      expect(tokens).toContain(`--ui-font-family-${role}:`);
    }
  });

  // var() resolves where it is declared, so a language must restate each role.
  it.each(['zh-Hans', 'ja', 'ko'])('restates every role for %s', (language) => {
    const block = languageBlock(language);
    for (const role of ROLES) {
      expect(block).toContain(`--ui-font-family-${role}:`);
    }
  });

  // Inherited font-family is already resolved; without this rule a lang tag
  // changes the variables but never the rendered face.
  it('re-resolves the base stack on lang-tagged elements at zero specificity', () => {
    expect(tokens).toMatch(
      /:where\(\[data-ui-system='v2'\] \[lang\]\) \{\s*font-family: var\(--ui-font-family-base\);/u,
    );
  });

  it.each([
    ['zh-Hans', 'Microsoft YaHei UI'],
    ['ja', 'Yu Gothic UI'],
    ['ko', 'Malgun Gothic'],
  ])('keeps the %s CJK face in every role', (language, face) => {
    const block = languageBlock(language);
    const stacks = block.split(/--ui-font-family-/u).slice(1);
    expect(stacks).toHaveLength(ROLES.length);
    for (const stack of stacks) expect(stack).toContain(face);
  });
});
