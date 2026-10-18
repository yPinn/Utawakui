import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiTabs from './UiTabs.vue';
import UiBreadcrumb from './UiBreadcrumb.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';
import UiScrollLayout from './UiScrollLayout.vue';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const items = [
  { id: 'one', label: '曲庫' },
  { id: 'two', label: '外觀設定' },
];

describe('scroll content spacing ownership', () => {
  it('keeps horizontal segmented options at their content width', () => {
    expect(read('./UiSegmentedControl.vue')).toMatch(
      /\.ui-segmented-control__option\s*\{[^}]*flex:\s*0 0 auto;/su,
    );
  });
  it('constrains the native viewport to a flex-sized scroll root', () => {
    expect(read('./UiScrollRegion.vue')).toMatch(
      /\.ui-scroll-region\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*minmax\(0, 1fr\);/su,
    );
  });
  it.each([
    [UiTabs, { activeId: 'one', tabIdPrefix: 'tabs' }, 'ui-tabs__list'],
    [UiBreadcrumb, {}, 'ui-breadcrumb__list'],
    [
      UiSegmentedControl,
      { modelValue: 'one' },
      'ui-segmented-control__options',
    ],
  ])(
    'composes %s through the layout content owner',
    async (component, props, contentClass) => {
      const html = await renderToString(
        createSSRApp({
          render: () => h(component, { items, ariaLabel: '導覽', ...props }),
        }),
      );
      expect(html).toContain('ui-scroll-layout ui-scroll-region');
      expect(html).toContain('data-scrollbar-reserve="overflow"');
      expect(html).toContain(`${contentClass} ui-scroll-layout__content`);
      if (component === UiBreadcrumb)
        expect(html).toContain('<ol class="ui-breadcrumb__list');
    },
  );

  it('keeps stable reservation as the default and exposes overflow-only reservation', async () => {
    for (const reserve of ['stable', 'overflow']) {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(UiScrollLayout, { scrollbarReserve: reserve }, () => '內容'),
        }),
      );
      expect(html).toContain(`data-scrollbar-reserve="${reserve}"`);
    }
    const source = read('./UiScrollLayout.vue');
    expect(source).toContain("default: 'stable'");
    expect(source).toContain(
      "[data-scrollbar-reserve='overflow'][data-overflow-x='false']",
    );
    expect(source).toContain(
      "[data-scrollbar-reserve='overflow'][data-overflow-y='false']",
    );
    expect(source).toContain('--ui-scrollbar-visual-reserve');
  });

  it('leaves F8 category spacing with the primitive instead of a parent deep override', () => {
    expect(read('../demo/DemoCatalogueWorkspace.vue')).not.toContain(
      ':deep(.ui-tabs__list)',
    );
  });

  it.each(['UiCombobox', 'UiActionMenu'])(
    '%s separates option paint from the vertical thumb',
    (name) => {
      expect(read(`./${name}.vue`)).toMatch(
        /\[data-overflow-y='true'\][^{]*\{\s*padding-inline-end:\s*max\(\s*var\(--ui-floating-list-padding\),\s*calc\(var\(--ui-scrollbar-visual-reserve\) \+ var\(--ui-space-1\)\)\s*\);/su,
      );
    },
  );
});
