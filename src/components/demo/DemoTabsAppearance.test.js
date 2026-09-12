import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import UiTabs from '../ui/UiTabs.vue';
import DemoCandidateTabs from './DemoCandidateTabs.vue';
import DemoTabsAppearance from './DemoTabsAppearance.vue';

const navigationSource = readFileSync(
  new URL('./DemoNavigation.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoTabsAppearance.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoTabsPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateTabs.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiTabs.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoCandidateTabs, './DemoCandidateTabs.vue'],
  [UiTabs, '../ui/UiTabs.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoTabsAppearance', () => {
  it('replaces only the tabs sample with the staged appearance review', () => {
    expect(navigationSource).toContain(
      "import DemoTabsAppearance from './DemoTabsAppearance.vue';",
    );
    expect(navigationSource).toContain(
      '<DemoTabsAppearance v-if="section.key === \'tabs\'" />',
    );
    expect(navigationSource).not.toContain('const PANEL_TABS');
    expect(navigationSource).not.toContain('const BAR_TABS');
  });

  it('orders Candidate and Current through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));
    const candidateIndex = html.indexOf('data-tabs-source="candidate"');
    const currentIndex = html.indexOf('data-tabs-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      '尺寸與寬度',
      'Panel／Bar',
      'Owned anatomy',
      '內容與 overflow',
      '狀態外觀',
      'Keyboard／ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-tabs-source="${source}"[\\s\\S]*?(?=<section[^>]*data-tabs-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('visualizes 36 and 32 CSS px Candidate tabs against Current 30px', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-tabs-size="${size}"`);
    }
    expect(html).toContain('Standard · 36 CSS px');
    expect(html).toContain('Compact · 32 CSS px');
    expect(html).toContain('Current · 30 CSS px');
    expect(primitiveSource).toContain(
      '.demo-tabs-size--standard {\n  --demo-tabs-height: 2.25rem;',
    );
    expect(primitiveSource).toContain(
      '.demo-tabs-size--compact {\n  --demo-tabs-height: 2rem;',
    );
    expect(primitiveSource).toContain(
      '.demo-tabs-size--active {\n  --demo-tabs-height: 1.875rem;',
    );
    expect(candidateSource).toContain(
      'min-height: var(--demo-tabs-height, var(--ui-control-height));',
    );
    expect(candidateSource).not.toContain('density: {');
    expect(candidateSource).not.toContain('size: {');
  });

  it('keeps Panel intrinsic and Bar available-width without a component max', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    for (const width of ['intrinsic-panel', 'available-bar', 'narrow-scroll']) {
      expect(
        html.match(new RegExp(`data-tabs-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Panel · intrinsic／max 100%');
    expect(html).toContain('Bar · available width／100%');
    expect(html).toContain('Narrow · native horizontal scroll');
    expect(candidateSource).toContain('min-width: 0;');
    expect(candidateSource).toContain('max-width: 100%;');
    expect(candidateSource).toContain('width: fit-content;');
    expect(candidateSource).toContain('overflow-x: auto;');
    expect(candidateSource).not.toMatch(/max-width:\s*\d+(?:\.\d+)?rem/u);
  });

  it('keeps both visual variants attached to real tab panels', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    for (const variant of ['panel', 'bar']) {
      expect(
        html.match(new RegExp(`data-tabs-variant="${variant}"`, 'gu')),
      ).toHaveLength(2);
    }
    const controlledIds = [...html.matchAll(/aria-controls="([^"]+)"/gu)].map(
      ([, id]) => id,
    );
    expect(controlledIds.length).toBeGreaterThan(0);
    for (const id of controlledIds) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('Panel · tonal selected tile');
    expect(html).toContain('Bar · 2 CSS px selected indicator');
    expect(html).toContain('Bar · tonal selected tile／no indicator');
    expect(html).toContain(
      'Current Bar 沒有 indicator，仍沿用與 Panel 相同的 selected tile。',
    );
    expect(candidateSource).toContain('.ui-tabs--bar .ui-tabs__tab.is-active');
    expect(candidateSource).toContain(
      '.ui-tabs--bar .ui-tabs__tab.is-active::after',
    );
  });

  it('maps the compound anatomy and realistic content', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    for (const anatomy of [
      'tablist',
      'tab',
      'label',
      'after',
      'indicator',
      'tabpanel',
    ]) {
      expect(
        html.match(new RegExp(`data-tabs-anatomy="${anatomy}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const content of [
      'short-cjk',
      'long-cjk',
      'long-latin',
      'multilingual',
      'number',
      'disabled',
    ]) {
      expect(html).toContain(`data-tabs-content="${content}"`);
    }
    expect(html).toContain('東京事変／椎名林檎／非常に長い日本語の作業區段');
    expect(html).toContain(
      'A deliberately long Latin workspace section for overflow inspection',
    );
    expect(html).toContain('繁體中文／日本語／한국어／English');
    expect(html).toContain('12');
    expect(candidateSource).toContain('text-overflow: ellipsis;');
    expect(candidateSource).toContain('white-space: nowrap;');
    expect(componentSource).not.toContain('UiMarqueeText');
  });

  it('covers stable geometry across the complete interaction state set', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    for (const state of [
      'default',
      'hover',
      'pressed',
      'focus',
      'selected',
      'selected-hover',
      'disabled',
    ]) {
      expect(
        html.match(new RegExp(`data-tabs-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(candidateSource).toContain(':focus-visible');
    expect(candidateSource).toContain(
      'outline-offset: var(--ui-focus-offset-inset);',
    );
    expect(candidateSource).toContain(':active:not(:disabled)');
    expect(candidateSource).toContain(':disabled');
    expect(primitiveSource).toContain(
      ".demo-tabs-primitive--current\n  .demo-tabs-state[data-tabs-state='selected-hover']",
    );
    expect(html).toContain('所有狀態不改變 control 幾何');
  });

  it('reuses UiTabs roving focus and skips disabled tabs', async () => {
    const update = vi.fn();
    const { app, root } = mount(DemoCandidateTabs, {
      items: [
        { id: 'library', label: '曲庫' },
        { id: 'locked', label: '未開放', disabled: true },
        { id: 'queue', label: '佇列' },
      ],
      activeId: 'library',
      ariaLabel: '工作區',
      tabIdPrefix: 'candidate-workspace',
      panelIdPrefix: 'candidate-workspace',
      'data-contract': 'native-forwarding',
      'onUpdate:activeId': update,
    });
    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const tabs = findAll(root, (node) => node.props.role === 'tab');

    expect(tablist.props).toMatchObject({
      'aria-label': '工作區',
      'data-contract': 'native-forwarding',
    });
    expect(tabs[0].props).toMatchObject({
      id: 'candidate-workspace-library-tab',
      'aria-controls': 'candidate-workspace-library-panel',
      'aria-selected': true,
      tabindex: 0,
    });
    expect(tabs[1].props.disabled).toBe(true);

    const event = { key: 'ArrowRight', preventDefault: vi.fn() };
    trigger(tabs[0], 'onKeydown', event);
    await nextTick();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    expect(tabs[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('documents the bounded contract and isolates Current styling', async () => {
    const html = await renderToString(createSSRApp(DemoTabsAppearance));

    expect(html).toContain('items · { id, label, disabled? }');
    expect(html).toContain('activeId · controlled selection');
    expect(html).toContain('ariaLabel · tabIdPrefix · panelIdPrefix');
    expect(html).toContain('variant · panel／bar · presentation only');
    expect(html).toContain('label／after · non-interactive slots');
    expect(html).toContain('Parent owns panel content／visibility');
    expect(html).toContain(
      'No route／href · No closeable · No vertical · No segmented semantics',
    );
    expect(componentSource).toContain(
      ':class="`demo-tabs-layer--${layer.key}`"',
    );
    expect(componentSource).toContain('.demo-tabs-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-tabs-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-tabs');
    expect(currentSource).not.toContain('--demo-tabs-height');
  });
});
