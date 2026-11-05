import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Archive from './PerformanceSessionArchive.vue';
const fixture = vi.hoisted(() => ({ archive: null }));
vi.mock('../../composables/usePerformanceArchive.js', () => ({
  usePerformanceArchive: () => fixture.archive,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({
    state: { tracks: [{ id: 'song', duration: 125, title: 'Canonical' }] },
  }),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({ openPerformancePreparation: vi.fn() }),
}));
vi.mock('../../composables/useObsSessionExport.js', () => ({
  useObsSessionExport: () => ({ openForArrangement: vi.fn() }),
}));
vi.mock('./PerformanceSessionPlaylistExportModal.vue', () => ({
  default: { render: () => null },
}));
beforeEach(() => {
  fixture.archive = {
    session: shallowRef(null),
    loading: shallowRef(false),
    error: shallowRef(''),
    refresh: vi.fn(),
  };
});
const render = (props = {}) =>
  renderToString(
    createSSRApp({ render: () => h(Archive, { sessionId: 'old', ...props }) }),
  );
describe('archive collection document', () => {
  it('uses a real initial skeleton and errors without an empty-track claim', async () => {
    fixture.archive.loading.value = true;
    expect(await render()).toContain('讀取封存場次');
    fixture.archive.loading.value = false;
    fixture.archive.error.value = '讀取失敗';
    const html = await render();
    expect(html).toContain('讀取失敗');
    expect(html).toContain('重新讀取場次');
    expect(html).not.toContain('本場沒有曲目演出紀錄');
  });
  it('renders repeated and manual occurrences under the shared dossier with export entries', async () => {
    fixture.archive.session.value = {
      id: 'old',
      name: 'Archived show',
      startedAt: '2026-10-20T11:00:00Z',
      endedAt: '2026-10-20T12:00:00Z',
      items: [
        {
          itemId: 'one',
          trackId: 'song',
          mode: 'library-track',
          ready: true,
          displayTitle: 'First',
          displayArtist: 'MY FIRST STORY',
          progress: 'completed',
        },
        {
          itemId: 'two',
          trackId: 'song',
          mode: 'library-track',
          displayTitle: 'Again',
          progress: 'completed',
        },
        {
          itemId: 'manual',
          mode: 'manual',
          displayTitle: 'Acappella',
          progress: 'completed',
        },
        {
          itemId: 'planned',
          mode: 'manual',
          displayTitle: 'Not performed',
          progress: 'queued',
        },
      ],
    };
    const html = await render();
    expect(html).toContain('app-folder-dossier');
    expect(html).toContain('data-collection-kind="performance-archive"');
    expect(html).toContain('演出狀態');
    expect(html).not.toContain('library-track-row__playback-control');
    expect(html).not.toContain('library-track-row__separation-action');
    expect(html).not.toContain('library-track-table__sort"');
    expect(html).toContain('Archived show');
    for (const key of ['one', 'two', 'manual'])
      expect(html).toContain(`data-occurrence-id="${key}"`);
    expect(html).toMatch(/完成\s3\s項/u);
    expect(html).not.toContain('Not performed');
    expect(html).toContain('手動曲目');
    expect(html).toMatch(/app-folder-dossier__marker[^>]*>\s*封存場次\s*</u);
    expect(html).toContain('另存本場歌單');
    expect(html).toContain('匯出時間點');
    expect(html).not.toContain('加入演出待唱');
    expect(html).toContain('collection-action-rail__actions');
    expect(html).toContain('library-track-table__header--scroll-shadow');
    expect(html).not.toContain('collection-action-rail__tools');
    expect(html).not.toContain('播放此封存場次');
    expect(html).not.toContain('performance-archive__actions');
    const embedded = await render({ embedded: true });
    expect(embedded).not.toContain('另存本場歌單');
    expect(embedded).not.toContain('app-folder-dossier');
    expect(embedded).toContain('library-track-table--compact');
    expect(embedded).not.toContain(
      'library-track-table__header--scroll-shadow',
    );
    expect(embedded).toContain('library-track-row--compact-stacked');
    expect(embedded).not.toContain('library-track-row--compact-inline');
    expect(embedded).toContain('Archived show');
    expect(embedded).toContain('首筆紀錄');
    expect(embedded).toContain('保存於');
    expect(embedded).toMatch(/完成\s3\s項/u);
    expect(embedded).toContain('MY FIRST STORY');
    expect(embedded).toContain('曲長');
    expect(embedded).toContain('2:05');
    expect(embedded).toContain('library-track-row__status-detail');
    expect(embedded).toContain('演出狀態');
    expect(embedded).toContain('匯出時間點');
    expect(embedded).toContain('配對影片');
  });
  it('retains the marker-only empty state', async () => {
    fixture.archive.session.value = {
      id: 'old',
      name: 'Opening',
      items: [],
      timeline: [{ type: 'marker' }],
    };
    expect(await render()).toContain('本場只有標記紀錄。');
  });
});
