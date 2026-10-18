import { createSSRApp, h, nextTick, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiRadioGroup from './UiRadioGroup.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';

attachClientRender(UiRadioGroup, './UiRadioGroup.vue', import.meta.url);

const inputs = (root) => findAll(root, (node) => node.type === 'input');
const labels = (root) => findAll(root, (node) => node.type === 'label');
const itemsFor = (ids) =>
  ids.map((id) => ({ id, label: `選項 ${String(id)}` }));

describe('UiRadioGroup option identity', () => {
  it.each([
    ['中文', ['中文', '繁體中文', '简体中文']],
    ['日本語', ['日本語', 'にほんご', 'カタカナ']],
    [
      'special characters',
      [
        'a b',
        'a/b',
        'a?b',
        'a-b',
        'a_b',
        'a%b',
        'a"b',
        '<a>',
        '💿',
        '🎵',
        'é',
        'e\u0301',
        '',
        '\t',
        '\ud800',
      ],
    ],
    ['typed keys', [1, '1', 0, '0']],
  ])(
    'keeps %s IDs unique and labels associated without changing values',
    (_, ids) => {
      const update = vi.fn();
      const { app, root } = mount(UiRadioGroup, {
        name: '偏好 設定 / モード',
        legend: '語言',
        items: itemsFor(ids),
        modelValue: ids[0],
        'onUpdate:modelValue': update,
      });
      const controls = inputs(root),
        captions = labels(root);
      expect(new Set(controls.map((input) => input.props.id)).size).toBe(
        ids.length,
      );
      controls.forEach((input, index) => {
        expect(input.props.id).not.toMatch(/\s/u);
        expect(captions[index].props.for).toBe(input.props.id);
        expect(input.props.name).toBe('偏好 設定 / モード');
        expect(input.props.value).toBe(ids[index]);
        expect(input.props.checked).toBe(index === 0);
        trigger(input, 'onChange');
        expect(update).toHaveBeenLastCalledWith(ids[index]);
      });
      app.unmount();
    },
  );

  it('isolates DOM IDs between instances even when callers reuse a native group name', () => {
    const shared = {
      name: 'same',
      legend: '語言',
      items: itemsFor(['中文', '日本語', 1, '1']),
    };
    const { app, root } = mount({
      render: () =>
        h('div', [h(UiRadioGroup, shared), h(UiRadioGroup, shared)]),
    });
    expect(new Set(inputs(root).map((input) => input.props.id)).size).toBe(8);
    app.unmount();
  });

  it('preserves each option ID when reordered or the native name changes', async () => {
    const state = reactive({
      name: 'language',
      items: itemsFor(['中文', '日本語', 'a/b']),
    });
    const { app, root } = mount({
      render: () => h(UiRadioGroup, { ...state, legend: '語言' }),
    });
    const before = new Map(
      inputs(root).map((input) => [input.props.value, input.props.id]),
    );
    state.items = [...state.items].reverse();
    state.name = '外觀 設定';
    await nextTick();
    const controls = inputs(root),
      captions = labels(root);
    controls.forEach((input, index) => {
      expect(input.props.id).toBe(before.get(input.props.value));
      expect(captions[index].props.for).toBe(input.props.id);
      expect(input.props.name).toBe('外觀 設定');
    });
    app.unmount();
  });

  it('generates deterministic SSR IDs with unique label targets across instances', async () => {
    const render = () =>
      renderToString(
        createSSRApp({
          render: () =>
            h(
              'div',
              ['list', 'tiles'].map((appearance) =>
                h(UiRadioGroup, {
                  name: '語言',
                  legend: appearance,
                  appearance,
                  items: itemsFor(['中文', '日本語', 'a/b']),
                }),
              ),
            ),
        }),
      );
    const first = await render(),
      second = await render();
    const ids = [...first.matchAll(/\sid="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    const targets = [...first.matchAll(/\sfor="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(first).toBe(second);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(targets).toEqual(ids);
  });

  it('keeps both group and item disabled selection guarded for Unicode IDs', () => {
    for (const disabled of [false, true]) {
      const update = vi.fn();
      const { app, root } = mount(UiRadioGroup, {
        name: '語言',
        legend: '語言',
        disabled,
        items: [
          { id: '中文', label: '中文', disabled: true },
          { id: '日本語', label: '日本語' },
        ],
        'onUpdate:modelValue': update,
      });
      const controls = inputs(root);
      trigger(controls[0], 'onChange');
      expect(update).not.toHaveBeenCalled();
      trigger(controls[1], 'onChange');
      if (disabled) expect(update).not.toHaveBeenCalled();
      else expect(update).toHaveBeenCalledExactlyOnceWith('日本語');
      app.unmount();
    }
  });
});
