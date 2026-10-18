import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

describe('Overflow tooltip catalogue clipping', () => {
  it('reaches the multi-root primitive and exposes a token-based keyboard focus indicator', () => {
    const source = readFileSync(
      new URL('./DemoOverlays.vue', import.meta.url),
      'utf8',
    );
    const { descriptor } = parse(source);
    const css = descriptor.styles
      .map(
        (style) =>
          compileStyle({
            source: style.content,
            scoped: true,
            id: 'data-v-demo-test',
          }).code,
      )
      .join('\n');
    expect(css).toContain(
      '.demo-overlays[data-v-demo-test] .demo-overflow-tooltip',
    );
    expect(css).not.toContain('.demo-overflow-tooltip[data-v-demo-test]');
    expect(css).toContain('text-overflow: ellipsis');
    expect(css).toContain('var(--ui-color-focus)');
    expect(source).toMatch(
      /<UiOverflowTooltip\s+class="demo-overflow-tooltip"\s+tabindex="0"/u,
    );
  });
});
