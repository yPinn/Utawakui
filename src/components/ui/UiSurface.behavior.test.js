import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import UiSurface from './UiSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';

attachClientRender(UiSurface, './UiSurface.vue', import.meta.url);

function root(mounted) {
  return findAll(mounted.root, (node) => node.type === 'div')[0];
}

function hasClass(node, name) {
  return String(node.props?.class ?? '')
    .split(/\s+/)
    .includes(name);
}

describe('UiSurface', () => {
  it('renders a bordered container and merges caller class via attrs fallthrough', () => {
    const mounted = mount(
      UiSurface,
      { class: 'settings-block' },
      { default: () => 'content' },
    );
    const node = root(mounted);

    expect(hasClass(node, 'ui-surface')).toBe(true);
    expect(hasClass(node, 'settings-block')).toBe(true);
    expect(textContent(node)).toBe('content');
    mounted.app.unmount();
  });

  it('defaults to surface tone and md radius', () => {
    const mounted = mount(UiSurface, {}, { default: () => 'x' });
    const node = root(mounted);

    expect(hasClass(node, 'ui-surface--tone-surface')).toBe(true);
    expect(hasClass(node, 'ui-surface--radius-md')).toBe(true);
    mounted.app.unmount();
  });

  it('applies each tone value', () => {
    for (const tone of ['canvas', 'surface', 'raised']) {
      const mounted = mount(UiSurface, { tone }, { default: () => 'x' });
      const node = root(mounted);

      expect(hasClass(node, `ui-surface--tone-${tone}`)).toBe(true);
      mounted.app.unmount();
    }
  });

  it('applies each radius value', () => {
    for (const radius of ['md', 'lg']) {
      const mounted = mount(UiSurface, { radius }, { default: () => 'x' });
      const node = root(mounted);

      expect(hasClass(node, `ui-surface--radius-${radius}`)).toBe(true);
      mounted.app.unmount();
    }
  });

  it('uses only shared border/color/radius tokens, no raw hex/rgba colors', () => {
    const source = readFileSync(
      new URL('./UiSurface.vue', import.meta.url),
      'utf8',
    );

    for (const token of [
      '--ui-border-width',
      '--ui-color-border',
      '--ui-color-canvas',
      '--ui-color-surface',
      '--ui-color-surface-raised',
      '--ui-radius-md',
      '--ui-radius-lg',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
