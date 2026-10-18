import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from '../../constants/uiDemoSections.js';
import DemoCatalogueWorkspace from './DemoCatalogueWorkspace.vue';

const source = readFileSync(
  new URL('./DemoCatalogueWorkspace.vue', import.meta.url),
  'utf8',
);

describe('DemoCatalogueWorkspace', () => {
  it('lets formal Tabs own their scrollbar spacing', () => {
    expect(source).not.toContain(':deep(.ui-tabs__list)');
  });
  it('uses formal tabs and one vertical scroll layout', async () => {
    const html = await renderToString(createSSRApp(DemoCatalogueWorkspace));

    expect(source).toContain("import UiTabs from '../ui/UiTabs.vue';");
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue';",
    );
    expect(source).toContain('<UiTabs');
    expect(source).toContain('<UiScrollLayout');
    expect(source).not.toContain('UiScrollRegion');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-label="元件型錄內容"');
  });

  it('renders one active group instead of every catalogue group at once', async () => {
    const html = await renderToString(createSSRApp(DemoCatalogueWorkspace));

    expect(html).toContain(UI_DEMO_GROUPS[0].title);
    expect(html).not.toContain(`>${UI_DEMO_GROUPS[1].title}</h2>`);
    expect(html.match(/role="tabpanel"/gu)).toHaveLength(1);
    expect(source).toContain('activeGroup');
  });

  it('resets the content scroll when the category changes', () => {
    expect(source).toContain("useTemplateRef('scrollLayout')");
    expect(source).toContain('scrollLayout.value?.scrollTo({');
    expect(source).toContain("top: 0, behavior: 'auto'");
  });

  it('keeps group migration badges out of the catalogue workspace', () => {
    expect(source).not.toContain('data-review-status');
    expect(source).not.toContain('GROUP_REVIEW_LABELS');
    expect(source).not.toContain('demo-group__status');
  });
});
