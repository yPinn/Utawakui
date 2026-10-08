import { describe, expect, it, vi } from 'vitest';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
import ObsOutputColorField from './ObsOutputColorField.vue';
import UiButton from '../ui/UiButton.vue';
import UiColorField from '../ui/UiColorField.vue';
import UiField from '../ui/UiField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsOutputColorField,
  './ObsOutputColorField.vue',
  import.meta.url,
);
attachClientRender(
  ObsColorSwatchRail,
  './ObsColorSwatchRail.vue',
  import.meta.url,
);
attachClientRender(UiButton, '../ui/UiButton.vue', import.meta.url);
attachClientRender(UiColorField, '../ui/UiColorField.vue', import.meta.url);
attachClientRender(UiField, '../ui/UiField.vue', import.meta.url);

describe('ObsOutputColorField', () => {
  it('omits an empty recent-color rail', () => {
    const { app, root } = mount(ObsOutputColorField, {
      id: 'output-appearance-textColor',
      label: '文字色',
      modelValue: '#ffffff',
    });

    expect(
      findAll(root, (node) => node.props?.['aria-label'] === '最近使用色票'),
    ).toHaveLength(0);
    app.unmount();
  });

  it('applies and commits a recent color with selected and hex semantics', () => {
    const update = vi.fn();
    const commit = vi.fn();
    const { app, root } = mount(ObsOutputColorField, {
      id: 'output-appearance-textColor',
      label: '文字色',
      modelValue: '#aabbcc',
      recentColors: ['#aabbcc', '#112233'],
      'onUpdate:modelValue': update,
      onCommit: commit,
    });
    const rail = findAll(
      root,
      (node) => node.props?.['aria-label'] === '最近使用色票',
    )[0];
    const swatches = findAll(root, (node) => node.props?.['data-color']);

    expect(textContent(rail)).toContain('最近色票');
    expect(swatches).toHaveLength(2);
    expect(swatches[0].props).toMatchObject({
      'aria-label': '套用最近色票 #AABBCC',
      'aria-pressed': true,
      title: '#AABBCC',
    });
    trigger(swatches[1], 'onClick');
    expect(update).toHaveBeenCalledWith('#112233');
    expect(commit).toHaveBeenCalledWith('#112233');
    app.unmount();
  });

  it('shows one Output-scoped saved palette and toggles the current color', () => {
    const update = vi.fn();
    const commit = vi.fn();
    const toggleSavedColor = vi.fn();
    const { app, root } = mount(ObsOutputColorField, {
      id: 'output-appearance-accentColor',
      label: '強調色',
      modelValue: '#aabbcc',
      savedColors: ['#112233', '#aabbcc'],
      'onUpdate:modelValue': update,
      onCommit: commit,
      onToggleSavedColor: toggleSavedColor,
    });
    const palette = findAll(
      root,
      (node) => node.props?.['aria-label'] === 'Output 常用色票',
    )[0];
    const swatches = findAll(
      palette,
      (node) => node.props?.['data-color-source'] === 'saved',
    );
    const toggle = findAll(
      palette,
      (node) => node.props?.['aria-label'] === '從常用色移除 #AABBCC',
    )[0];

    expect(textContent(palette)).toContain('常用色');
    expect(swatches).toHaveLength(2);
    expect(swatches[1].props['aria-pressed']).toBe(true);
    trigger(swatches[0], 'onClick');
    expect(update).toHaveBeenCalledWith('#112233');
    expect(commit).toHaveBeenCalledWith('#112233');
    trigger(toggle, 'onClick');
    expect(toggleSavedColor).toHaveBeenCalledWith('#aabbcc');
    app.unmount();
  });

  it('keeps the saved palette discoverable when empty and disables adding when full', () => {
    const empty = mount(ObsOutputColorField, {
      id: 'output-appearance-textColor',
      label: '文字色',
      modelValue: '#ffffff',
    });
    expect(textContent(empty.root)).toContain('常用色');
    expect(textContent(empty.root)).toContain('尚未加入');
    expect(
      findAll(
        empty.root,
        (node) => node.props?.['aria-label'] === '加入常用色 #FFFFFF',
      ),
    ).toHaveLength(1);
    empty.app.unmount();

    const full = mount(ObsOutputColorField, {
      id: 'output-appearance-textColor',
      label: '文字色',
      modelValue: '#ffffff',
      savedColors: Array.from(
        { length: 8 },
        (_, index) => `#${String(index).padStart(6, '0')}`,
      ),
    });
    const fullAction = findAll(
      full.root,
      (node) => node.props?.['aria-label'] === '常用色已滿（最多 8 色）',
    )[0];
    expect(fullAction.props.disabled).toBe(true);
    full.app.unmount();
  });
});
