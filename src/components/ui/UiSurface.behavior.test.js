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
  return findAll(mounted.root, (node) =>
    String(node.props?.class ?? '')
      .split(/\s+/)
      .includes('ui-surface'),
  )[0];
}

function hasClass(node, name) {
  return String(node.props?.class ?? '')
    .split(/\s+/)
    .includes(name);
}

describe('UiSurface', () => {
  it('bounds tone, radius, and stroke to the documented material contract', () => {
    expect(UiSurface.props.tone.validator('surface')).toBe(true);
    expect(UiSurface.props.tone.validator('accent')).toBe(false);
    expect(UiSurface.props.radius.validator('lg')).toBe(true);
    expect(UiSurface.props.radius.validator('pill')).toBe(false);
    expect(UiSurface.props.stroke.validator('inset')).toBe(true);
    expect(UiSurface.props.stroke.validator('outline')).toBe(false);
  });

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
    expect(hasClass(node, 'ui-surface--stroke-border')).toBe(true);
    mounted.app.unmount();
  });

  it('can paint an inset stroke without consuming content-box geometry', () => {
    const mounted = mount(
      UiSurface,
      { stroke: 'inset' },
      { default: () => 'x' },
    );
    const node = root(mounted);
    const source = readFileSync(
      new URL('./UiSurface.vue', import.meta.url),
      'utf8',
    );

    expect(hasClass(node, 'ui-surface--stroke-inset')).toBe(true);
    expect(source).toMatch(
      /\.ui-surface--stroke-inset\s*\{[^}]*position:\s*relative;[^}]*border:\s*0;/su,
    );
    expect(source).toMatch(
      /\.ui-surface--stroke-inset::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-color-border\);[^}]*border-radius:\s*inherit;[^}]*pointer-events:\s*none;/su,
    );
    expect(source).not.toMatch(
      /\.ui-surface--stroke-inset\s*\{[^}]*box-shadow:/su,
    );
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
    for (const radius of ['sm', 'md', 'lg']) {
      const mounted = mount(UiSurface, { radius }, { default: () => 'x' });
      const node = root(mounted);

      expect(hasClass(node, `ui-surface--radius-${radius}`)).toBe(true);
      mounted.app.unmount();
    }
  });

  it('defaults to a div and renders a caller-chosen tag when given one', () => {
    const defaultMounted = mount(UiSurface, {}, { default: () => 'x' });
    expect(root(defaultMounted).type).toBe('div');
    defaultMounted.app.unmount();

    const asideMounted = mount(
      UiSurface,
      { tag: 'aside' },
      { default: () => 'x' },
    );
    const asideNode = root(asideMounted);
    expect(asideNode.type).toBe('aside');
    expect(hasClass(asideNode, 'ui-surface')).toBe(true);
    asideMounted.app.unmount();
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
      '--ui-radius-sm',
      '--ui-radius-md',
      '--ui-radius-lg',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
