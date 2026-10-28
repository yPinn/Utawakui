import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const { descriptor } = parse(
  readFileSync(new URL('./UiTrackRow.vue', import.meta.url), 'utf8'),
);
const compiled = compileStyle({
  source: descriptor.styles[0].content,
  scoped: true,
  id: 'data-v-track-audit',
});
const rules = [];
compiled.rawResult.root.walkRules((rule) => {
  const declarations = {};
  rule.walkDecls(({ prop, value }) => (declarations[prop] = value));
  rules.push({ selector: rule.selector, declarations });
});
describe('UiTrackRow state tokens', () => {
  it('keeps selection and interaction on existing semantic surfaces', () => {
    expect(compiled.errors).toEqual([]);
    expect(
      rules.find(
        (r) =>
          r.selector.startsWith('.ui-track--active[') &&
          r.selector.endsWith('::before'),
      )?.declarations.background,
    ).toBe('var(--ui-track-row-selected-background)');
    expect(
      rules.filter(
        (r) => r.declarations.background === 'var(--ui-color-surface-hover)',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rules.find(
        (r) =>
          r.selector.startsWith('.ui-track__action[') &&
          r.selector.includes(':focus-visible'),
      )?.declarations.outline,
    ).toBe('var(--ui-focus-width) solid var(--ui-color-focus)');
  });
  it('gives disabled final surface precedence while retaining selected identity and one opacity owner', () => {
    const disabled = rules.find(
      (r) =>
        r.selector.startsWith('.ui-track.ui-track--disabled') &&
        !r.selector.includes('--active'),
    );
    expect(disabled.declarations.background).toBe('transparent');
    const selected = rules.find((r) =>
      r.selector.startsWith('.ui-track.ui-track--disabled.ui-track--active'),
    );
    expect(selected.declarations.background).toBe(
      'var(--ui-track-row-selected-background)',
    );
    expect(
      rules.find(
        (r) =>
          r.selector.startsWith('.ui-track--disabled[') &&
          !r.selector.includes(' '),
      )?.declarations.opacity,
    ).toBe('var(--ui-opacity-disabled)');
    expect(
      rules.find((r) => r.selector.includes(' .ui-text-btn:disabled'))
        ?.declarations.opacity,
    ).toBe('1');
    expect(
      rules.find((r) => r.selector.includes(' .ui-marquee__text'))?.declarations
        .animation,
    ).toBe('none');
  });
});
