import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const compiledRules = (file) => {
  const { descriptor } = parse(
    readFileSync(new URL(file, import.meta.url), 'utf8'),
  );
  const result = compileStyle({
    source: descriptor.styles[0].content,
    scoped: true,
    id: 'data-v-overlay-test',
  });
  expect(result.errors).toEqual([]);
  const rules = [];
  result.rawResult.root.walkRules((rule) => {
    const declarations = {};
    rule.walkDecls(({ prop, value }) => {
      declarations[prop] = value;
    });
    rules.push({ selectors: rule.selectors, declarations });
  });
  return rules;
};

describe('Popover and Tooltip surface and foreground ownership', () => {
  it('keeps overflow-only hints on the shared tooltip recipe without local paint', () => {
    const source = readFileSync(
      new URL('./UiOverflowTooltip.vue', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      "import UiTooltipSurface from './tooltip/UiTooltipSurface.vue'",
    );
    expect(source).toContain('useTooltip({');
    expect(source).toContain('describedBy: true');
    expect(source).not.toContain('<style');
  });

  it.each([
    [
      './UiPopover.vue',
      'ui-popover',
      '--ui-color-surface-raised',
      '--ui-color-text',
    ],
    [
      './tooltip/UiTooltipSurface.vue',
      'ui-tooltip',
      '--ui-tooltip-background',
      '--ui-tooltip-text',
    ],
  ])(
    '%s keeps a stable semantic surface and readable foreground',
    (file, name, background, foreground) => {
      const rules = compiledRules(file);
      const target = new RegExp(
        `\\.${name}\\[data-v-overlay-test\\][^ >+~]*$`,
        'u',
      );
      const paint = rules.filter(
        (rule) =>
          rule.selectors.some((s) => target.test(s)) &&
          ('background' in rule.declarations ||
            'background-color' in rule.declarations),
      );
      expect(paint).toHaveLength(1);
      expect(paint[0].declarations.background).toBe(`var(${background})`);
      expect(paint[0].declarations.color).toBe(`var(${foreground})`);
      expect(paint[0].declarations).not.toHaveProperty('opacity');
      for (const rule of rules) {
        expect(rule.declarations).not.toHaveProperty(background);
        expect(rule.declarations).not.toHaveProperty(foreground);
      }
    },
  );

  it('uses the dedicated secondary text token without dimming the whole Tooltip', () => {
    const rules = compiledRules('./tooltip/UiTooltipSurface.vue');
    const detail = rules.find(
      (rule) =>
        rule.selectors.includes('.ui-tooltip__detail[data-v-overlay-test]') &&
        'color' in rule.declarations,
    );
    expect(detail.declarations.color).toBe('var(--ui-tooltip-detail-text)');
    expect(detail.declarations).not.toHaveProperty('opacity');
  });
});
