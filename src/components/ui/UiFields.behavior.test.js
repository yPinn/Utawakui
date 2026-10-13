import { nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiCheckbox from './UiCheckbox.vue';
import UiField from './UiField.vue';
import UiProgress from './UiProgress.vue';
import UiRange from './UiRange.vue';
import UiRangeControl from './range/UiRangeControl.vue';
import UiSelect from './UiSelect.vue';
import UiTextarea from './UiTextarea.vue';
import UiTextField from './UiTextField.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
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
  [UiRangeControl, './range/UiRangeControl.vue'],
  [UiSelect, './UiSelect.vue'],
  [UiTextarea, './UiTextarea.vue'],
  [UiTextField, './UiTextField.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('shared field accessibility and data flow', () => {
  it('projects an explicit title text role without changing the field contract', () => {
    const titleField = mount(UiTextField, {
      id: 'collection-title',
      label: '名稱',
      labelHidden: true,
      textRole: 'title',
    });
    const titleInput = findAll(
      titleField.root,
      (node) => node.type === 'input',
    )[0];

    expect(String(titleInput.props.class)).toContain('ui-text-field--title');
    titleField.app.unmount();

    const defaultField = mount(UiTextField, {
      id: 'collection-description',
      label: '描述',
    });
    const defaultInput = findAll(
      defaultField.root,
      (node) => node.type === 'input',
    )[0];
    expect(String(defaultInput.props.class)).not.toContain(
      'ui-text-field--title',
    );
    defaultField.app.unmount();
  });

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
    expect(String(textarea.props.class)).not.toContain('ui-textarea--bare');
    textareaMount.app.unmount();

    const bareMount = mount(UiTextarea, {
      id: 'paper-note',
      label: '便條內容',
      labelHidden: true,
      variant: 'bare',
    });
    const bareTextarea = findAll(
      bareMount.root,
      (node) => node.type === 'textarea',
    )[0];
    expect(String(bareTextarea.props.class)).toContain('ui-textarea--bare');
    bareMount.app.unmount();

    const fillMount = mount(UiTextarea, {
      id: 'full-height-note',
      label: '完整備註',
      class: 'review-note',
      fill: true,
      resize: 'none',
    });
    const fillField = findAll(fillMount.root, (node) =>
      String(node.props.class || '').includes('ui-field'),
    )[0];
    const fillTextarea = findAll(
      fillMount.root,
      (node) => node.type === 'textarea',
    )[0];
    expect(String(fillField.props.class)).toContain('review-note');
    expect(String(fillField.props.class)).toContain('ui-textarea-field--fill');
    expect(String(fillTextarea.props.class)).toContain('ui-textarea--fill');
    expect(String(fillTextarea.props.class)).toContain(
      'ui-textarea--resize-none',
    );
    fillMount.app.unmount();

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

  it('groups native select options without changing the selected value contract', () => {
    const update = vi.fn();
    const selectMount = mount(UiSelect, {
      id: 'source',
      label: '來源',
      modelValue: 'playlist-1',
      options: [
        { value: 'playback-order', label: '目前播放順序' },
        {
          label: '播放清單',
          options: [{ value: 'playlist-1', label: '演出歌單' }],
        },
        {
          label: '專輯',
          options: [{ value: 'album-1', label: '花皮', disabled: true }],
        },
      ],
      'onUpdate:modelValue': update,
    });
    const select = findAll(
      selectMount.root,
      (node) => node.type === 'select',
    )[0];
    const groups = findAll(
      selectMount.root,
      (node) => node.type === 'optgroup',
    );
    const options = findAll(selectMount.root, (node) => node.type === 'option');

    expect(groups.map(({ props }) => props.label)).toEqual([
      '播放清單',
      '專輯',
    ]);
    expect(options.map((option) => textContent(option))).toEqual([
      '目前播放順序',
      '演出歌單',
      '花皮',
    ]);
    expect(options[2].props.disabled).toBe(true);

    trigger(select, 'onChange', { target: { value: 'album-1' } });
    expect(update).toHaveBeenCalledWith('album-1');
    selectMount.app.unmount();
  });

  it('projects the optional range default and reset intent through the field compound', () => {
    const update = vi.fn();
    const reset = vi.fn();
    const { app, root } = mount(UiRange, {
      id: 'balance',
      label: '平衡',
      modelValue: 25,
      min: -100,
      max: 100,
      step: 5,
      defaultValue: 0,
      onReset: reset,
      'onUpdate:modelValue': update,
    });
    const range = findAll(root, (node) => node.props.type === 'range')[0];
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    trigger(range, 'onContextmenu', event);

    expect(update).toHaveBeenCalledWith(0);
    expect(reset).toHaveBeenCalledWith(0);
    app.unmount();
  });

  it('projects a mixed checkbox state without losing its accessible label', () => {
    const checkboxMount = mount(UiCheckbox, {
      id: 'select-visible',
      label: '選取搜尋結果',
      modelValue: false,
      indeterminate: true,
      labelHidden: true,
    });
    const checkbox = findAll(
      checkboxMount.root,
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    )[0];
    const indicator = findAll(checkboxMount.root, (node) =>
      String(node.props.class || '').includes('ui-checkbox__indicator'),
    )[0];

    expect(checkbox.props['aria-checked']).toBe('mixed');
    expect(checkbox.props['aria-label']).toBe('選取搜尋結果');
    expect(String(checkbox.props.class)).toContain('ui-checkbox__native');
    expect(checkbox.props.indeterminate).toBe(true);
    expect(indicator.props['aria-hidden']).toBe('true');
    expect(
      findAll(checkboxMount.root, (node) => node.type === 'label').some(
        (node) =>
          node.props.for === 'select-visible' &&
          textContent(node).includes('選取搜尋結果'),
      ),
    ).toBe(true);
    checkboxMount.app.unmount();
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
      valueText: '準備中',
      indeterminate: true,
    });
    const busy = findAll(
      indeterminate.root,
      (node) => node.type === 'progress',
    )[0];
    expect(busy.props.value).toBeUndefined();
    expect(busy.props['aria-valuetext']).toBeUndefined();
    expect(busy.props['aria-busy']).toBeUndefined();
    expect(textContent(indeterminate.root)).not.toContain('準備中');
    expect(
      findAll(indeterminate.root, (node) =>
        String(node.props.class ?? '').includes('ui-progress__fill'),
      ),
    ).toHaveLength(0);
    indeterminate.app.unmount();
  });

  it('can drop the visible copy while keeping the accessible name', () => {
    const { app, root } = mount(UiProgress, {
      label: '試聽進度',
      labelHidden: true,
      value: 3,
      max: 30,
      valueText: '0:03',
    });
    const progress = findAll(root, (node) => node.type === 'progress')[0];

    expect(progress.props['aria-label']).toBe('試聽進度');
    expect(textContent(root)).toBe('');
    app.unmount();
  });

  it('paints a hidden fill that glides sparse steps and snaps back', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const props = reactive({ label: '分析進度', value: 20, max: 80 });
    const { app, root } = mount(UiProgress, props);
    const fill = () =>
      findAll(root, (node) =>
        String(node.props.class ?? '').includes('ui-progress__fill'),
      )[0];
    const step = async (value, atMs) => {
      now = atMs;
      props.value = value;
      await nextTick();
    };

    expect(fill().props['aria-hidden']).toBe('true');
    expect(fill().props.style).toMatchObject({ '--ui-progress-ratio': 0.25 });

    await step(60, 1000);
    expect(fill().props.style).toMatchObject({ '--ui-progress-ratio': 0.75 });
    expect(fill().props.class).not.toContain('is-snapping');

    await step(0, 2000);
    expect(fill().props.style).toMatchObject({ '--ui-progress-ratio': 0 });
    expect(fill().props.class).toContain('is-snapping');

    await step(200, 3000);
    expect(fill().props.style).toMatchObject({ '--ui-progress-ratio': 1 });
    expect(fill().props.class).not.toContain('is-snapping');
    app.unmount();
    clock.mockRestore();
  });

  it('follows a continuous stream of updates without easing', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const props = reactive({ label: '試聽進度', value: 0, max: 30 });
    const { app, root } = mount(UiProgress, props);
    const fill = () =>
      findAll(root, (node) =>
        String(node.props.class ?? '').includes('ui-progress__fill'),
      )[0];

    // Frame-rate updates are already smooth; easing would only lag.
    for (const [value, atMs] of [
      [1, 1000],
      [1.016, 1016],
      [1.032, 1032],
    ]) {
      now = atMs;
      props.value = value;
      await nextTick();
    }
    expect(fill().props.class).toContain('is-snapping');

    // A later sparse step glides again.
    now = 2000;
    props.value = 10;
    await nextTick();
    expect(fill().props.class).not.toContain('is-snapping');
    app.unmount();
    clock.mockRestore();
  });
});
