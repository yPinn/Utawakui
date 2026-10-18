import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoRadioGroupAppearance from './DemoRadioGroupAppearance.vue';
import DemoSwitchAppearance from './DemoSwitchAppearance.vue';
import DemoComboboxAppearance from './DemoComboboxAppearance.vue';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [DemoRadioGroupAppearance, './DemoRadioGroupAppearance.vue'],
  [DemoSwitchAppearance, './DemoSwitchAppearance.vue'],
  [DemoComboboxAppearance, './DemoComboboxAppearance.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiRadioGroup, '../ui/UiRadioGroup.vue'],
  [UiSwitch, '../ui/UiSwitch.vue'],
  [UiCombobox, '../ui/UiCombobox.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);

let body;
const byId = (root, id) => findAll(root, (node) => node.props?.id === id)[0];
const resetButton = (root, attr) =>
  findAll(root, (node) => node.type === 'button' && attr in node.props)[0];
const change = async (node, checked) => {
  trigger(node, 'onChange', { target: { checked } });
  await nextTick();
};
const press = async (node, key, extras = {}) => {
  trigger(node, 'onKeydown', {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extras,
  });
  await nextTick();
};

beforeEach(() => {
  body = hostNode('body');
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 850,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame() {},
    getComputedStyle: () => ({
      fontSize: '16px',
      direction: 'ltr',
      getPropertyValue: () => '',
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('formal input catalogue recovery', () => {
  it('keeps numeric and string Radio choices distinct in the actual state page', async () => {
    const { app, root } = mount(DemoRadioGroupAppearance);
    const numeric = findAll(
      root,
      (node) => node.props?.['data-radio-state'] === 'numeric',
    )[0];
    const controls = findAll(numeric, (node) => node.type === 'input');
    expect(controls[0].props.id).not.toBe(controls[1].props.id);
    expect(controls.map((node) => node.props.checked)).toEqual([true, false]);
    trigger(controls[1], 'onChange');
    await nextTick();
    expect(controls.map((node) => node.props.checked)).toEqual([false, true]);
    trigger(controls[0], 'onChange');
    await nextTick();
    expect(controls.map((node) => node.props.checked)).toEqual([true, false]);
    app.unmount();
  });

  it('unlocks RadioGroup, preserves its value when locked, and resets the example', async () => {
    const { app, root } = mount(DemoRadioGroupAppearance);
    const radios = () =>
      findAll(
        byId(root, 'demo-radio-recovery'),
        (node) => node.type === 'input',
      );
    expect(radios().every((node) => node.props.disabled)).toBe(true);
    await change(byId(root, 'demo-radio-unlock'), true);
    expect(radios()[1].props.disabled).toBeFalsy();
    trigger(radios()[1], 'onChange');
    await nextTick();
    expect(radios()[1].props.checked).toBe(true);
    await change(byId(root, 'demo-radio-unlock'), false);
    trigger(radios()[0], 'onChange');
    await nextTick();
    expect(radios()[1].props.checked).toBe(true);
    trigger(resetButton(root, 'data-radio-reset'), 'onClick');
    await nextTick();
    expect(radios()[0].props.checked).toBe(true);
    expect(radios().every((node) => node.props.disabled)).toBe(true);
    app.unmount();
  });

  it('clears and restores Switch errors from the value, independently of lock state', async () => {
    const { app, root } = mount(DemoSwitchAppearance);
    const control = () => byId(root, 'demo-switch-recovery');
    expect(control().props['aria-invalid']).toBe(true);
    await change(control(), true);
    expect(control().props['aria-invalid']).toBeUndefined();
    expect(control().props['aria-describedby']).toBe(
      'demo-switch-recovery-hint',
    );
    await change(byId(root, 'demo-switch-lock'), true);
    expect(control().props.disabled).toBe(true);
    expect(control().props.checked).toBe(true);
    await change(byId(root, 'demo-switch-lock'), false);
    await change(control(), false);
    expect(control().props['aria-invalid']).toBe(true);
    await change(byId(root, 'demo-switch-lock'), true);
    expect(control().props['aria-invalid']).toBe(true);
    trigger(resetButton(root, 'data-switch-reset'), 'onClick');
    await nextTick();
    expect(control().props.disabled).toBe(false);
    expect(control().props['aria-invalid']).toBe(true);
    app.unmount();
  });

  it('restores an editable Combobox after no results without committing free text', async () => {
    const { app, root } = mount(DemoComboboxAppearance);
    const control = byId(root, 'demo-combobox-editable-flat');
    trigger(control, 'onInput', { target: { value: '完全不存在的來源' } });
    await nextTick();
    expect(textContent(body)).toContain('沒有符合的來源');
    await press(control, 'Enter');
    expect(control.props['aria-expanded']).toBe(true);
    await press(control, 'Escape');
    expect(control.props.value).toBe('本機曲庫');
    expect(control.props['aria-expanded']).toBe(false);
    app.unmount();
  });

  it('recovers both Combobox modes, locks after blur, and resets transient query and errors', async () => {
    const { app, root } = mount(DemoComboboxAppearance);
    const editable = () => byId(root, 'demo-combobox-recovery-editable');
    const selectOnly = () => byId(root, 'demo-combobox-recovery-select-only');
    trigger(editable(), 'onInput', { target: { value: '花皮' } });
    await nextTick();
    trigger(editable(), 'onCompositionstart');
    await press(editable(), 'Enter', { isComposing: true });
    expect(editable().props['aria-invalid']).toBe(true);
    trigger(editable(), 'onCompositionend');
    await press(editable(), 'Enter', { keyCode: 229 });
    expect(editable().props['aria-invalid']).toBe(true);
    await press(editable(), 'Enter');
    expect(editable().props['aria-invalid']).toBeUndefined();
    expect(editable().props.value).toContain('花皮');
    await press(selectOnly(), 'ArrowDown');
    await press(selectOnly(), 'Enter');
    expect(selectOnly().type).toBe('button');
    expect(selectOnly().props['aria-invalid']).toBeUndefined();
    trigger(editable(), 'onClick');
    await nextTick();
    expect(editable().props['aria-expanded']).toBe(true);
    // Clicking the separate lock switch first blurs the active input in a browser.
    trigger(editable(), 'onBlur');
    await change(byId(root, 'demo-combobox-lock'), true);
    expect(editable().props.disabled).toBe(true);
    expect(editable().props['aria-expanded']).toBe(false);
    expect(selectOnly().props.disabled).toBe(true);
    expect(editable().props['aria-invalid']).toBeUndefined();
    await change(byId(root, 'demo-combobox-lock'), false);
    trigger(editable(), 'onInput', { target: { value: 'pending query' } });
    await nextTick();
    trigger(resetButton(root, 'data-combobox-reset'), 'onClick');
    await nextTick();
    for (const control of [editable(), selectOnly()]) {
      expect(control.props.disabled).toBe(false);
      expect(control.props['aria-invalid']).toBe(true);
      expect(control.props['aria-expanded']).toBe(false);
    }
    expect(editable().props.value).toBe('');
    app.unmount();
  });
});
