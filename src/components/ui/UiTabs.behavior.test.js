import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiTabs from './UiTabs.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

attachClientRender(UiTabs, './UiTabs.vue', import.meta.url);
attachClientRender(UiScrollRegion, './UiScrollRegion.vue', import.meta.url);

const source = readFileSync(new URL('./UiTabs.vue', import.meta.url), 'utf8');

const items = [
  { id: 'queue', label: '佇列' },
  { id: 'recent', label: '最近播放' },
];

describe('UiTabs', () => {
  it('keeps content-sized tabs from shrinking into overlapping labels when the rail overflows', () => {
    expect(source).toMatch(
      /\.ui-tabs__tab\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/su,
    );
    expect(source).toMatch(
      /\.ui-tabs--equal \.ui-tabs__tab\s*\{[^}]*flex:\s*1 1 0;/su,
    );
  });

  it('fills the available Bar rail without adding inter-tab gap or a shared divider', () => {
    expect(source).toMatch(
      /\.ui-tabs--bar\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;/su,
    );
    expect(source).toMatch(
      /\.ui-tabs--bar \.ui-tabs__scroll :deep\(\.ui-tabs__list\)\s*\{[^}]*gap:\s*0;/su,
    );
    expect(source).toMatch(
      /\.ui-tabs--bar \.ui-tabs__tab\s*\{[^}]*min-inline-size:\s*var\(--ui-control-height\);[^}]*justify-content:\s*center;[^}]*padding-inline:\s*var\(--ui-space-3\);[^}]*border-radius:\s*var\(--ui-radius-sm\) var\(--ui-radius-sm\) 0 0;/su,
    );
    expect(source).not.toMatch(
      /\.ui-tabs--bar\s*\{[^}]*border(?:-block-end)?:\s*var\(--ui-border-width\)/su,
    );
    expect(source).toMatch(
      /\.ui-tabs--bar \.ui-tabs__tab\.is-active\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--ui-color-accent\);/su,
    );
    expect(source).toMatch(
      /\.ui-tabs--bar \.ui-tabs__tab\.is-active::after\s*\{[^}]*right:\s*var\(--ui-space-2\);[^}]*left:\s*var\(--ui-space-2\);[^}]*background:\s*currentColor;/su,
    );
  });

  it('exposes an equal-width distribution contract without changing tab semantics', () => {
    const { app, root } = mount(UiTabs, {
      items,
      activeId: 'queue',
      ariaLabel: '播放清單檢視',
      tabIdPrefix: 'queue-panel',
      panelIdPrefix: 'queue-panel',
      distribution: 'equal',
    });
    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];

    expect(String(tablist.props.class)).toContain('ui-tabs--equal');
    expect(findAll(root, (node) => node.props.role === 'tab')).toHaveLength(2);
    app.unmount();
  });

  it('renders two true tabs with linked tabpanel ids', () => {
    const { app, root } = mount(UiTabs, {
      items,
      activeId: 'queue',
      ariaLabel: '播放清單檢視',
      tabIdPrefix: 'queue-panel',
      panelIdPrefix: 'queue-panel',
      variant: 'bar',
    });
    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const tabs = findAll(root, (node) => node.props.role === 'tab');

    expect(tablist.props['aria-label']).toBe('播放清單檢視');
    expect(tabs.map(textContent)).toEqual(['佇列', '最近播放']);
    expect(tabs[0].props['aria-selected']).toBe(true);
    expect(tabs[0].props['aria-controls']).toBe('queue-panel-queue-panel');
    expect(tabs[1].props['aria-controls']).toBe('queue-panel-recent-panel');
    app.unmount();
  });

  it('uses automatic activation and roving focus for arrow navigation', async () => {
    const onUpdate = vi.fn();
    const { app, root } = mount(UiTabs, {
      items,
      activeId: 'queue',
      ariaLabel: '播放清單檢視',
      tabIdPrefix: 'queue-panel',
      panelIdPrefix: 'queue-panel',
      variant: 'bar',
      'onUpdate:activeId': onUpdate,
    });
    const tabs = findAll(root, (node) => node.props.role === 'tab');

    trigger(tabs[0], 'onKeydown', {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    });
    await nextTick();

    expect(onUpdate).toHaveBeenCalledWith('recent');
    expect(tabs[1].focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('skips disabled items and supports Home and End navigation', async () => {
    const onUpdate = vi.fn();
    const navigationItems = [
      items[0],
      { id: 'disabled', label: '不可用', disabled: true },
      items[1],
    ];
    const { app, root } = mount(UiTabs, {
      items: navigationItems,
      activeId: 'queue',
      ariaLabel: '播放清單檢視',
      tabIdPrefix: 'queue-panel',
      panelIdPrefix: 'queue-panel',
      'onUpdate:activeId': onUpdate,
    });
    const tabs = findAll(root, (node) => node.props.role === 'tab');

    trigger(tabs[0], 'onKeydown', {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(onUpdate).toHaveBeenLastCalledWith('recent');
    expect(tabs[2].focus).toHaveBeenCalledOnce();

    trigger(tabs[0], 'onKeydown', {
      key: 'End',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(tabs[2].focus).toHaveBeenCalledTimes(2);

    trigger(tabs[2], 'onKeydown', {
      key: 'Home',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(tabs[0].focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
