import { readFileSync } from 'node:fs';
import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiCombobox from './UiCombobox.vue';
import UiField from './UiField.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiField, './UiField.vue'],
  [UiScrollRegion, './UiScrollRegion.vue'],
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

const GROUPED_ITEMS = [
  { value: 'playback-order', label: '目前播放順序' },
  {
    label: '播放清單',
    options: [{ value: 'playlist-1', label: '演出歌單' }],
  },
  {
    label: '專輯',
    options: [
      {
        value: 'album-1',
        label: '花皮 · Sabrina 胡恂舞',
        searchText: '花皮 Sabrina 胡恂舞',
      },
      {
        value: 'album-2',
        label: 'After Dark · Aimer',
        searchText: 'After Dark Aimer',
      },
    ],
  },
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

function groups() {
  return findAll(body, (node) => node.props?.role === 'group');
}

describe('UiCombobox', () => {
  it('ignores the composition-ending Enter with keyCode 229, then accepts a new Enter', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'ime-ending',
      label: '來源',
      items: ITEMS,
      'onUpdate:modelValue': update,
    });
    const control = input(root);
    trigger(control, 'onCompositionstart', {});
    trigger(control, 'onInput', { target: { value: 'lyr' } });
    await nextTick();
    trigger(control, 'onCompositionend', {});
    const preventDefault = vi.fn();
    trigger(control, 'onKeydown', {
      key: 'Enter',
      keyCode: 229,
      isComposing: false,
      preventDefault,
    });
    expect(update).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    trigger(control, 'onKeydown', {
      key: 'Enter',
      keyCode: 13,
      preventDefault,
    });
    expect(update).toHaveBeenCalledExactlyOnceWith('better-lyrics');
    app.unmount();
  });

  it.each(['disabled', 'editable'])(
    'clears unfinished composition when %s changes',
    async (prop) => {
      const state = reactive({ disabled: false, editable: true });
      const update = vi.fn();
      const { app, root } = mount({
        render: () =>
          h(UiCombobox, {
            ...state,
            id: 'ime-transition',
            label: '來源',
            items: ITEMS,
            'onUpdate:modelValue': update,
          }),
      });
      let control = input(root);
      trigger(control, 'onInput', { target: { value: 'lyr' } });
      trigger(control, 'onCompositionstart', {});
      await nextTick();
      state[prop] = !state[prop];
      await nextTick();
      if (prop === 'disabled') {
        state.disabled = false;
        await nextTick();
      }
      control = input(root);
      expect(control.type).toBe(prop === 'editable' ? 'button' : 'input');
      expect(update).not.toHaveBeenCalled();
      trigger(control, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
      expect(update).toHaveBeenCalledExactlyOnceWith('better-lyrics');
      app.unmount();
    },
  );

  it.each([
    { label: 'native composing flag', event: { isComposing: true } },
    { label: 'IME legacy key code', event: { keyCode: 229 } },
    { label: 'composition lifecycle fallback', lifecycle: true, event: {} },
  ])(
    'does not navigate, dismiss, or commit during $label',
    async ({ lifecycle, event }) => {
      const update = vi.fn();
      const { app, root } = mount(UiCombobox, {
        id: 'ime-source',
        label: '來源',
        modelValue: 'netease',
        items: ITEMS,
        'onUpdate:modelValue': update,
      });
      const control = input(root);
      trigger(control, 'onInput', { target: { value: 'lyr' } });
      await nextTick();
      if (lifecycle) trigger(control, 'onCompositionstart', {});
      const highlighted = control.props['aria-activedescendant'];
      for (const key of [
        'Enter',
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
        'Escape',
        'Tab',
      ]) {
        const preventDefault = vi.fn(),
          stopPropagation = vi.fn();
        trigger(control, 'onKeydown', {
          key,
          preventDefault,
          stopPropagation,
          ...event,
        });
        await nextTick();
        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(control.props['aria-expanded']).toBe(true);
        expect(control.props['aria-activedescendant']).toBe(highlighted);
        expect(update).not.toHaveBeenCalled();
      }
      if (lifecycle) trigger(control, 'onCompositionend', {});
      const preventDefault = vi.fn();
      trigger(control, 'onKeydown', { key: 'Enter', preventDefault });
      await nextTick();
      expect(update).toHaveBeenCalledExactlyOnceWith('better-lyrics');
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(control.props['aria-expanded']).toBe(false);
      app.unmount();
    },
  );

  it('clears an unfinished composition on blur so the next open can commit', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiCombobox, {
      id: 'ime-blur',
      label: '來源',
      items: ITEMS,
      modelValue: 'netease',
      'onUpdate:modelValue': update,
    });
    const control = input(root);
    trigger(control, 'onInput', { target: { value: 'lyr' } });
    trigger(control, 'onCompositionstart', {});
    trigger(control, 'onBlur');
    await nextTick();
    expect(control.props.value).toBe('NetEase');
    trigger(control, 'onClick');
    await nextTick();
    trigger(control, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    expect(update).toHaveBeenCalledExactlyOnceWith('netease');
    app.unmount();
  });

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

  it('opens from a pointer click and highlights the selected option', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: 'netease',
      items: ITEMS,
    });
    const control = input(root);

    trigger(control, 'onClick');
    await nextTick();

    expect(control.props['aria-expanded']).toBe(true);
    expect(control.props['aria-activedescendant']).toBe(
      'lyrics-source-option-netease',
    );
    expect(options()).toHaveLength(4);
    app.unmount();
  });

  it('brings the committed selection back into view when reopened', async () => {
    const selectedOption = { scrollIntoView: vi.fn() };
    document.getElementById = vi.fn((id) =>
      id === 'lyrics-source-option-better-lyrics' ? selectedOption : null,
    );
    const { app, root } = mount(UiCombobox, {
      id: 'lyrics-source',
      label: '歌詞來源',
      modelValue: 'better-lyrics',
      items: ITEMS,
    });
    const control = input(root);

    trigger(control, 'onClick');
    await nextTick();
    await nextTick();

    expect(document.getElementById).toHaveBeenCalledWith(
      'lyrics-source-option-better-lyrics',
    );
    expect(selectedOption.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
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

  it('renders grouped items with one selected-value and keyboard contract', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'separation-source',
      label: '來源',
      modelValue: 'album-2',
      items: GROUPED_ITEMS,
    });
    const control = input(root);

    expect(control.props.value).toBe('After Dark · Aimer');
    trigger(control, 'onClick');
    await nextTick();

    expect(groups().map(({ props }) => props['aria-label'])).toEqual([
      '播放清單',
      '專輯',
    ]);
    expect(options().map(({ props }) => props.id)).toEqual([
      'separation-source-option-playback-order',
      'separation-source-option-playlist-1',
      'separation-source-option-album-1',
      'separation-source-option-album-2',
    ]);
    expect(control.props['aria-activedescendant']).toBe(
      'separation-source-option-album-2',
    );
    expect(options()[3].props['aria-selected']).toBe(true);
    app.unmount();
  });

  it('renders a select-only trigger without editable input behavior', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'separation-source',
      label: '來源',
      modelValue: 'album-2',
      items: GROUPED_ITEMS,
      editable: false,
    });
    const control = input(root);

    expect(control.type).toBe('button');
    expect(control.props).toMatchObject({
      type: 'button',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': false,
    });
    expect(control.props.onInput).toBeUndefined();
    expect(control.props['aria-autocomplete']).toBeUndefined();

    trigger(control, 'onClick');
    await nextTick();

    const albumOption = options()[2];
    trigger(albumOption, 'onPointerenter');
    await nextTick();

    expect(control.props['aria-activedescendant']).toBe(
      'separation-source-option-album-1',
    );
    expect(
      findAll(body, (node) =>
        String(node.props?.class ?? '').includes(
          'ui-combobox__option-indicator--selected',
        ),
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('filters grouped children by searchText and removes empty groups', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'separation-source',
      label: '來源',
      modelValue: '',
      items: GROUPED_ITEMS,
    });
    const control = input(root);

    trigger(control, 'onInput', { target: { value: 'aimer' } });
    await nextTick();

    expect(groups().map(({ props }) => props['aria-label'])).toEqual(['專輯']);
    expect(options()).toHaveLength(1);
    expect(options()[0].props.id).toBe('separation-source-option-album-2');
    app.unmount();
  });

  it('moves through grouped options as one keyboard sequence', async () => {
    const { app, root } = mount(UiCombobox, {
      id: 'separation-source',
      label: '來源',
      modelValue: '',
      items: GROUPED_ITEMS,
    });
    const control = input(root);

    for (const expectedId of [
      'separation-source-option-playback-order',
      'separation-source-option-playlist-1',
      'separation-source-option-album-1',
    ]) {
      trigger(control, 'onKeydown', {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      });
      await nextTick();
      expect(control.props['aria-activedescendant']).toBe(expectedId);
    }

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

  it('lets a feature render rich option content without changing selection behavior', async () => {
    const update = vi.fn();
    const { app, root } = mount(
      UiCombobox,
      {
        id: 'font-family',
        label: '字型',
        modelValue: '',
        items: ITEMS,
        'onUpdate:modelValue': update,
      },
      {
        option: ({ item }) =>
          h(
            'span',
            { 'data-rich-option': String(item.value) },
            `預覽 ${item.label}`,
          ),
      },
    );
    const control = input(root);

    trigger(control, 'onInput', { target: { value: '' } });
    await nextTick();

    const richOptions = findAll(
      body,
      (node) => node.props?.['data-rich-option'],
    );
    expect(richOptions).toHaveLength(4);
    trigger(options()[0], 'onClick');
    expect(update).toHaveBeenCalledWith('lrclib');
    app.unmount();
  });

  it('renders a rich selected value while navigation still commits only on confirmation', async () => {
    const update = vi.fn();
    const { app, root } = mount(
      UiCombobox,
      {
        id: 'rich-value',
        label: '選項',
        editable: false,
        modelValue: 'netease',
        items: ITEMS,
        'onUpdate:modelValue': update,
      },
      {
        value: ({ item }) =>
          h('span', { 'data-selected-value': item.value }, item.label),
      },
    );
    const control = findAll(root, (node) => node.props?.role === 'combobox')[0];
    expect(
      findAll(
        control,
        (node) => node.props?.['data-selected-value'] === 'netease',
      ),
    ).toHaveLength(1);
    trigger(control, 'onClick');
    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(update).not.toHaveBeenCalled();
    expect(
      findAll(
        control,
        (node) => node.props?.['data-selected-value'] === 'netease',
      ),
    ).toHaveLength(1);
    trigger(control, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    expect(update).toHaveBeenCalledExactlyOnceWith('better-lyrics');
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
      '--ui-floating-row-min-height',
      '--ui-floating-list-bg',
      '--ui-floating-list-shadow',
      '--ui-opacity-disabled',
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });
});
