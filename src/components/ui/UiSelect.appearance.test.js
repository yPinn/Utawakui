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
      /\.ui-select option\[data-v-select-test\],[\s\S]*?\.ui-select optgroup\[data-v-select-test\]\s*\{\s*background-color:\s*var\(--ui-floating-list-background\);/u,
    );
  });

  it('keeps field hover and native option highlight as separate owners', () => {
    expect(source).toContain('background: var(--ui-field-background-hover)');
    expect(source).not.toMatch(
      /option:(?:hover|checked)|optgroup:(?:hover|checked)/u,
    );
    expect(source).not.toContain('!important');
  });

  it('reserves the same arrow slot and text gap as Combobox without truncating option data', () => {
    expect(source).toContain('appearance: none');
    expect(source).toContain(
      'var(--ui-field-padding-inline) + var(--ui-space-4) + var(--ui-space-2)',
    );
    expect(source).toContain('text-overflow: ellipsis');
    expect(source).toContain('white-space: nowrap');
    expect(source).toContain('overflow: hidden');
    expect(source).toContain(
      'inset-inline-end: var(--ui-field-padding-inline)',
    );
    expect(source).toContain('pointer-events: none');
    expect(source).toContain('.ui-select:disabled + .ui-select__indicator');
    expect(source).toContain('{{ option.label }}');
  });
});
