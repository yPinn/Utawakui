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

const items = [
  { id: 'queue', label: '佇列' },
  { id: 'recent', label: '最近播放' },
];

describe('UiTabs bar variant', () => {
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
});
