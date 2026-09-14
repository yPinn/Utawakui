import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import UiField from './UiField.vue';
import UiSwitch from './UiSwitch.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';

for (const [component, filename] of [
  [UiField, './UiField.vue'],
  [UiSwitch, './UiSwitch.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function nativeSwitch(root) {
  return findAll(root, (node) => node.props?.role === 'switch')[0];
}

describe('UiSwitch', () => {
  it('renders a labeled native switch with field association', () => {
    const { app, root } = mount(UiSwitch, {
      id: 'auto-update',
      label: '自動更新',
      modelValue: false,
      hint: '關閉時可手動檢查更新',
    });
    const control = nativeSwitch(root);
    const label = findAll(root, (node) => node.type === 'label')[0];

    expect(control.props).toMatchObject({
      type: 'checkbox',
      role: 'switch',
      id: 'auto-update',
      checked: false,
      'aria-describedby': 'auto-update-hint',
    });
    expect(label.props.for).toBe('auto-update');
    app.unmount();
  });

  it('emits the toggled checked state and forwards required/disabled', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSwitch, {
      id: 'notifications',
      label: '通知',
      modelValue: false,
      required: true,
      'onUpdate:modelValue': update,
    });
    const control = nativeSwitch(root);

    expect(control.props.required).toBe(true);
    trigger(control, 'onChange', { target: { checked: true } });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(true);
    app.unmount();
  });

  it('does not emit when disabled', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSwitch, {
      id: 'locked',
      label: '鎖定設定',
      modelValue: false,
      disabled: true,
      'onUpdate:modelValue': update,
    });
    const control = nativeSwitch(root);

    expect(control.props.disabled).toBe(true);
    app.unmount();
    expect(update).not.toHaveBeenCalled();
  });

  it('exposes invalid state and an error message on the field', () => {
    const { app, root } = mount(UiSwitch, {
      id: 'confirm',
      label: '確認',
      modelValue: false,
      error: '必須先確認才能繼續',
      invalid: true,
    });
    const control = nativeSwitch(root);
    const alert = findAll(root, (node) => node.props?.role === 'alert')[0];

    expect(control.props['aria-invalid']).toBe(true);
    expect(control.props['aria-describedby']).toBe('confirm-error');
    expect(alert.props.id).toBe('confirm-error');
    app.unmount();
  });

  it('uses shared shape, state, focus, and motion tokens with a reduced-motion path', () => {
    const source = readFileSync(
      new URL('./UiSwitch.vue', import.meta.url),
      'utf8',
    );

    for (const token of [
      '--ui-switch-track-width',
      '--ui-switch-track-height',
      '--ui-switch-thumb-size',
      '--ui-switch-thumb-inset',
      '--ui-radius-pill',
      '--ui-color-accent',
      '--ui-color-accent-contrast',
      '--ui-color-border-strong',
      '--ui-color-focus',
      '--ui-focus-width',
      '--ui-opacity-disabled',
      '--ui-motion-duration-feedback',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toContain("data-ui-motion='reduced'");
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
