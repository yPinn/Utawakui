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
  it.each(['ja', 'ko'])('restates every role for %s', (language) => {
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
    ['ja', 'Utawakui Gothic JA'],
    ['ko', 'Malgun Gothic'],
  ])('keeps the %s CJK face in every role', (language, face) => {
    const block = languageBlock(language);
    const stacks = block.split(/--ui-font-family-/u).slice(1);
    expect(stacks).toHaveLength(ROLES.length);
    for (const stack of stacks) expect(stack).toContain(face);
  });

  // Yu Gothic UI narrows kana; plain Yu Gothic at 400 resolves to Light.
  it('maps Japanese regular text to Yu Gothic Medium, not the UI cut', () => {
    expect(tokens).toMatch(
      /font-family: 'Utawakui Gothic JA';\s*src: local\('Yu Gothic Medium'\)[^;]*;\s*font-weight: 100 500;/u,
    );
    expect(tokens).toMatch(
      /font-family: 'Utawakui Gothic JA';\s*src: local\('Yu Gothic Bold'\)[^;]*;\s*font-weight: 600 900;/u,
    );
    const stacks = languageBlock('ja')
      .split(/--ui-font-family-/u)
      .slice(1);
    for (const stack of stacks) {
      expect(stack.indexOf('Utawakui Gothic JA')).toBeLessThan(
        stack.indexOf('Yu Gothic UI'),
      );
    }
  });

  // Its font-family: inherit outranks the zero-specificity [lang] rule.
  it('lets a lang-tagged text button re-resolve the base stack', () => {
    const button = readFileSync(
      new URL('../components/ui/UiTextButton.vue', import.meta.url),
      'utf8',
    );
    expect(button).toMatch(
      /\.ui-text-btn\[lang\] \{\s*font-family: var\(--ui-font-family-base\);/u,
    );
  });

  // YaHei draws about one weight step heavier than JhengHei, which made
  // simplified titles look bolder than their neighbours in the same list.
  it('keeps simplified Chinese on the shared JhengHei stacks', () => {
    expect(languageBlock('zh-Hans')).toBe('');
    expect(tokens).not.toMatch(/--ui-font-family-[a-z]+:[^;]*YaHei/u);
  });
});
