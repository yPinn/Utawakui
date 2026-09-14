import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiColorField from './UiColorField.vue';
import UiField from './UiField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiField, './UiField.vue'],
  [UiColorField, './UiColorField.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function colorPicker(root) {
  return findAll(
    root,
    (node) => node.type === 'input' && node.props.type === 'color',
  )[0];
}

function hexInput(root) {
  return findAll(
    root,
    (node) => node.type === 'input' && node.props.type === 'text',
  )[0];
}

describe('UiColorField', () => {
  it('connects its label, hint, external description, and native text attrs', () => {
    const { app, root } = mount(UiColorField, {
      id: 'accent-color',
      label: '強調色',
      modelValue: '#AABBCC',
      hint: '使用六位色碼',
      name: 'accentColor',
      autocomplete: 'off',
      class: 'appearance-color',
      'data-control': 'accent-color',
      'aria-describedby': 'external-note',
    });
    const field = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-field'),
    )[0];
    const label = findAll(root, (node) => node.type === 'label')[0];
    const input = hexInput(root);
    const picker = colorPicker(root);

    expect(String(field.props.class)).toContain('appearance-color');
    expect(label.props.for).toBe('accent-color');
    expect(textContent(label)).toContain('強調色');
    expect(input.props).toMatchObject({
      id: 'accent-color',
      name: 'accentColor',
      value: '#AABBCC',
      maxlength: 7,
      pattern: '#[0-9A-Fa-f]{6}',
      'data-control': 'accent-color',
      'aria-describedby': 'external-note accent-color-hint',
    });
    expect(picker.props).toMatchObject({
      value: '#AABBCC',
      'aria-label': '強調色色票',
      'aria-describedby': 'external-note accent-color-hint',
    });
    app.unmount();
  });

  it('updates and commits only complete six-digit hex text values', async () => {
    const update = vi.fn();
    const commit = vi.fn();
    const { app, root } = mount(UiColorField, {
      id: 'ink-color',
      label: '文字顏色',
      modelValue: '#FFFFFF',
      'onUpdate:modelValue': update,
      onCommit: commit,
    });
    let input = hexInput(root);

    trigger(input, 'onInput', { target: { value: '#12' } });
    await nextTick();
    input = hexInput(root);
    expect(input.props.value).toBe('#12');
    expect(input.props['aria-invalid']).toBe(true);
    expect(colorPicker(root).props.value).toBe('#FFFFFF');
    expect(update).not.toHaveBeenCalled();
    expect(
      textContent(findAll(root, (node) => node.props.role === 'alert')[0]),
    ).toBe('請輸入 #RRGGBB 六位色碼');

    trigger(input, 'onChange', { target: { value: '#12' } });
    expect(commit).not.toHaveBeenCalled();

    trigger(input, 'onInput', { target: { value: '#12Ab34' } });
    await nextTick();
    input = hexInput(root);
    expect(input.props['aria-invalid']).toBeUndefined();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('#12Ab34');

    trigger(input, 'onChange', { target: { value: '#12Ab34' } });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith('#12Ab34');
    app.unmount();
  });

  it('keeps native picker input and commit events separate', async () => {
    const update = vi.fn();
    const commit = vi.fn();
    const { app, root } = mount(UiColorField, {
      id: 'echo-color',
      label: '回聲色',
      modelValue: '#112233',
      'onUpdate:modelValue': update,
      onCommit: commit,
    });
    const picker = colorPicker(root);

    trigger(picker, 'onInput', { target: { value: '#aabbcc' } });
    await nextTick();
    expect(update).toHaveBeenCalledWith('#aabbcc');
    expect(hexInput(root).props.value).toBe('#aabbcc');
    expect(commit).not.toHaveBeenCalled();

    trigger(picker, 'onChange', { target: { value: '#aabbcc' } });
    expect(commit).toHaveBeenCalledWith('#aabbcc');
    app.unmount();
  });

  it('disables both native controls and lets caller errors take precedence', () => {
    const { app, root } = mount(UiColorField, {
      id: 'paper-color',
      label: '紙張色',
      modelValue: '#F0EAD6',
      error: '這個色彩與樣板不相容',
      disabled: true,
    });
    const input = hexInput(root);
    const picker = colorPicker(root);
    const alert = findAll(root, (node) => node.props.role === 'alert')[0];

    expect(input.props.disabled).toBe(true);
    expect(picker.props.disabled).toBe(true);
    expect(input.props['aria-invalid']).toBe(true);
    expect(textContent(alert)).toBe('這個色彩與樣板不相容');
    app.unmount();
  });

  it('keeps an invalid draft exposed even when custom error copy is omitted', () => {
    const { app, root } = mount(UiColorField, {
      id: 'silent-color',
      label: '自訂色',
      modelValue: '#12',
      invalidMessage: '',
    });

    expect(hexInput(root).props['aria-invalid']).toBe(true);
    expect(findAll(root, (node) => node.props.role === 'alert')).toHaveLength(
      0,
    );
    app.unmount();
  });

  it('reuses UiField and field tokens without raw CSS colors or sizes', () => {
    const source = readFileSync(
      new URL('./UiColorField.vue', import.meta.url),
      'utf8',
    );
    const styles = source.match(/<style scoped>([\s\S]*)<\/style>/u)?.[1] ?? '';

    expect(source).toContain("import UiField from './UiField.vue'");
    for (const token of [
      '--ui-control-height',
      '--ui-field-border',
      '--ui-field-bg',
      '--ui-field-fg',
      '--ui-field-radius',
      '--ui-field-hex-value-inline-size',
      '--ui-font-size-sm',
      '--ui-color-focus',
    ]) {
      expect(styles).toContain(`var(${token})`);
    }
    expect(styles).toContain('-webkit-user-select: text;');
    expect(styles).toContain('user-select: text;');
    expect(styles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
    expect(styles).not.toMatch(/\b\d*\.?\d+(?:px|rem)\b/u);
  });

  it('caps the control group to its fixed-format value instead of filling the field', () => {
    const source = readFileSync(
      new URL('./UiColorField.vue', import.meta.url),
      'utf8',
    );
    const rule = source.match(/\.ui-color-field\s*\{([\s\S]*?)\}/u)?.[1] ?? '';

    expect(rule).toContain('inline-size: 100%');
    expect(rule).toContain('max-inline-size: calc(');
    expect(rule).toContain('var(--ui-control-height)');
    expect(rule).toContain('var(--ui-space-2)');
    expect(rule).toContain('var(--ui-field-hex-value-inline-size)');
    expect(rule).toContain(
      'grid-template-columns: var(--ui-control-height) minmax(0, 1fr)',
    );
  });
});
