import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoView from './DemoView.vue';

const source = readFileSync(new URL('./DemoView.vue', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');

describe('DemoView Folder page boundary', () => {
  it('composes the catalogue as a page inside the existing Folder shell', async () => {
    const html = await renderToString(createSSRApp(DemoView));

    expect(source).toContain(
      "import AppFolderPage from '../components/layout/AppFolderPage.vue';",
    );
    expect(source).toContain(
      "import DemoCatalogueWorkspace from '../components/demo/DemoCatalogueWorkspace.vue';",
    );
    expect(source).toContain('<AppFolderPage');
    expect(source).toContain('mode="workspace"');
    expect(source).toContain('<UiPageHeader');
    expect(html).toContain('UI 元件型錄');
    expect(html).toContain('正式元件與少量未採用提案的回歸檢查');
    expect(source).toMatch(/\.demo-view\s*\{[^}]*inline-size:\s*100%;/su);
  });

  it('does not redraw Folder or scrollbar ownership in the view', () => {
    expect(source).not.toContain('AppFolderLayout');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).not.toContain('UiScrollLayout');
    expect(source).not.toContain('--ui-color-folder');
    expect(source).not.toContain('overflow: auto');
    expect(source).not.toContain('overflow: scroll');
  });

  it('lets the app shell recognize F8 as a page-composed Folder view', () => {
    expect(appSource).toMatch(
      /pageComposedFolderViews\s*=\s*new Set\(\[[\s\S]*?'visual-system'[\s\S]*?\]\)/u,
    );
  });

  it('keeps migration status and adopted counts out of visible catalogue copy', async () => {
    const html = await renderToString(createSSRApp(DemoView));

    expect(source).not.toContain('UI_DEMO_ADOPTED_SECTION_KEYS');
    expect(source).not.toContain('UI_DEMO_GROUP_REVIEW_STATUS');
    expect(html).not.toContain('正式遷移');
    expect(html).not.toContain('已審查');
    expect(html).not.toContain('部分完成');
  });
});
