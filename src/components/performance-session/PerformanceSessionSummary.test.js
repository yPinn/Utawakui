import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceSessionSummary from './PerformanceSessionSummary.vue';
const fixture = vi.hoisted(() => ({
  plan: { state: { isInitialized: true, plan: { source: null, items: [] } } },
  library: { state: { tracks: [] } },
  playback: { currentItem: { value: null } },
}));
vi.mock('../../composables/usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => fixture.plan,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => fixture.library,
}));
vi.mock('../../composables/usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => fixture.playback,
}));
const render = () =>
  renderToString(createSSRApp({ render: () => h(PerformanceSessionSummary) }));
beforeEach(() => {
  fixture.plan.state.error = null;
  fixture.plan.state.validationError = null;
  fixture.plan.state.isInitialized = true;
  fixture.plan.state.plan = { source: null, items: [] };
  fixture.library.state.tracks = [];
  fixture.playback.currentItem.value = null;
});
describe('compact Dock summary', () => {
  it('shows total, known length, all result categories and an explicit unknown count', async () => {
    fixture.plan.state.plan.source = { name: 'My session' };
    fixture.plan.state.plan.items = [
      'queued',
      'playing',
      'completed',
      'skipped',
      'interrupted',
    ].map((progress, i) => ({
      itemId: String(i),
      progress,
      mode: 'library-track',
      trackId: i ? 'song' : 'gone',
    }));
    fixture.library.state.tracks = [{ id: 'song', duration: 120 }];
    const html = await render();
    for (const text of [
      'My session',
      '共 5 首',
      '已知總長 8:00',
      '待播 1',
      '目前播放 1',
      '已完成 1',
      '略過 1',
      '中止 1',
      '另 1 首時長未知',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('演唱耗時');
  });
  it('keeps empty, all-unknown and loading distinct', async () => {
    expect(await render()).toContain('共 0 首');
    expect(await render()).not.toContain('時長未知');
    fixture.plan.state.plan.items = [
      { itemId: 'manual', mode: 'manual', progress: 'queued' },
    ];
    expect(await render()).toContain('已知總長 —');
    expect(await render()).toContain('另 1 首時長未知');
    fixture.plan.state.isInitialized = false;
    expect(await render()).toContain('讀取安排統計');
    expect(await render()).not.toContain('共 1 首');
    fixture.plan.state.error = 'Cannot load';
    expect(await render()).toContain('統計未更新');
    expect(await render()).not.toContain('讀取安排統計');
  });
});
