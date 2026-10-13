import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';
import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';
const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const catalogueSource = readFileSync(
  new URL('../../constants/uiDemoSections.js', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiTextButton.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoTextButtonAppearance, './DemoTextButtonAppearance.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});
describe('DemoTextButtonAppearance', () => {
  it('replaces only the Text Button sample with the staged appearance review', () => {
    expect(catalogueSource).toMatch(
      /key: 'text-button',[\s\S]*?title: '文字操作',[\s\S]*?components: \['UiTextButton'\]/u,
    );
    expect(actionsSource).toContain(
      "import DemoTextButtonAppearance from './DemoTextButtonAppearance.vue';",
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
    expect(actionsSource).not.toContain(
      '<div v-else-if="section.key === \'text-button\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
  });
  it('preserves native attributes, visible-name fallback, and stopped click propagation', () => {
    for (const Component of [UiTextButton]) {
      const hostClick = vi.fn();
      const mounted = mount(Component, {
        text: '海螺記',
        disabled: true,
        name: 'album-destination',
        'data-contract': 'native-forwarding',
        onClick: hostClick,
      });
      const button = findAll(mounted.root, (node) => node.type === 'button')[0];
      expect(button.props).toMatchObject({
        type: 'button',
        disabled: true,
        name: 'album-destination',
        'data-contract': 'native-forwarding',
      });
      expect(button.props['aria-label']).toBeUndefined();
      expect(textContent(button)).toContain('海螺記');
      mounted.app.unmount();
    }
  });
  it('keeps the adopted appearance prop-free while preserving native attrs', () => {
    const candidate = mount(UiTextButton, {
      text: '前往來源專輯',
      'data-contract': 'candidate-affordance',
    });
    const candidateButton = findAll(
      candidate.root,
      (node) => node.type === 'button',
    )[0];
    expect(candidateButton.props).toMatchObject({
      type: 'button',
      'data-contract': 'candidate-affordance',
    });
    expect(candidateButton.props['data-text-action-emphasis']).toBeUndefined();
    expect(candidateButton.props.class).toBe('ui-text-btn');
    candidate.app.unmount();
    const current = mount(UiTextButton, {
      text: '前往來源專輯',
      'data-contract': 'current-baseline',
    });
    const currentButton = findAll(
      current.root,
      (node) => node.type === 'button',
    )[0];
    expect(currentButton.props).toMatchObject({
      type: 'button',
      'data-contract': 'current-baseline',
    });
    expect(currentButton.props['data-text-action-emphasis']).toBeUndefined();
    current.app.unmount();
  });
  it('keeps click.stop and the optional ariaLabel override in the bounded API', () => {
    for (const Component of [UiTextButton]) {
      const mounted = mount(Component, {
        text: '海螺記',
        ariaLabel: '前往專輯：海螺記',
      });
      const button = findAll(mounted.root, (node) => node.type === 'button')[0];
      const stopPropagation = vi.fn();
      button.props.onClick({
        stopPropagation,
      });
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(button.props['aria-label']).toBe('前往專輯：海螺記');
      mounted.app.unmount();
    }
  });
  it('lets high-volume callers choose static ellipsis without mounting marquee work', () => {
    const mounted = mount(UiTextButton, {
      text: 'A deliberately long queue title',
      overflow: 'ellipsis',
    });
    const marquee = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-marquee'),
    );
    const staticText = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-text-btn__text'),
    )[0];
    expect(marquee).toHaveLength(0);
    expect(textContent(staticText)).toBe('A deliberately long queue title');
    expect(staticText.props.title).toBeUndefined();
    mounted.app.unmount();
  });
  it('lets headline callers clamp static text without mounting marquee work', () => {
    const mounted = mount(UiTextButton, {
      text: 'A deliberately long headline title',
      overflow: 'clamp',
    });
    const marquee = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-marquee'),
    );
    const clampText = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-text-btn__text--clamp'),
    )[0];
    expect(marquee).toHaveLength(0);
    expect(textContent(clampText)).toBe('A deliberately long headline title');
    expect(currentSource).toMatch(
      /\.ui-text-btn__text--clamp\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/u,
    );
    mounted.app.unmount();
  });
});
