import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiCheckbox from './UiCheckbox.vue';
import UiField from './UiField.vue';
import UiProgress from './UiProgress.vue';
import UiRange from './UiRange.vue';
import UiSelect from './UiSelect.vue';
import UiTextarea from './UiTextarea.vue';
import UiTextField from './UiTextField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiField, './UiField.vue'],
  [UiCheckbox, './UiCheckbox.vue'],
  [UiProgress, './UiProgress.vue'],
  [UiRange, './UiRange.vue'],
  [UiSelect, './UiSelect.vue'],
  [UiTextarea, './UiTextarea.vue'],
  [UiTextField, './UiTextField.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('shared field accessibility and data flow', () => {
  it('connects label, external description, hint, native attributes, and updates', async () => {
    const update = vi.fn();
    const blur = vi.fn();
    const { app, root } = mount(UiTextField, {
      id: 'track-title',
      label: '歌曲名稱',
      hint: '使用本機檔案的正式名稱',
      modelValue: '初音',
      required: true,
      maxlength: 128,
      name: 'title',
      class: 'review-field',
      'data-control': 'track-title',
      inputmode: 'text',
      'aria-describedby': 'external-note track-title-hint',
      onBlur: blur,
      'onUpdate:modelValue': update,
    });

    const input = findAll(root, (node) => node.type === 'input')[0];
    const label = findAll(root, (node) => node.type === 'label')[0];
    const hint = findAll(
      root,
      (node) => node.props.id === 'track-title-hint',
    )[0];
    const fieldRoot = findAll(root, (node) =>
      String(node.props.class || '').includes('ui-field'),
    )[0];

    expect(String(fieldRoot.props.class)).toContain('review-field');
    expect(String(input.props.class)).not.toContain('review-field');
    expect(label.props.for).toBe('track-title');
    expect(textContent(label)).toContain('歌曲名稱');
    expect(input.props).toMatchObject({
      id: 'track-title',
      name: 'title',
      inputmode: 'text',
      'data-control': 'track-title',
      value: '初音',
      required: true,
      maxlength: 128,
      'aria-describedby': 'external-note track-title-hint',
    });
    expect(textContent(hint)).toBe('使用本機檔案的正式名稱');

    trigger(input, 'onInput', { target: { value: '新しい名前' } });
    trigger(input, 'onBlur', { target: input });
    await nextTick();
    expect(update).toHaveBeenCalledWith('新しい名前');
    expect(blur).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('replaces hint with an alert and exposes invalid state on the native control', () => {
    const { app, root } = mount(UiTextField, {
      id: 'artist',
      label: '歌手',
      hint: '原始標籤',
      error: '請輸入歌手名稱',
      invalid: true,
    });

    const input = findAll(root, (node) => node.type === 'input')[0];
    const alert = findAll(root, (node) => node.props.role === 'alert')[0];
    expect(input.props['aria-invalid']).toBe(true);
    expect(input.props['aria-describedby']).toBe('artist-error');
    expect(alert.props.id).toBe('artist-error');
    expect(textContent(alert)).toBe('請輸入歌手名稱');
    expect(
      findAll(root, (node) => node.props.id === 'artist-hint'),
    ).toHaveLength(0);
    app.unmount();
  });

  it('keeps textarea and select model values native and predictable', () => {
    const textareaUpdate = vi.fn();
    const textareaMount = mount(UiTextarea, {
      id: 'note',
      label: '備註',
      modelValue: '保留前奏',
      rows: 4,
      maxlength: 500,
      'onUpdate:modelValue': textareaUpdate,
    });
    const textarea = findAll(
      textareaMount.root,
      (node) => node.type === 'textarea',
    )[0];
    trigger(textarea, 'onInput', { target: { value: '新的備註' } });
    expect(textarea.props).toMatchObject({ rows: 4, maxlength: 500 });
    expect(textareaUpdate).toHaveBeenCalledWith('新的備註');
    textareaMount.app.unmount();

    const selectUpdate = vi.fn();
    const selectMount = mount(UiSelect, {
      id: 'mode',
      label: '模式',
      modelValue: 2,
      options: [
        { value: 1, label: '快速' },
        { value: 2, label: '一般' },
        { value: 3, label: '停用', disabled: true },
      ],
      'onUpdate:modelValue': selectUpdate,
    });
    const select = findAll(
      selectMount.root,
      (node) => node.type === 'select',
    )[0];
    const options = findAll(selectMount.root, (node) => node.type === 'option');
    trigger(select, 'onChange', { target: { value: '1' } });
    expect(select.props.value).toBe(2);
    expect(options[2].props.disabled).toBe(true);
    expect(selectUpdate).toHaveBeenCalledWith(1);
    selectMount.app.unmount();
  });

  it('emits checkbox checked state and range numeric values', () => {
    const checkboxUpdate = vi.fn();
    const checkboxMount = mount(UiCheckbox, {
      id: 'force',
      label: '強制重新分析',
      modelValue: false,
      hint: '忽略既有快取',
      'onUpdate:modelValue': checkboxUpdate,
    });
    const checkbox = findAll(
      checkboxMount.root,
      (node) => node.props.type === 'checkbox',
    )[0];
    trigger(checkbox, 'onChange', { target: { checked: true } });
    expect(checkbox.props['aria-describedby']).toBe('force-hint');
    expect(checkboxUpdate).toHaveBeenCalledWith(true);
    checkboxMount.app.unmount();

    const rangeUpdate = vi.fn();
    const rangeMount = mount(UiRange, {
      id: 'volume',
      label: '音量',
      modelValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      valueText: '50%',
      'onUpdate:modelValue': rangeUpdate,
    });
    const range = findAll(
      rangeMount.root,
      (node) => node.props.type === 'range',
    )[0];
    trigger(range, 'onInput', { target: { valueAsNumber: 0.7 } });
    expect(range.props).toMatchObject({
      min: 0,
      max: 1,
      step: 0.1,
      'aria-valuetext': '50%',
    });
    expect(rangeUpdate).toHaveBeenCalledWith(0.7);
    rangeMount.app.unmount();
  });

  it('renders determinate and indeterminate progress with accessible names', () => {
    const determinate = mount(UiProgress, {
      label: '匯入進度',
      value: 35,
      max: 100,
      valueText: '35%',
    });
    const progress = findAll(
      determinate.root,
      (node) => node.type === 'progress',
    )[0];
    expect(progress.props).toMatchObject({
      value: 35,
      max: 100,
      'aria-label': '匯入進度',
      'aria-valuetext': '35%',
    });
    determinate.app.unmount();

    const indeterminate = mount(UiProgress, {
      label: '正在準備',
      indeterminate: true,
    });
    const busy = findAll(
      indeterminate.root,
      (node) => node.type === 'progress',
    )[0];
    expect(busy.props.value).toBeUndefined();
    expect(busy.props['aria-busy']).toBe(true);
    indeterminate.app.unmount();
  });
});
