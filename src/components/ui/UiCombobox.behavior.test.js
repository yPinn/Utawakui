import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiCombobox from './UiCombobox.vue';
import UiField from './UiField.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiField, './UiField.vue'],
  [UiCombobox, './UiCombobox.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const ITEMS = [
  { value: 'lrclib', label: 'LRCLIB' },
  { value: 'netease', label: 'NetEase' },
  { value: 'musixmatch', label: 'Musixmatch', disabled: true },
  { value: 'better-lyrics', label: 'Better Lyrics' },
];

let body;

beforeEach(() => {
  body = hostNode('body');
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({
      fontSize: '16px',
      direction: 'ltr',
      getPropertyValue: () => '',
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function input(root) {
  return findAll(root, (node) => node.props?.role === 'combobox')[0];
}

function options() {
  return findAll(body, (node) => node.props?.role === 'option');
}

function emptyMessage() {
  return findAll(body, (node) => node.props?.role === 'presentation')[0];
}

describe('UiCombobox', () => {
  it('renders a labeled, closed combobox with the selected label as its value', () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: 'netease',
      items: ITEMS,
    });
    const control = input(root);
    const label = findAll(root, (node) => node.type === 'label')[0];

    expect(control.props).toMatchObject({
      role: 'combobox',
      value: 'NetEase',
      'aria-expanded': false,
      'aria-controls': 'lyrics-source-listbox',
    });
    expect(label.props.for).toBe('lyrics-source');
    expect(options()).toHaveLength(0);
    app.unmount();
  });

  it('opens and filters the list as the user types', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: 'lyr' } });
    await nextTick();

    expect(control.props['aria-expanded']).toBe(true);
    const filtered = options();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].props.id).toBe('lyrics-source-option-better-lyrics');
    app.unmount();
  });

  it('moves the highlighted option with arrows while skipping disabled entries', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
    });
    const control = input(root);

    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(control.props['aria-activedescendant']).toBe(
      'lyrics-source-option-lrclib',
    );

    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(control.props['aria-activedescendant']).toBe(
      'lyrics-source-option-netease',
    );

    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(control.props['aria-activedescendant']).toBe(
      'lyrics-source-option-better-lyrics',
    );
    app.unmount();
  });

  it('commits the highlighted option on Enter and updates the value', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
      'onUpdate:modelValue': update,
    });
    const control = input(root);

    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    await nextTick();
    trigger(control, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    await nextTick();

    expect(update).toHaveBeenCalledWith('lrclib');
    expect(control.props['aria-expanded']).toBe(false);
    expect(control.props.value).toBe('LRCLIB');
    app.unmount();
  });

  it('selects on option click without a handler-side blur race', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
      'onUpdate:modelValue': update,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: '' } });
    await nextTick();
    const [lrclibOption] = options();

    trigger(lrclibOption, 'onMousedown', { preventDefault: vi.fn() });
    trigger(lrclibOption, 'onClick');
    await nextTick();

    expect(update).toHaveBeenCalledWith('lrclib');
    app.unmount();
  });

  it('does not select a disabled option', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
      'onUpdate:modelValue': update,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: '' } });
    await nextTick();
    const disabledOption = options()[2];
    expect(disabledOption.props['aria-disabled']).toBe(true);

    trigger(disabledOption, 'onMousedown', { preventDefault: vi.fn() });
    trigger(disabledOption, 'onClick');
    await nextTick();

    expect(update).not.toHaveBeenCalled();
    app.unmount();
  });

  it('closes and reverts the query on Escape without emitting', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: 'netease',
      items: ITEMS,
      'onUpdate:modelValue': update,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: 'lrc' } });
    await nextTick();
    expect(control.props['aria-expanded']).toBe(true);

    trigger(control, 'onKeydown', {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();

    expect(control.props['aria-expanded']).toBe(false);
    expect(control.props.value).toBe('NetEase');
    expect(update).not.toHaveBeenCalled();
    app.unmount();
  });

  it('closes and reverts the query on blur', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: 'netease',
      items: ITEMS,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: 'zzz' } });
    await nextTick();
    trigger(control, 'onBlur');
    await nextTick();

    expect(control.props['aria-expanded']).toBe(false);
    expect(control.props.value).toBe('NetEase');
    app.unmount();
  });

  it('shows the no-results message when nothing matches', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: '',
      items: ITEMS,
      noResultsText: '沒有符合的結果',
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: 'zzz-no-match' } });
    await nextTick();

    expect(emptyMessage()).toBeDefined();
    expect(options()).toHaveLength(0);
    app.unmount();
  });

  it('uses shared field, floating, focus, and disabled tokens', () => {
    const source = readFileSync(
      new URL('./UiCombobox.vue', import.meta.url),
      'utf8',
    );

    for (const token of [
      '--ui-field-height',
      '--ui-field-bg',
      '--ui-field-border',
      '--ui-color-focus',
      '--ui-focus-width',
      '--ui-z-popover',
      '--ui-floating-viewport-inset',
      '--ui-menu-item-height',
      '--ui-color-surface-raised',
      '--ui-shadow-overlay',
      '--ui-opacity-disabled',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
