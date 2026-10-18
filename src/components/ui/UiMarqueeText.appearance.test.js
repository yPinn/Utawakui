import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const { descriptor } = parse(
  readFileSync(new URL('./UiMarqueeText.vue', import.meta.url), 'utf8'),
);
const result = compileStyle({
  source: descriptor.styles[0].content,
  scoped: true,
  id: 'data-v-marquee-audit',
});
describe('UiMarqueeText motion recipe', () => {
  it('reuses spacing for its tail and travel without overriding inherited paint', () => {
    expect(result.errors).toEqual([]);
    const rules = [];
    result.rawResult.root.walkRules((rule) => rules.push(rule));
    const moving = rules.find(
      (rule) =>
        rule.selector.includes('.ui-marquee--overflow') &&
        !rule.parent.name &&
        !rule.selector.includes('data-ui-motion'),
    );
    expect(
      moving.nodes.find((node) => node.prop === 'padding-right')?.value,
    ).toBe('var(--ui-space-4)');
    const end = rules.find((rule) => rule.selector.includes('100%'));
    expect(
      end.nodes.find((node) => node.prop === 'transform')?.value,
    ).toContain('var(--ui-space-4)');
    result.rawResult.root.walkDecls((decl) =>
      expect(['color', 'background', 'background-color']).not.toContain(
        decl.prop,
      ),
    );
  });
  it('disables animation and trailing padding for both manual and OS reduced motion', () => {
    const rules = [];
    result.rawResult.root.walkRules((rule) => {
      if (
        rule.selector.includes('data-ui-motion') ||
        rule.parent.params === '(prefers-reduced-motion: reduce)'
      )
        rules.push(rule);
    });
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      const paint = Object.fromEntries(
        rule.nodes
          .filter((node) => node.type === 'decl')
          .map((node) => [node.prop, node.value]),
      );
      expect(paint).toMatchObject({
        animation: 'none',
        'max-width': '100%',
        'padding-right': '0',
        'will-change': 'auto',
      });
    }
  });
});
