import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiPopover from './UiPopover.vue';
import { attachClientRender, findAll, hostNode, mount } from './uiTestHost.js';

attachClientRender(UiPopover, './UiPopover.vue', import.meta.url);
let app;
let warn;
beforeEach(() => {
  const listeners = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  vi.stubGlobal('window', {
    ...listeners,
    innerWidth: 1280,
    innerHeight: 850,
    getComputedStyle: () => ({
      direction: 'ltr',
      fontSize: '16px',
      getPropertyValue: () => '',
    }),
  });
  vi.stubGlobal('document', { ...listeners, body: hostNode('body') });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  app?.unmount();
  warn.mockRestore();
  vi.unstubAllGlobals();
});

describe('UiPopover attribute fallthrough', () => {
  it('maximizes and restores the same panel and content without closing or discarding caller geometry', async () => {
    const view = mount(
      UiPopover,
      { open: true, panelStyle: { width: '32rem', translate: '10px 20px' } },
      { default: () => h('input', { 'aria-label': '草稿' }) },
    );
    app = view.app;
    await nextTick();
    const panel = findAll(
      view.overlayHost,
      (n) => n.props?.class === 'ui-popover',
    )[0];
    const input = findAll(panel, (n) => n.type === 'input')[0];
    const props = app._instance.subTree.component.props;
    props.maximized = true;
    await nextTick();
    expect(
      findAll(view.overlayHost, (n) => n.props?.class === 'ui-popover')[0],
    ).toBe(panel);
    expect(findAll(panel, (n) => n.type === 'input')[0]).toBe(input);
    expect(panel.props.style.width).toContain('100vw');
    expect(panel.props.style.translate).toBe('none');
    props.maximized = false;
    await nextTick();
    expect(panel.props.style.width).toBe('32rem');
    expect(panel.props.style.translate).toBe('10px 20px');
    expect(props.open).toBe(true);
  });
  it('places caller layout attributes on the in-flow anchor, not the panel', async () => {
    const view = mount(
      UiPopover,
      {
        open: true,
        ariaLabel: '曲目顯示密度',
        class: 'collection-action-rail__density',
        'data-slot': 'density',
      },
      {
        trigger: () => h('button', '密度'),
        default: () => h('p', '選項'),
      },
    );
    app = view.app;
    await nextTick();

    const withClass = findAll(
      view.root,
      (node) => node.props?.class === 'collection-action-rail__density',
    );
    const anchor = findAll(view.root, (node) =>
      String(node.props?.class ?? '').includes('ui-popover__anchor'),
    )[0];
    expect(anchor.props.class).toContain('collection-action-rail__density');
    expect(anchor.props['data-slot']).toBe('density');
    expect(withClass).toHaveLength(0);
    const panel = findAll(
      view.overlayHost,
      (node) => node.props?.class === 'ui-popover',
    )[0];
    expect(panel?.props['data-slot']).toBeUndefined();
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes('Extraneous non-props attributes'),
      ),
    ).toBe(false);
  });
});
