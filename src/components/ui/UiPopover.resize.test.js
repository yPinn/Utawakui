import { h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UiPopover from './UiPopover.vue';
import { attachClientRender, findAll, mount } from './uiTestHost.js';

attachClientRender(UiPopover, './UiPopover.vue', import.meta.url);
afterEach(() => vi.unstubAllGlobals());

describe('Popover dynamic anchor geometry', () => {
  it('keeps the bottom edge above its trigger when search content grows and disconnects on close', async () => {
    let resize;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const props = reactive({
      open: true,
      ariaLabel: '更換 BGM',
      placement: 'top-end',
    });
    const view = mount(UiPopover, props, {
      trigger: () => h('button', '更換'),
    });
    await nextTick();
    const anchor = findAll(
      view.root,
      (n) => n.props.class === 'ui-popover__anchor',
    )[0];
    const panel = findAll(
      view.overlayHost,
      (n) => n.props.role === 'dialog',
    )[0];
    let height = 80;
    anchor.getBoundingClientRect = () => ({
      left: 500,
      right: 540,
      top: 400,
      bottom: 432,
      width: 40,
      height: 32,
    });
    panel.getBoundingClientRect = () => ({ width: 320, height });
    vi.stubGlobal('window', {
      innerWidth: 960,
      innerHeight: 650,
      getComputedStyle: () => ({ direction: 'ltr' }),
    });
    resize();
    await nextTick();
    const firstBottom = parseFloat(panel.props.style.top) + height;
    height = 240;
    resize();
    await nextTick();
    expect(parseFloat(panel.props.style.top) + height).toBe(firstBottom);
    expect(firstBottom).toBeLessThan(400);
    props.open = false;
    await nextTick();
    expect(disconnect).toHaveBeenCalled();
    view.app.unmount();
  });

  it('fits an opted-in surface to the anchor width and the space above it', async () => {
    let resize;
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          resize = callback;
        }
        observe = observe;
        disconnect() {}
      },
    );
    const view = mount(UiPopover, {
      open: true,
      ariaLabel: '更換 BGM',
      placement: 'top-end',
      anchorGap: 0,
      viewportInset: 0,
      fitAnchor: true,
    });
    await nextTick();
    const [anchor] = findAll(
      view.root,
      (node) => node.props.class === 'ui-popover__anchor',
    );
    const [panel] = findAll(
      view.overlayHost,
      (node) => node.props.role === 'dialog',
    );
    anchor.getBoundingClientRect = () => ({
      left: 688,
      right: 960,
      top: 120,
      bottom: 120,
      width: 272,
      height: 0,
    });
    panel.getBoundingClientRect = () => ({ width: 320, height: 242 });
    vi.stubGlobal('window', {
      innerWidth: 960,
      innerHeight: 650,
      getComputedStyle: () => ({ direction: 'ltr' }),
    });

    resize();
    await nextTick();
    expect(
      observe.mock.calls.some(
        ([node]) => node.props.class === 'ui-popover__anchor',
      ),
    ).toBe(true);
    expect(panel.props.style).toMatchObject({
      inlineSize: '272px',
      maxInlineSize: '960px',
      maxBlockSize: '120px',
      left: '688px',
      top: 'auto',
      bottom: '530px',
    });
    view.app.unmount();
  });

  it('keeps the opted-in panel mounted and inert while closed', async () => {
    const props = reactive({
      open: true,
      ariaLabel: '更換 BGM',
      keepMounted: true,
    });
    const view = mount(UiPopover, props);
    await nextTick();
    const [panel] = findAll(
      view.overlayHost,
      (node) => node.props.role === 'dialog',
    );
    panel.getBoundingClientRect = () => ({ width: 272, height: 100 });

    props.open = false;
    await nextTick();
    expect(findAll(view.overlayHost, (node) => node === panel)).toHaveLength(1);
    expect(panel.props.inert).toBe(true);
    expect(panel.props['aria-hidden']).toBe(true);

    props.open = true;
    await nextTick();
    expect(panel.props.inert).toBe(false);
    view.app.unmount();
  });
});
