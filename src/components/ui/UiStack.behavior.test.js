import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import UiStack from './UiStack.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';

attachClientRender(UiStack, './UiStack.vue', import.meta.url);

function root(mounted) {
  return findAll(mounted.root, (node) => node.type === 'div')[0];
}

function hasClass(node, name) {
  return String(node.props?.class ?? '')
    .split(/\s+/)
    .includes(name);
}

describe('UiStack', () => {
  it('bounds public layout values to the documented token-backed contract', () => {
    expect(UiStack.props.direction.validator('row')).toBe(true);
    expect(UiStack.props.direction.validator('grid')).toBe(false);
    expect(UiStack.props.gap.validator(0)).toBe(true);
    expect(UiStack.props.gap.validator(8)).toBe(true);
    expect(UiStack.props.gap.validator('2')).toBe(false);
    expect(UiStack.props.gap.validator(9)).toBe(false);
    expect(UiStack.props.align.validator('baseline')).toBe(true);
    expect(UiStack.props.align.validator('space-between')).toBe(false);
    expect(UiStack.props.justify.validator('space-between')).toBe(true);
    expect(UiStack.props.justify.validator('baseline')).toBe(false);
  });

  it('renders a flex container and merges caller class via attrs fallthrough', () => {
    const mounted = mount(
      UiStack,
      { class: 'analysis-workbench' },
      { default: () => 'content' },
    );
    const node = root(mounted);

    expect(hasClass(node, 'ui-stack')).toBe(true);
    expect(hasClass(node, 'analysis-workbench')).toBe(true);
    expect(textContent(node)).toBe('content');
    mounted.app.unmount();
  });

  it('defaults to row direction with no gap or align/justify/wrap classes', () => {
    const mounted = mount(UiStack, {}, { default: () => 'x' });
    const node = root(mounted);

    expect(hasClass(node, 'ui-stack--column')).toBe(false);
    expect(hasClass(node, 'ui-stack--wrap')).toBe(false);
    for (let gap = 1; gap <= 8; gap += 1) {
      expect(hasClass(node, `ui-stack--gap-${gap}`)).toBe(false);
    }
    expect(String(node.props?.class ?? '')).not.toMatch(/ui-stack--align-/);
    expect(String(node.props?.class ?? '')).not.toMatch(/ui-stack--justify-/);
    mounted.app.unmount();
  });

  it('applies column direction and a gap level', () => {
    const mounted = mount(
      UiStack,
      { direction: 'column', gap: 4 },
      { default: () => 'x' },
    );
    const node = root(mounted);

    expect(hasClass(node, 'ui-stack--column')).toBe(true);
    expect(hasClass(node, 'ui-stack--gap-4')).toBe(true);
    mounted.app.unmount();
  });

  it('applies align, justify, and wrap independently', () => {
    const mounted = mount(
      UiStack,
      { align: 'baseline', justify: 'space-between', wrap: true, gap: 2 },
      { default: () => 'x' },
    );
    const node = root(mounted);

    expect(hasClass(node, 'ui-stack--align-baseline')).toBe(true);
    expect(hasClass(node, 'ui-stack--justify-space-between')).toBe(true);
    expect(hasClass(node, 'ui-stack--wrap')).toBe(true);
    expect(hasClass(node, 'ui-stack--gap-2')).toBe(true);
    mounted.app.unmount();
  });

  it('uses only the shared spacing token scale, no raw hex/rgba colors', () => {
    const source = readFileSync(
      new URL('./UiStack.vue', import.meta.url),
      'utf8',
    );

    for (let gap = 1; gap <= 8; gap += 1) {
      expect(source).toContain(`var(--ui-space-${gap})`);
    }
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
