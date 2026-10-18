import { nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiSearchBox from './UiSearchBox.vue';
import UiTooltip from './UiTooltip.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';

attachClientRender(UiSearchBox, './UiSearchBox.vue', import.meta.url);
attachClientRender(UiTooltip, './UiTooltip.vue', import.meta.url);
attachClientRender(
  UiTooltipSurface,
  './tooltip/UiTooltipSurface.vue',
  import.meta.url,
);

describe('UiSearchBox native input and clear recovery', () => {
  it('keeps long text editable through icon-cell, width and clear recovery', async () => {
    const long = '中文／日本語／A long search query '.repeat(8);
    const props = reactive({
      modelValue: long,
      iconCell: false,
      style: { width: '180px' },
    });
    props['onUpdate:modelValue'] = (value) => (props.modelValue = value);
    const { app, root } = mount(UiSearchBox, props);
    const input = findAll(root, (node) => node.type === 'input')[0];
    expect(input.props.value).toBe(long);
    props.iconCell = true;
    props.style = { width: '360px' };
    await nextTick();
    expect(input.props.value).toBe(long);
    const clear = findAll(root, (node) => node.type === 'button')[0];
    trigger(clear, 'onClick', {});
    await nextTick();
    expect(input.props.value).toBe('');
    expect(input.focus).toHaveBeenCalledOnce();
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(0);
    trigger(input, 'onInput', { target: { value: long } });
    await nextTick();
    expect(input.props.value).toBe(long);
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(1);
    app.unmount();
  });

  it('restores focus to the input when clearing removes the focused action', async () => {
    const props = reactive({ modelValue: '夏霞' });
    props['onUpdate:modelValue'] = (value) => (props.modelValue = value);
    const { app, root } = mount(UiSearchBox, props);
    const input = findAll(root, (node) => node.type === 'input')[0];
    const clear = findAll(root, (node) => node.type === 'button')[0];
    trigger(clear, 'onClick', {});
    await nextTick();
    expect(props.modelValue).toBe('');
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(0);
    expect(input.focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps native attributes and label attached through identity and value changes', async () => {
    const update = vi.fn();
    const props = reactive({
      id: 'search-one',
      modelValue: '',
      label: '曲目搜尋',
      'aria-describedby': 'search-help',
      name: 'query',
      class: 'caller',
      'onUpdate:modelValue': update,
    });
    const { app, root } = mount(UiSearchBox, props);
    const input = () => findAll(root, (node) => node.type === 'input')[0];
    const label = () => findAll(root, (node) => node.type === 'label')[0];
    expect(input().props).toMatchObject({
      id: 'search-one',
      name: 'query',
      'aria-describedby': 'search-help',
      type: 'search',
    });
    expect(input().props.class).not.toContain('caller');
    trigger(input(), 'onInput', { target: { value: '日本語 中文' } });
    expect(update).toHaveBeenCalledWith('日本語 中文');
    props.id = 'search-two';
    props.modelValue = '更新';
    await nextTick();
    expect(label().props.for).toBe('search-two');
    expect(input().props.id).toBe('search-two');
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(1);
    app.unmount();
  });

  it('blocks clearing while disabled and recovers after enabling', async () => {
    const update = vi.fn();
    const props = reactive({
      modelValue: '夏霞',
      disabled: true,
      'onUpdate:modelValue': update,
    });
    const { app, root } = mount(UiSearchBox, props);
    const input = findAll(root, (node) => node.type === 'input')[0];
    const clear = () => findAll(root, (node) => node.type === 'button')[0];
    expect(input.props.disabled).toBe(true);
    expect(clear().props.disabled).toBe(true);
    trigger(clear(), 'onClick', {});
    expect(update).not.toHaveBeenCalled();
    expect(input.focus).not.toHaveBeenCalled();
    props.disabled = false;
    await nextTick();
    trigger(clear(), 'onClick', {});
    expect(update).toHaveBeenCalledWith('');
    expect(input.focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
