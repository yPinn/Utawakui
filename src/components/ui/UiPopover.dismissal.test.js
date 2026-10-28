import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiPopover from './UiPopover.vue';
import { attachClientRender, findAll, hostNode, mount } from './uiTestHost.js';

attachClientRender(UiPopover, './UiPopover.vue', import.meta.url);
let app;
let events;
beforeEach(() => {
  events = new Map();
  const addEventListener = (type, handler) => events.set(type, handler);
  const removeEventListener = (type, handler) => {
    if (events.get(type) === handler) events.delete(type);
  };
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 850,
    addEventListener,
    removeEventListener,
    getComputedStyle: () => ({
      direction: 'ltr',
      fontSize: '16px',
      getPropertyValue: () => '',
    }),
  });
  vi.stubGlobal('document', {
    body: hostNode('body'),
    addEventListener,
    removeEventListener,
  });
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});
function setup(closeOnScroll, closeOnOutsidePointer) {
  const close = vi.fn();
  const view = mount(
    UiPopover,
    {
      open: true,
      ariaLabel: '歌詞顯示設定',
      onClose: close,
      ...(closeOnScroll === undefined ? {} : { closeOnScroll }),
      ...(closeOnOutsidePointer === undefined ? {} : { closeOnOutsidePointer }),
    },
    {
      trigger: () => h('button', '顯示'),
      default: () => h('button', '調整字級'),
    },
  );
  app = view.app;
  return { ...view, close };
}

describe('Popover dismissal policy', () => {
  it('keeps reference tools open on outside pointer while retaining Escape', async () => {
    const { close } = setup(false, false);
    await nextTick();
    events.get('pointerdown')({ target: hostNode('lyrics-editor') });
    expect(close).not.toHaveBeenCalled();
    events.get('keydown')({ key: 'Escape', target: hostNode('outside') });
    expect(close).toHaveBeenCalledWith('escape');
  });
  it('retains the existing scroll dismissal default', async () => {
    const { close } = setup();
    await nextTick();
    events.get('scroll')({ target: hostNode('lyrics') });
    expect(close).toHaveBeenCalledWith('external-scroll');
  });

  it('keeps settings open through background and control-induced scrolls, while preserving deliberate dismissal', async () => {
    const { close, root, overlayHost } = setup(false);
    await nextTick();
    const panel = findAll(
      overlayHost,
      (node) => node.props.role === 'dialog',
    )[0];
    const anchor = findAll(
      root,
      (node) => node.props.class === 'ui-popover__anchor',
    )[0];
    anchor.getBoundingClientRect = () => ({
      left: 300,
      right: 340,
      top: 150,
      bottom: 180,
      width: 40,
      height: 30,
    });
    events.get('scroll')({ target: hostNode('lyrics-auto-scroll') });
    events.get('scroll')({ target: hostNode('reading-layout-scroll') });
    events.get('scroll')({ target: window });
    await nextTick();
    expect(close).not.toHaveBeenCalled();
    expect(parseFloat(panel.props.style.top)).toBeGreaterThan(180);
    events.get('pointerdown')({ target: hostNode('outside') });
    expect(close).toHaveBeenCalledWith('outside-pointer');
    events.get('keydown')({
      key: 'Escape',
      target: panel,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(close).toHaveBeenCalledWith('escape');
  });
});
