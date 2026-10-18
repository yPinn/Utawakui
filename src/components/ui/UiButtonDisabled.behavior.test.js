import { readFileSync } from 'node:fs';
import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiIconButton from './UiIconButton.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { Download } from '../../icons/index.js';
import { attachClientRender, findAll, mount } from './uiTestHost.js';

for (const [component, file] of [
  [UiButton, './UiButton.vue'],
  [UiIconButton, './UiIconButton.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}
const button = (root) => findAll(root, (node) => node.type === 'button')[0];
const guard = (node, name) => [node.props[name]].flat()[0];
const event = (type, key) => ({
  type,
  key,
  preventDefault: vi.fn(),
  stopImmediatePropagation: vi.fn(),
});

describe.each([
  ['UiButton', UiButton],
  ['UiIconButton', UiIconButton],
])('%s disabled activation', (filename, Component) => {
  it.each([true, 'true'])(
    'guards %s before caller capture handlers while preserving focus attributes',
    (ariaDisabled) => {
      const caller = vi.fn();
      const { app, root } = mount(Component, {
        icon: Download,
        label: '下載',
        'aria-disabled': ariaDisabled,
        tabindex: 0,
        'aria-describedby': 'reason',
        onClick: caller,
        onClickCapture: caller,
        onKeydownCapture: caller,
        onKeyupCapture: caller,
      });
      const control = button(root);
      expect(control.props.disabled).toBe(false);
      expect(control.props.tabindex).toBe(0);
      expect(control.props['aria-describedby']).toBe('reason');
      for (const [handler, type, key] of [
        ['onClickCapture', 'click'],
        ['onKeydownCapture', 'keydown', 'Enter'],
        ['onKeydownCapture', 'keydown', ' '],
        ['onKeyupCapture', 'keyup', 'Enter'],
        ['onKeyupCapture', 'keyup', ' '],
      ]) {
        const activation = event(type, key);
        expect(guard(control, handler)).not.toBe(caller);
        guard(control, handler)(activation);
        expect(activation.preventDefault).toHaveBeenCalledOnce();
        expect(activation.stopImmediatePropagation).toHaveBeenCalledOnce();
      }
      expect(caller).not.toHaveBeenCalled();
      app.unmount();
    },
  );

  it('does not consume Tab, Escape, focus or Tooltip forwarding', () => {
    const focus = vi.fn();
    const { app, root } = mount(Component, {
      icon: Download,
      label: '下載',
      title: '稍後再試',
      'aria-disabled': true,
      onFocusin: focus,
    });
    const control = button(root);
    for (const key of ['Tab', 'Escape', 'ArrowDown']) {
      const navigation = event('keydown', key);
      expect(guard(control, 'onKeydownCapture')).toBeTypeOf('function');
      guard(control, 'onKeydownCapture')(navigation);
      expect(navigation.preventDefault).not.toHaveBeenCalled();
      expect(navigation.stopImmediatePropagation).not.toHaveBeenCalled();
    }
    expect([control.props.onFocusin].flat()).toContain(focus);
    expect(control.props.onPointerenter).toBeTypeOf('function');
    app.unmount();
  });

  it('restores activation after aria-disabled is cleared without changing native disabled/loading', async () => {
    const state = reactive({
      'aria-disabled': 'false',
      disabled: false,
      loading: false,
    });
    const { app, root } = mount({
      render: () => h(Component, { ...state, icon: Download, label: '下載' }),
    });
    for (const props of [
      {},
      { 'aria-disabled': true },
      { 'aria-disabled': false },
      { disabled: true },
      { disabled: false, loading: true },
      { loading: false },
    ]) {
      Object.assign(state, props);
      await nextTick();
      const activation = event('click');
      expect(guard(button(root), 'onClickCapture')).toBeTypeOf('function');
      guard(button(root), 'onClickCapture')(activation);
      const blocked =
        state['aria-disabled'] === true || state.disabled || state.loading;
      expect(activation.preventDefault).toHaveBeenCalledTimes(blocked ? 1 : 0);
      expect(button(root).props.disabled).toBe(state.disabled || state.loading);
    }
    app.unmount();
  });

  it('excludes aria-disabled from every hover/pressed rule and retains shared focus/disabled tokens', () => {
    const source = readFileSync(
      new URL(`./${filename}.vue`, import.meta.url),
      'utf8',
    );
    for (const rule of source.matchAll(/([^{}]+)\{[^{}]*\}/gu)) {
      for (const selector of rule[1].split(',')) {
        if (/:(?:hover|active)\b/u.test(selector)) {
          expect(selector).toMatch(/:not\(\s*\[aria-disabled='true'\]\s*\)/u);
        }
      }
    }
    expect(source).toContain('opacity: var(--ui-opacity-disabled);');
    expect(source).toContain(
      'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
    );
  });
});
