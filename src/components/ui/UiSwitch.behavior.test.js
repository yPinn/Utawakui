import { readFileSync } from 'node:fs';
import { h, nextTick, reactive } from 'vue';
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
  it.each([false, true])(
    'restores validation independently of checked=%s and disabled',
    async (checked) => {
      const state = reactive({
        modelValue: checked,
        invalid: false,
        error: '',
        disabled: false,
      });
      const update = vi.fn();
      const { app, root } = mount({
        render: () =>
          h(UiSwitch, {
            ...state,
            id: 'recover',
            label: '自動更新',
            hint: '可隨時調整',
            'onUpdate:modelValue': update,
          }),
      });
      const assertState = (invalid, describedBy) => {
        const control = nativeSwitch(root);
        expect(control.props['aria-invalid']).toBe(invalid || undefined);
        expect(control.props['aria-describedby']).toBe(describedBy);
        expect(control.props.checked).toBe(state.modelValue);
        expect(control.props.disabled).toBe(state.disabled);
        expect(update).not.toHaveBeenCalled();
      };
      assertState(false, 'recover-hint');
      state.error = '設定暫時不可用';
      await nextTick();
      assertState(true, 'recover-error');
      state.disabled = true;
      await nextTick();
      assertState(true, 'recover-error');
      state.error = '';
      state.invalid = true;
      await nextTick();
      assertState(true, 'recover-hint');
      state.modelValue = !checked;
      await nextTick();
      assertState(true, 'recover-hint');
      state.invalid = false;
      await nextTick();
      assertState(false, 'recover-hint');
      state.disabled = false;
      await nextTick();
      assertState(false, 'recover-hint');
      state.error = '設定再次失效';
      await nextTick();
      assertState(true, 'recover-error');
      app.unmount();
    },
  );

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
      '--ui-color-control-boundary',
      '--ui-color-danger',
      '--ui-color-focus',
      '--ui-focus-width',
      '--ui-opacity-disabled',
      '--ui-motion-duration-feedback',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).not.toContain("data-ui-motion='reduced'");
    expect(source).not.toContain('prefers-reduced-motion: reduce');
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
