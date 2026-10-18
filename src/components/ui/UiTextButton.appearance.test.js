import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const { descriptor } = parse(
  readFileSync(new URL('./UiTextButton.vue', import.meta.url), 'utf8'),
);
const css = compileStyle({
  source: descriptor.styles[0].content,
  scoped: true,
  id: 'data-v-text-audit',
}).code;
describe('UiTextButton compiled paint contracts', () => {
  it('reaches both multi-root overflow owners with bounded deep styles', () => {
    expect(css).toContain('.ui-text-btn[data-v-text-audit] .ui-text-btn__text');
    expect(css).not.toContain('.ui-text-btn__text[data-v-text-audit]');
    expect(css).toContain('-webkit-line-clamp: 2');
  });
  it('uses existing disabled and focus tokens and excludes blocked hover', () => {
    expect(css).toContain('var(--ui-opacity-disabled)');
    expect(css).toContain('var(--ui-color-focus)');
    expect(css).toContain(":not([aria-disabled='true'])");
    expect(css).toContain("[aria-disabled='true']");
  });
});
