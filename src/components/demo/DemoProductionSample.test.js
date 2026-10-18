import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import DemoProductionSample from './DemoProductionSample.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [DemoProductionSample, './DemoProductionSample.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiTabs, '../ui/UiTabs.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}

describe('formal catalogue specimens', () => {
  it.each([
    ['select', 'ui-select'],
    ['tabs', 'ui-tabs'],
    ['chips', 'ui-chip'],
    ['hints', 'ui-hint'],
    ['notices', 'ui-notice'],
    ['status-icons', 'ui-status-icon'],
    ['marquee-text', 'ui-marquee'],
    ['track-rows', 'ui-track-row'],
  ])('renders %s through its formal primitive', async (kind, className) => {
    const html = await renderToString(
      createSSRApp(DemoProductionSample, { kind }),
    );
    expect(html).toContain(className);
    expect(html).not.toContain('demo-candidate-');
  });

  it('retains numeric values through the formal select update', async () => {
    const { app, root } = mount(DemoProductionSample, { kind: 'select' });
    const select = findAll(root, (node) => node.type === 'select')[0];
    trigger(select, 'onChange', { target: { value: '2' } });
    await nextTick();
    expect(select.props.value).toBe(2);
    expect(textContent(root)).toContain('目前值：2（數字）');
    app.unmount();
  });

  it('updates the notice from its action and removes the completed action', async () => {
    const { app, root } = mount(DemoProductionSample, { kind: 'notices' });
    const action = findAll(root, (node) => node.type === 'button')[0];
    trigger(action, 'onClick', {});
    await nextTick();
    expect(textContent(root)).toContain('範例已恢復');
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(0);
    app.unmount();
  });

  it('switches the real panel and keeps its label linked to the selected tab', async () => {
    const { app, root } = mount(DemoProductionSample, { kind: 'tabs' });
    const tabs = findAll(root, (node) => node.props.role === 'tab');
    trigger(tabs[0], 'onKeydown', { key: 'End', preventDefault: vi.fn() });
    await nextTick();
    expect(tabs[2].props.disabled).toBe(true);
    expect(tabs[1].props['aria-selected']).toBe(true);
    const panel = findAll(root, (node) => node.props.role === 'tabpanel')[0];
    expect(panel.props.id).toBe(tabs[1].props['aria-controls']);
    expect(panel.props['aria-labelledby']).toBe(tabs[1].props.id);
    expect(textContent(panel)).toBe('第二頁內容');
    app.unmount();
  });
});
