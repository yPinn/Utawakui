import { h, nextTick, reactive, toRaw } from 'vue';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import Split from './ObsOutputSplitLayout.vue';
import Scroll from '../ui/UiScrollLayout.vue';
import Region from '../ui/UiScrollRegion.vue';
import Button from '../ui/UiButton.vue';
import Tooltip from '../ui/tooltip/UiTooltipSurface.vue';
import Separator from '../ui/UiSeparator.vue';
for (const [c, p] of [
  [Split, './ObsOutputSplitLayout.vue'],
  [Scroll, '../ui/UiScrollLayout.vue'],
  [Region, '../ui/UiScrollRegion.vue'],
  [Button, '../ui/UiButton.vue'],
  [Tooltip, '../ui/tooltip/UiTooltipSurface.vue'],
  [Separator, '../ui/UiSeparator.vue'],
])
  attachClientRender(c, p, import.meta.url);
let mounted, observed;
beforeEach(() => {
  observed = [];
  vi.stubGlobal('document', {
    body: hostNode('body'),
    documentElement: hostNode('html'),
    activeElement: hostNode('button'),
    querySelector: () => null,
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 850,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (cb) => cb(),
    cancelAnimationFrame: vi.fn(),
  });
  const values = {
    '--ui-output-side-width-min': '14rem',
    '--ui-output-side-width-default': '18rem',
    '--ui-output-side-width-max': '24rem',
    '--ui-output-main-width-min': '16rem',
    '--ui-output-split-gap': '0.75rem',
  };
  vi.stubGlobal('getComputedStyle', () => ({
    fontSize: '16px',
    getPropertyValue: (key) => values[key] ?? '',
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(target) {
        const node = toRaw(target);
        if (node.props?.class?.split(' ').includes('obs-output-split-layout')) {
          node.clientWidth = 800;
          observed.push({ node, cb: this.cb });
          this.cb();
        }
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  mounted?.app.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});
function setup(width = 336) {
  const props = reactive({
    ariaLabel: '測試',
    sideLabel: '屬性',
    sideWidth: width,
    sideCollapsed: false,
    compactSideOpen: false,
  });
  props['onUpdate:sideWidth'] = (value) => {
    props.sideWidth = value;
  };
  props['onUpdate:sideCollapsed'] = (value) => {
    props.sideCollapsed = value;
  };
  props['onUpdate:compactSideOpen'] = (value) => {
    props.compactSideOpen = value;
  };
  mounted = mount(Split, props, {
    main: () => h('button', '主區'),
    side: () => h('input', { value: '保留草稿' }),
  });
  findAll(
    mounted.root,
    (n) => n.props.class === 'obs-output-split-layout__toolbar',
  ).forEach((node) => {
    node.querySelector = () =>
      findAll(
        node,
        (n) => n.type === 'button' && 'data-output-side-toggle' in n.props,
      )[0];
  });
  return props;
}
const separator = () =>
  findAll(mounted.root, (n) => n.props.role === 'separator')[0];
describe('shared Output split mechanics', () => {
  it('bounds keyboard resize using CSS geometry and does not overwrite preference on container clamp', async () => {
    const props = setup(384);
    await nextTick();
    expect(
      findAll(mounted.root, (node) => node.props.role === 'separator'),
    ).toHaveLength(1);
    expect(
      findAll(separator(), (node) => node.props['aria-hidden'] === 'true'),
    ).toHaveLength(1);
    observed[0].node.clientWidth = 600;
    observed[0].cb();
    await nextTick();
    expect(separator().props['aria-valuenow']).toBe(332);
    expect(props.sideWidth).toBe(384);
    trigger(separator(), 'onKeydown', { key: 'Home', preventDefault: vi.fn() });
    await nextTick();
    expect(props.sideWidth).toBe(224);
    trigger(separator(), 'onKeydown', { key: 'End', preventDefault: vi.fn() });
    await nextTick();
    expect(props.sideWidth).toBe(332);
  });
  it('shares collapse intents while preserving the existing side subtree', async () => {
    const props = setup();
    await nextTick();
    const input = findAll(mounted.root, (n) => n.type === 'input')[0];
    trigger(separator(), 'onKeydown', {
      key: 'Enter',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(props.sideCollapsed).toBe(true);
    expect(separator()).toBeUndefined();
    expect(findAll(mounted.root, (n) => n.type === 'input')[0]).toBe(input);
  });
  it('uses a separate compact reveal without changing the shared width or wide disclosure', async () => {
    const props = setup();
    await nextTick();
    observed[0].node.clientWidth = 491;
    observed[0].cb();
    await nextTick();
    expect(separator()).toBeUndefined();
    const toggle = findAll(
      mounted.root,
      (n) => n.type === 'button' && 'data-output-side-toggle' in n.props,
    )[0];
    trigger(toggle, 'onClick');
    await nextTick();
    expect(props.compactSideOpen).toBe(true);
    expect(props.sideCollapsed).toBe(false);
    expect(props.sideWidth).toBe(336);
  });
  it('restores the original preference on cancelled pointer drag, including a default preference', async () => {
    const props = setup(null);
    await nextTick();
    const listeners = {};
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      removeEventListener: vi.fn(),
    };
    trigger(separator(), 'onPointerdown', {
      button: 0,
      clientX: 400,
      pointerId: 1,
      currentTarget: target,
      preventDefault: vi.fn(),
    });
    listeners.pointermove({ clientX: 350 });
    await nextTick();
    expect(props.sideWidth).toBe(338);
    listeners.pointercancel();
    await nextTick();
    expect(props.sideWidth).toBeNull();
  });
});
