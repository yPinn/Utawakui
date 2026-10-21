import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Archive from './PerformanceSessionArchive.vue';
const fixture = vi.hoisted(() => ({ archive: null }));
vi.mock('../../composables/usePerformanceQueueActions.js', () => ({
  usePerformanceQueueActions: () => ({
    state: { isSaving: false },
    addArchive: vi.fn(),
  }),
}));
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
const render = () =>
  renderToString(
    createSSRApp({ render: () => h(Archive, { sessionId: 'old' }) }),
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
    expect(html).not.toContain('此場次沒有安排曲目');
  });
  it('renders repeated and manual occurrences under the shared dossier with export entries', async () => {
    fixture.archive.session.value = {
      id: 'old',
      name: 'Archived show',
      endedAt: '2026-10-20T12:00:00Z',
      items: [
        {
          itemId: 'one',
          trackId: 'song',
          mode: 'library-track',
          displayTitle: 'First',
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
    expect(html).toContain('3 項，已知 4 分');
    expect(html).toContain('手動曲目');
    expect(html).toContain('另存演出歌單');
    expect(html).toContain('匯出場次時間軸');
    expect(html).toContain('加入演出待唱');
    expect(html).toContain('collection-action-rail__actions');
    expect(html).not.toContain('collection-action-rail__tools');
    expect(html).not.toContain('播放此演出歌單');
    expect(html).not.toContain('performance-archive__actions');
  });
  it('retains the marker-only empty state', async () => {
    fixture.archive.session.value = {
      id: 'old',
      name: 'Opening',
      items: [],
      timeline: [{ type: 'marker' }],
    };
    expect(await render()).toContain(
      '此場次沒有安排曲目；標記可在時間軸中查看。',
    );
  });
});
