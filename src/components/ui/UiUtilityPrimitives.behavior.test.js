import { readFileSync } from 'node:fs';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiDisclosure from './UiDisclosure.vue';
import UiKbd from './UiKbd.vue';
import UiRadioGroup from './UiRadioGroup.vue';
import UiSkeleton from './UiSkeleton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiDisclosure, './UiDisclosure.vue'],
  [UiRadioGroup, './UiRadioGroup.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('UiKbd', () => {
  it('renders shortcut chrome without owning the command', async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(UiKbd, null, () => 'Ctrl + K') }),
    );

    expect(html).toContain('<kbd');
    expect(html).toContain('Ctrl + K');
    expect(html).not.toContain('tabindex');
  });
});

describe('UiSkeleton', () => {
  it('keeps decorative placeholders hidden and exposes a caller-authored loading name', async () => {
    const decorative = await renderToString(
      createSSRApp({ render: () => h(UiSkeleton, { lines: 3 }) }),
    );
    const announced = await renderToString(
      createSSRApp({
        render: () =>
          h(UiSkeleton, {
            lines: 2,
            pattern: 'staggered',
            ariaLabel: '正在載入歌詞',
          }),
      }),
    );

    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative.match(/ui-skeleton__shape/g)).toHaveLength(3);
    expect(announced).toContain('role="status"');
    expect(announced).toContain('aria-label="正在載入歌詞"');
    expect(announced).toContain('ui-skeleton--staggered');
  });
});

describe('UiDisclosure', () => {
  it('uses the shared icon size instead of a component-local pixel literal', () => {
    const source = readFileSync(
      new URL('./UiDisclosure.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(':size="ICON_SIZE"');
    expect(source).not.toContain(':size="16"');
  });

  it('uses native details semantics and emits the next controlled state', async () => {
    const onUpdate = vi.fn();
    const onToggle = vi.fn();
    const mounted = mount(
      UiDisclosure,
      {
        label: '來源證據',
        open: false,
        'onUpdate:open': onUpdate,
        onToggle,
      },
      { default: () => 'MBID 內容' },
    );
    const details = findAll(mounted.root, (node) => node.type === 'details')[0];
    const summary = findAll(mounted.root, (node) => node.type === 'summary')[0];

    expect(details.props.open).toBe(false);
    expect(textContent(summary)).toContain('來源證據');
    trigger(details, 'onToggle', { currentTarget: { open: true } });
    await nextTick();

    expect(onUpdate).toHaveBeenCalledWith(true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('UiRadioGroup', () => {
  const items = [
    { id: 'system', label: '跟隨系統' },
    { id: 'dark', label: '深色', description: '固定使用深色外觀' },
    { id: 'locked', label: '尚未提供', disabled: true },
  ];

  it('keeps both option insets equal to the indicator-to-copy gap', () => {
    const source = readFileSync(
      new URL('./UiRadioGroup.vue', import.meta.url),
      'utf8',
    );
    const optionRule = source.match(
      /\.ui-radio-group__option\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(optionRule).toContain('gap: var(--ui-space-2);');
    expect(optionRule).toContain('padding: var(--ui-space-2);');
    expect(optionRule).not.toContain(
      'padding: var(--ui-space-2) var(--ui-space-3);',
    );
  });

  it('renders a native named group and emits typed selection', async () => {
    const onUpdate = vi.fn();
    const mounted = mount(UiRadioGroup, {
      name: 'theme-mode',
      legend: '外觀模式',
      items,
      modelValue: 'system',
      'onUpdate:modelValue': onUpdate,
    });
    const fieldset = findAll(
      mounted.root,
      (node) => node.type === 'fieldset',
    )[0];
    const inputs = findAll(
      mounted.root,
      (node) => node.type === 'input' && node.props.type === 'radio',
    );

    expect(fieldset).toBeTruthy();
    expect(inputs).toHaveLength(3);
    expect(inputs[0].props.name).toBe('theme-mode');
    expect(inputs[0].props.checked).toBe(true);
    expect(inputs[2].props.disabled).toBe(true);

    trigger(inputs[1], 'onChange');
    await nextTick();
    expect(onUpdate).toHaveBeenCalledWith('dark');
  });
});
