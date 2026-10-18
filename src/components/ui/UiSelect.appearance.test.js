import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./UiSelect.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const css = compileStyle({
  source: descriptor.styles[0].content,
  scoped: true,
  id: 'data-v-select-test',
}).code;

describe('UiSelect native popup surface', () => {
  it('gives options and groups an independent floating surface after scoped compilation', () => {
    expect(css).toMatch(
      /\.ui-select option\[data-v-select-test\],[\s\S]*?\.ui-select optgroup\[data-v-select-test\]\s*\{\s*background-color:\s*var\(--ui-floating-list-bg\);/u,
    );
  });

  it('keeps field hover and native option highlight as separate owners', () => {
    expect(source).toContain('background: var(--ui-field-bg-hover)');
    expect(source).not.toMatch(
      /option:(?:hover|checked)|optgroup:(?:hover|checked)/u,
    );
    expect(source).not.toMatch(/appearance:\s*none|!important/u);
  });
});
