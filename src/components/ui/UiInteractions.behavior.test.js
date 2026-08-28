import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiSearchBox from './UiSearchBox.vue';
import UiTabs from './UiTabs.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiSearchBox, './UiSearchBox.vue'],
  [UiTabs, './UiTabs.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('shared UI interaction contracts', () => {
  it('keeps search labeling, native attributes, disabled state, and clearing explicit', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSearchBox, {
      id: 'library-search',
      label: '搜尋本機曲庫',
      modelValue: 'miku',
      disabled: true,
      name: 'query',
      class: 'review-strata__search',
      'data-control': 'library-query',
      'onUpdate:modelValue': update,
    });

    const input = findAll(root, (node) => node.type === 'input')[0];
    const label = findAll(root, (node) => node.type === 'label')[0];
    const clear = findAll(
      root,
      (node) => node.props?.['aria-label'] === '清除搜尋',
    )[0];
    const searchRoot = findAll(root, (node) =>
      String(node.props.class || '').includes('ui-search-box'),
    )[0];
    expect(String(searchRoot.props.class)).toContain('review-strata__search');
    expect(String(input.props.class)).not.toContain('review-strata__search');
    expect(label.props.for).toBe('library-search');
    expect(input.props).toMatchObject({
      id: 'library-search',
      name: 'query',
      'data-control': 'library-query',
      disabled: true,
    });
    expect(clear.props.disabled).toBe(true);
    trigger(clear, 'onClick');
    expect(update).not.toHaveBeenCalled();
    app.unmount();
  });

  it('turns a loading button into a disabled, announced action', () => {
    const { app, root } = mount(
      UiButton,
      { loading: true, loadingLabel: '正在儲存' },
      { default: () => '儲存' },
    );
    const button = findAll(root, (node) => node.type === 'button')[0];
    expect(button.props.disabled).toBe(true);
    expect(button.props['aria-busy']).toBe(true);
    expect(textContent(button)).toContain('正在儲存');
    expect(textContent(button)).not.toContain('儲存儲存');
    app.unmount();
  });

  it('implements roving tab focus and skips disabled tabs', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiTabs, {
      items: [
        { id: 'library', label: '曲庫' },
        { id: 'disabled', label: '停用', disabled: true },
        { id: 'queue', label: '佇列' },
      ],
      activeId: 'library',
      ariaLabel: '工作區',
      tabIdPrefix: 'workspace',
      panelIdPrefix: 'workspace',
      'onUpdate:activeId': update,
    });

    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const tabs = findAll(root, (node) => node.props.role === 'tab');
    expect(tablist.props['aria-label']).toBe('工作區');
    expect(tabs[0].props).toMatchObject({
      id: 'workspace-library-tab',
      'aria-controls': 'workspace-library-panel',
      'aria-selected': true,
      tabindex: 0,
    });
    expect(tabs[1].props.disabled).toBe(true);

    const event = { key: 'ArrowRight', preventDefault: vi.fn() };
    trigger(tabs[0], 'onKeydown', event);
    await nextTick();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    expect(tabs[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
