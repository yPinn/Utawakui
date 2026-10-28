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
