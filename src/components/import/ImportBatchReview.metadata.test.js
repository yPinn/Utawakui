import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../composables/useImportSession.js', () => ({
  useImportSession: () => ({
    state: { playlistTitle: '後來的草稿', collectionThumbnailUrl: 'draft.jpg' },
    cancelTrackDownload: vi.fn(),
    retryBatch: vi.fn(),
  }),
}));
vi.mock('./ImportCollectionExecutionList.vue', () => ({
  default: { render: () => h('ul', [h('li', '下載內容')]) },
}));
import ImportBatchReview from './ImportBatchReview.vue';

describe('Import batch dossier metadata', () => {
  it('renders the accepted batch snapshot even after a different source becomes the draft', async () => {
    const batch = {
      title: '已確認專輯',
      kind: 'playlist',
      collectionKind: 'album',
      releaseType: 'ep',
      releaseDate: { value: '2023', precision: 'year' },
      thumbnailUrl: 'https://example.com/accepted.jpg',
      phase: 'running',
      tracks: [
        {
          id: 'song',
          title: '歌',
          artist: '歌手',
          duration: 180,
          downloadRequired: true,
          status: 'downloading',
        },
      ],
    };
    const html = await renderToString(
      createSSRApp({ render: () => h(ImportBatchReview, { batch }) }),
    );
    expect(html).toContain('已確認專輯');
    expect(html).toContain('迷你專輯');
    expect(html).toContain('歌手');
    expect(html).toContain('2023');
    expect(html).toContain('1 首曲目，3 分');
    expect(html).toContain('src="https://example.com/accepted.jpg"');
    expect(html).toContain('下載中 · 已處理 0／1 首');
    expect(html).not.toContain('後來的草稿');
    expect(html).not.toContain('draft.jpg');
  });

  it('keeps a single-track batch as a single release and a playlist as a collage', async () => {
    const render = (kind, collectionKind) =>
      renderToString(
        createSSRApp({
          render: () =>
            h(ImportBatchReview, {
              batch: {
                title: '來源',
                kind,
                collectionKind,
                phase: 'completed',
                tracks: [{ id: 'song', title: '歌' }],
              },
            }),
        }),
      );
    const single = await render('single', null);
    expect(single).toContain('單曲');
    expect(single).not.toContain('ui-collage-thumb__cell');
    const playlist = await render('playlist', 'playlist');
    expect(playlist).toContain('播放清單');
    expect(playlist).toContain('ui-collage-thumb__cell');
  });
});
