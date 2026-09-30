import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiSegmentedControl from './UiSegmentedControl.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

attachClientRender(
  UiSegmentedControl,
  './UiSegmentedControl.vue',
  import.meta.url,
);
attachClientRender(UiScrollRegion, './UiScrollRegion.vue', import.meta.url);

const ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'disabled', label: '停用', disabled: true },
  { id: 'queue', label: '佇列' },
];

function radioGroup(root) {
  return findAll(root, (node) => node.props?.role === 'radiogroup')[0];
}

function radios(root) {
  return findAll(root, (node) => node.props?.role === 'radio');
}

describe('UiSegmentedControl', () => {
  it('renders one named radio group with one enabled tab stop', () => {
    const { app, root } = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      class: 'workspace-mode',
      'data-control': 'workspace-mode',
    });
    const group = radioGroup(root);
    const options = radios(root);

    expect(String(group.props.class)).toContain('workspace-mode');
    expect(group.props).toMatchObject({
      'aria-label': '工作區模式',
      'aria-orientation': 'horizontal',
      'data-control': 'workspace-mode',
    });
    expect(options).toHaveLength(3);
    expect(options[0].props).toMatchObject({
      'aria-checked': true,
      tabindex: 0,
      disabled: false,
    });
    expect(options[1].props).toMatchObject({
      'aria-checked': false,
      tabindex: -1,
      disabled: true,
      'aria-disabled': true,
    });
    expect(options[2].props).toMatchObject({
      'aria-checked': false,
      tabindex: -1,
      disabled: false,
    });
    expect(textContent(options[2])).toBe('佇列');
    app.unmount();
  });

  it('emits only a changed, enabled selection', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      'onUpdate:modelValue': update,
    });
    const options = radios(root);

    trigger(options[0], 'onClick');
    trigger(options[1], 'onClick');
    trigger(options[2], 'onClick');

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    app.unmount();
  });

  it('removes every option from the tab order when the group is disabled', () => {
    const update = vi.fn();
    const { app, root } = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      disabled: true,
      'onUpdate:modelValue': update,
    });
    const options = radios(root);

    expect(options.every((option) => option.props.disabled)).toBe(true);
    expect(options.every((option) => option.props.tabindex === -1)).toBe(true);
    trigger(options[2], 'onClick');
    expect(update).not.toHaveBeenCalled();
    app.unmount();
  });

  it('moves selection and focus with arrows while skipping disabled items', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      'onUpdate:modelValue': update,
    });
    const options = radios(root);
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    trigger(options[0], 'onKeydown', event);
    await nextTick();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    expect(options[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('supports Home, End, vertical metadata, and RTL arrow order', async () => {
    const rtlUpdate = vi.fn();
    const rtlMount = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      orientation: 'vertical',
      dir: 'rtl',
      'onUpdate:modelValue': rtlUpdate,
    });
    const group = radioGroup(rtlMount.root);
    const rtlOptions = radios(rtlMount.root);

    expect(group.props['aria-orientation']).toBe('vertical');
    trigger(rtlOptions[0], 'onKeydown', {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(rtlUpdate).toHaveBeenCalledWith('queue');
    expect(rtlOptions[2].focus).toHaveBeenCalledOnce();
    rtlMount.app.unmount();

    const homeUpdate = vi.fn();
    const homeMount = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'queue',
      ariaLabel: '工作區模式',
      'onUpdate:modelValue': homeUpdate,
    });
    const homeOptions = radios(homeMount.root);
    trigger(homeOptions[2], 'onKeydown', {
      key: 'Home',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(homeUpdate).toHaveBeenCalledWith('library');
    expect(homeOptions[0].focus).toHaveBeenCalledOnce();
    homeMount.app.unmount();

    const endUpdate = vi.fn();
    const endMount = mount(UiSegmentedControl, {
      items: ITEMS,
      modelValue: 'library',
      ariaLabel: '工作區模式',
      'onUpdate:modelValue': endUpdate,
    });
    const endOptions = radios(endMount.root);
    trigger(endOptions[0], 'onKeydown', {
      key: 'End',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(endUpdate).toHaveBeenCalledWith('queue');
    expect(endOptions[2].focus).toHaveBeenCalledOnce();
    endMount.app.unmount();
  });

  it('uses shared control, state, focus, motion, and selection tokens', () => {
    const source = readFileSync(
      new URL('./UiSegmentedControl.vue', import.meta.url),
      'utf8',
    );

    for (const token of [
      '--ui-control-height',
      '--ui-color-surface-selected',
      '--ui-color-accent',
      '--ui-color-focus',
      '--ui-motion-duration-feedback',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toContain('-webkit-user-select: none;');
    expect(source).toContain('user-select: none;');
    expect(source).toMatch(
      /\.ui-segmented-control__option--selected\s*\{[^}]*font-weight:\s*var\(--ui-font-weight-bold\);/su,
    );
    expect(source).toContain('<UiScrollRegion');
    expect(source).toContain(
      "orientation === 'horizontal' ? 'auto' : 'hidden'",
    );
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
