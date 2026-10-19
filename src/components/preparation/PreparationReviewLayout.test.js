import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PreparationReviewLayout from './PreparationReviewLayout.vue';

describe('Preparation review layout', () => {
  it('keeps the concise summary and recovery notice outside the single list scrollport', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            PreparationReviewLayout,
            {
              source: '長來源名稱 日本語 한국어',
              count: 12,
              hint: '最多新增約 61 MB',
              listLabel: '檢查曲目',
            },
            {
              default: () => h('ul', [h('li', '曲目內容')]),
              actions: () => h('button', '返回選取曲目'),
              notice: () => h('p', '可複製的復原說明'),
            },
          ),
      }),
    );
    expect(html).toContain('長來源名稱 日本語 한국어 · 12 首');
    expect(html).toContain('最多新增約 61 MB');
    expect(html).toContain('aria-label="檢查曲目"');
    expect(html.match(/class="ui-scroll-region__viewport"/gu)).toHaveLength(1);
    expect(html.indexOf('返回選取曲目')).toBeLessThan(
      html.indexOf('ui-scroll-region__viewport'),
    );
    expect(html.indexOf('可複製的復原說明')).toBeGreaterThan(
      html.indexOf('ui-scroll-region__rail'),
    );
  });

  it('omits unused hint, actions, and notice regions for a short empty source', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(PreparationReviewLayout, { source: '空來源', count: 0 }),
      }),
    );
    expect(html).toContain('空來源 · 0 首');
    expect(html).not.toContain('preparation-review-layout__actions');
    expect(html).not.toContain('preparation-review-layout__notice');
    expect(html.match(/class="ui-hint /gu)).toHaveLength(1);
  });
});
