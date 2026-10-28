import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

function rulesFor(file) {
  const { descriptor } = parse(
    readFileSync(new URL(file, import.meta.url), 'utf8'),
  );
  const result = compileStyle({
    source: descriptor.styles[0].content,
    scoped: true,
    id: 'data-v-surface-test',
  });
  expect(result.errors).toEqual([]);
  const rules = [];
  result.rawResult.root.walkRules((rule) => {
    const declarations = {};
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
    rules.push({ selectors: rule.selectors, declarations });
  });
  return rules;
}
const declarationsFor = (rules, selector) =>
  rules.find((rule) => rule.selectors.some(selector))?.declarations;

describe('floating surfaces stay independent from row interaction', () => {
  it.each([
    ['./UiCombobox.vue', 'ui-combobox__listbox'],
    ['./UiActionMenu.vue', 'ui-action-menu'],
  ])(
    '%s keeps exactly one neutral surface paint owner after scoped compilation',
    (file, surface) => {
      const rules = rulesFor(file);
      // Include an ancestor's hover/selected rule when its final target is the
      // surface, while excluding descendants such as the scrolling viewport.
      const surfaceTarget = new RegExp(
        `\\.${surface}\\[data-v-surface-test\\][^ >+~]*$`,
        'u',
      );
      const surfacePaint = rules.filter(
        (rule) =>
          rule.selectors.some((selector) => surfaceTarget.test(selector)) &&
          ('background' in rule.declarations ||
            'background-color' in rule.declarations),
      );
      expect(surfacePaint).toHaveLength(1);
      expect(surfacePaint[0].declarations.background).toBe(
        'var(--ui-floating-list-background)',
      );
    },
  );

  it.each(['./UiCombobox.vue', './UiActionMenu.vue'])(
    '%s never rebinds shared surface tokens from an interaction rule',
    (file) => {
      for (const rule of rulesFor(file)) {
        for (const name of [
          '--ui-floating-list-background',
          '--ui-color-surface-raised',
          '--ui-color-surface-hover',
          '--ui-color-surface-selected',
        ]) {
          expect(rule.declarations).not.toHaveProperty(name);
        }
      }
    },
  );

  it('gives Combobox selected, active and hovered options their own semantic row paints', () => {
    const rules = rulesFor('./UiCombobox.vue');
    const selected = declarationsFor(
      rules,
      (selector) =>
        selector.includes('.ui-combobox__option[') &&
        selector.includes("[aria-selected='true']"),
    );
    expect(selected.background).toBe('var(--ui-color-surface-selected)');
    const hover = declarationsFor(
      rules,
      (selector) =>
        selector.includes('.ui-combobox__option[') &&
        selector.includes(':hover:not('),
    );
    expect(hover.background).toBe('var(--ui-color-surface-hover)');
    const active = declarationsFor(rules, (selector) =>
      selector.startsWith('.ui-combobox__option--active['),
    );
    expect(active.background).toBe('var(--ui-color-surface-hover)');
    const disabled = declarationsFor(rules, (selector) =>
      selector.startsWith(".ui-combobox__option[aria-disabled='true']"),
    );
    expect(disabled.opacity).toBe('var(--ui-opacity-disabled)');
    expect(disabled).not.toHaveProperty('background');
  });

  it('limits ActionMenu hover, pressed, focus and danger paint to individual rows', () => {
    const rules = rulesFor('./UiActionMenu.vue');
    const hover = declarationsFor(
      rules,
      (selector) =>
        selector.startsWith('.ui-action-menu__item[') &&
        selector.includes(':hover:not('),
    );
    const pressed = declarationsFor(
      rules,
      (selector) =>
        selector.startsWith('.ui-action-menu__item[') &&
        selector.includes(':active:not('),
    );
    const focus = declarationsFor(
      rules,
      (selector) =>
        selector.startsWith('.ui-action-menu__item[') &&
        selector.endsWith(':focus-visible'),
    );
    const danger = declarationsFor(
      rules,
      (selector) =>
        selector.startsWith('.ui-action-menu__item--danger[') &&
        selector.includes(':hover:not('),
    );
    expect(hover.background).toBe('var(--ui-color-surface-hover)');
    expect(pressed.background).toBe('var(--ui-color-surface-active)');
    expect(focus.background).toBe('var(--ui-color-surface-active)');
    expect(focus.outline).toContain('var(--ui-color-focus)');
    expect(danger.background).toBe('var(--ui-color-danger-soft)');
  });
});
