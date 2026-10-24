import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PreparationReviewLayout from './PreparationReviewLayout.vue';

describe('Preparation review layout', () => {
  it('reuses the library dossier above the single list scrollport and recovery notice', async () => {
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
    expect(html).toContain('library-entity-dossier');
    expect(html).toContain('長來源名稱 日本語 한국어');
    expect(html).toContain('12 首曲目');
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
    expect(html).toContain('空來源');
    expect(html).toContain('0 首曲目');
    expect(html).not.toContain('preparation-review-layout__actions');
    expect(html).not.toContain('preparation-review-layout__notice');
    expect(html).not.toContain('class="ui-hint ');
  });

  it('projects album artwork, artist, release year, and a complete duration through the real dossier', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(PreparationReviewLayout, {
            source: 'THE BOOK',
            count: 2,
            entityKind: 'album',
            releaseType: 'ep',
            releaseDate: { value: '2024-06', precision: 'month' },
            coverUrl: 'https://example.com/album.jpg',
            tracks: [
              { id: 'a', artist: 'YOASOBI', duration: 120 },
              { id: 'b', artist: 'YOASOBI', duration: 180 },
            ],
          }),
      }),
    );
    expect(html).toContain('迷你專輯');
    expect(html).toContain('YOASOBI');
    expect(html).toContain('2024');
    expect(html).toContain('2 首曲目，5 分');
    expect(html).toContain('src="https://example.com/album.jpg"');
    expect(html).not.toContain('ui-collage-thumb__cell');
    expect(html).toMatch(/<h3[^>]*class="app-folder-dossier__title"/u);
  });

  it('uses playlist collage without inventing an owner or summing incomplete durations', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(PreparationReviewLayout, {
            source: '我的歌單',
            count: 2,
            tracks: [
              { id: 'a', artist: '甲', duration: 120 },
              { id: 'b', artist: '乙' },
            ],
          }),
      }),
    );
    expect(html).toContain('播放清單');
    expect(html).toContain('ui-collage-thumb__cell');
    expect(html).toContain('2 首曲目');
    expect(html).not.toContain('app-folder-dossier__owner');
    expect(html).not.toContain('2 分');
  });
});
