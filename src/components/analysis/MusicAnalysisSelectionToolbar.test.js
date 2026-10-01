import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisSelectionToolbar from './MusicAnalysisSelectionToolbar.vue';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('./MusicAnalysisSelectionToolbar.vue', import.meta.url),
  'utf8',
);

describe('MusicAnalysisSelectionToolbar', () => {
  it('exposes mixed filtered selection and an explicit global clear', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisSelectionToolbar, {
        visibleCount: 3,
        selectedCount: 2,
        someVisibleSelected: true,
      }),
    );

    expect(html).toContain('批次已選 2 首');
    expect(html).toContain('取消選取搜尋結果');
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('清除全部');
    expect(source).toContain('<UiCheckbox');
    expect(source).not.toMatch(/<input\b/gu);
  });

  it('turns the filtered action into deselection when every result is selected', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisSelectionToolbar, {
        visibleCount: 3,
        selectedCount: 3,
        allVisibleSelected: true,
        someVisibleSelected: true,
      }),
    );

    expect(html).toContain('取消選取搜尋結果');
    expect(html).toContain('checked');
  });
});
