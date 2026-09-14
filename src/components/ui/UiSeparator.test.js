import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import UiSeparator from './UiSeparator.vue';
import { attachClientRender, findAll, mount } from './uiTestHost.js';

attachClientRender(UiSeparator, './UiSeparator.vue', import.meta.url);

function separatorRoot(root) {
  return findAll(root, (node) =>
    String(node.props?.class ?? '').includes('ui-separator'),
  )[0];
}

describe('UiSeparator', () => {
  it('defaults to a decorative horizontal separator and forwards root attrs', () => {
    const { app, root } = mount(UiSeparator, {
      class: 'playlist-section-divider',
      'data-section': 'albums',
    });
    const separator = separatorRoot(root);

    expect(String(separator.props.class)).toContain('ui-separator--horizontal');
    expect(String(separator.props.class)).toContain('playlist-section-divider');
    expect(separator.props).toMatchObject({
      'aria-hidden': 'true',
      'data-section': 'albums',
    });
    expect(separator.props.role).toBeUndefined();
    app.unmount();
  });

  it('exposes semantic vertical orientation without becoming interactive', () => {
    const { app, root } = mount(UiSeparator, {
      orientation: 'vertical',
      decorative: false,
    });
    const separator = separatorRoot(root);

    expect(String(separator.props.class)).toContain('ui-separator--vertical');
    expect(separator.props).toMatchObject({
      role: 'separator',
      'aria-orientation': 'vertical',
    });
    expect(separator.props.tabindex).toBeUndefined();
    app.unmount();
  });

  it('uses existing semantic geometry and color tokens without owning spacing', () => {
    const source = readFileSync(
      new URL('./UiSeparator.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('var(--ui-border-width)');
    expect(source).toContain('var(--ui-color-border)');
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
    expect(source).not.toMatch(/margin(?:-\w+)?:/u);
    expect(source).not.toContain('@click');
    expect(source).not.toContain('@keydown');
  });
});
