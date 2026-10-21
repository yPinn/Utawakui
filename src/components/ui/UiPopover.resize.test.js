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
});
