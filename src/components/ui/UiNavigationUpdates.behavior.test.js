import { readFileSync } from 'node:fs';
import { nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UiTabs from './UiTabs.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';
import UiBreadcrumb from './UiBreadcrumb.vue';
import UiScrollLayout from './UiScrollLayout.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';
for (const [component, file] of [
  [UiTabs, 'UiTabs'],
  [UiSegmentedControl, 'UiSegmentedControl'],
  [UiBreadcrumb, 'UiBreadcrumb'],
  [UiScrollLayout, 'UiScrollLayout'],
  [UiScrollRegion, 'UiScrollRegion'],
])
  attachClientRender(component, `./${file}.vue`, import.meta.url);
const initial = () => [
  { id: 'a', label: '中文' },
  { id: 'b', label: '日本語' },
  { id: 'c', label: 'Long English' },
];
const event = (key) => ({
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});
describe('navigation items recovery', () => {
  afterEach(() => vi.unstubAllGlobals());
  for (const [component, role, valueProp, updateProp, extra] of [
    [UiTabs, 'tab', 'activeId', 'onUpdate:activeId', { tabIdPrefix: 'nav' }],
    [UiSegmentedControl, 'radio', 'modelValue', 'onUpdate:modelValue', {}],
  ]) {
    it(`${role} restores an owned focus when an item disables, without stealing external focus or emitting selection`, async () => {
      const update = vi.fn();
      const props = reactive({
        items: initial(),
        [valueProp]: 'a',
        ariaLabel: '導覽',
        ...extra,
        [updateProp]: update,
      });
      const { root, app } = mount(component, props);
      const original = findAll(root, (node) => node.props.role === role);
      const document = { activeElement: original[0], body: {} };
      vi.stubGlobal('document', document);
      props.items = props.items.map((item) => ({
        ...item,
        disabled: item.id === 'a',
      }));
      await nextTick();
      await nextTick();
      expect(original[1].focus).toHaveBeenCalledOnce();
      expect(update).not.toHaveBeenCalled();
      const disabledKey = event('End');
      trigger(original[0], 'onKeydown', disabledKey);
      expect(disabledKey.preventDefault).not.toHaveBeenCalled();
      document.activeElement = {};
      props.items = initial();
      await nextTick();
      await nextTick();
      expect(original[0].focus).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      app.unmount();
    });

    it(`${role} focuses by identity after reorder and recovers empty/disabled items without changing caller selection`, async () => {
      const update = vi.fn();
      const props = reactive({
        items: initial(),
        [valueProp]: 'a',
        ariaLabel: '導覽',
        ...extra,
        [updateProp]: update,
      });
      const { root, app } = mount(component, props);
      const original = findAll(root, (n) => n.props.role === role);
      props.items = [props.items[2], props.items[0], props.items[1]];
      await nextTick();
      trigger(original[0], 'onKeydown', event('ArrowRight'));
      await nextTick();
      expect(update).toHaveBeenLastCalledWith('b');
      expect(original[1].focus).toHaveBeenCalledOnce();
      expect(original[2].focus).not.toHaveBeenCalled();
      props.items = props.items.map((i) => ({ ...i, disabled: true }));
      await nextTick();
      expect(
        findAll(root, (n) => n.props.role === role).every(
          (n) => n.props.tabindex === -1 && n.props.disabled,
        ),
      ).toBe(true);
      const calls = update.mock.calls.length;
      trigger(original[0], 'onKeydown', event('Home'));
      expect(update).toHaveBeenCalledTimes(calls);
      props.items = [];
      await nextTick();
      expect(findAll(root, (n) => n.props.role === role)).toHaveLength(0);
      props.items = initial();
      await nextTick();
      const restored = findAll(root, (n) => n.props.role === role);
      expect(restored.filter((n) => n.props.tabindex === 0)).toHaveLength(1);
      expect(restored[0].props.tabindex).toBe(0);
      expect(props[valueProp]).toBe('a');
      props.items = props.items.filter((i) => i.id !== 'a');
      await nextTick();
      expect(update).toHaveBeenCalledTimes(calls);
      expect(
        findAll(root, (n) => n.props.role === role).filter(
          (n) => n.props.tabindex === 0,
        ),
      ).toHaveLength(1);
      app.unmount();
    });
  }
  it('honors inherited RTL for Tabs without intercepting vertical arrows', async () => {
    vi.stubGlobal('getComputedStyle', () => ({ direction: 'rtl' }));
    const update = vi.fn();
    const { root, app } = mount(UiTabs, {
      items: initial(),
      activeId: 'a',
      ariaLabel: '導覽',
      tabIdPrefix: 'rtl',
      'onUpdate:activeId': update,
    });
    const tabs = findAll(root, (node) => node.props.role === 'tab');
    trigger(tabs[0], 'onKeydown', event('ArrowRight'));
    await nextTick();
    expect(update).toHaveBeenCalledWith('c');
    expect(tabs[2].focus).toHaveBeenCalledOnce();
    const down = event('ArrowDown');
    trigger(tabs[0], 'onKeydown', down);
    expect(down.preventDefault).not.toHaveBeenCalled();
    app.unmount();
  });
  it('keeps numeric and string segment ids distinct after reordering', async () => {
    const update = vi.fn();
    const props = reactive({
      items: [
        { id: 1, label: '數字' },
        { id: '1', label: '文字' },
      ],
      modelValue: 1,
      ariaLabel: '型別',
      'onUpdate:modelValue': update,
    });
    const { root, app } = mount(UiSegmentedControl, props);
    const options = findAll(root, (node) => node.props.role === 'radio');
    props.items.reverse();
    await nextTick();
    trigger(options[0], 'onKeydown', event('ArrowRight'));
    await nextTick();
    expect(update).toHaveBeenCalledWith('1');
    expect(options[1].focus).toHaveBeenCalledOnce();
    expect(options[0].focus).not.toHaveBeenCalled();
    app.unmount();
  });
  it('keeps disabled breadcrumb segments inert and updates the current segment after shrinking and restoring', async () => {
    const select = vi.fn(),
      props = reactive({
        ariaLabel: '路徑',
        items: [
          { id: 'a', label: '根' },
          { id: 'b', label: '停用', href: '#b', disabled: true },
          { id: 'c', label: '目前' },
        ],
        onSelect: select,
      });
    const { root, app } = mount(UiBreadcrumb, props);
    trigger(findAll(root, (n) => n.type === 'button')[1], 'onClick');
    expect(select).not.toHaveBeenCalled();
    props.items = [{ id: 'a', label: '根' }];
    await nextTick();
    expect(
      findAll(root, (n) => n.props['aria-current'] === 'page'),
    ).toHaveLength(1);
    expect(
      findAll(root, (n) => n.type === 'button' || n.type === 'a'),
    ).toHaveLength(0);
    props.items = [];
    await nextTick();
    expect(
      findAll(root, (n) => n.props['aria-current'] === 'page'),
    ).toHaveLength(0);
    props.items = initial();
    await nextTick();
    expect(
      findAll(root, (n) => n.props['aria-current'] === 'page'),
    ).toHaveLength(1);
    expect(findAll(root, (n) => n.type === 'button')).toHaveLength(2);
    app.unmount();
  });
  it('keeps selected state authoritative and bounds label overflow within flexible controls', () => {
    for (const file of ['UiTabs', 'UiSegmentedControl']) {
      const source = readFileSync(
        new URL(`./${file}.vue`, import.meta.url),
        'utf8',
      );
      expect(source).toContain(':where(:hover:not(:disabled))');
      expect(source).toContain('text-overflow: ellipsis');
      expect(source).toContain(
        `class="${file === 'UiTabs' ? 'ui-tabs' : 'ui-segmented-control'}__label"`,
      );
    }
  });
});
