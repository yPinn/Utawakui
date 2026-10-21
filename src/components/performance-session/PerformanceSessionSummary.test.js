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
const render = (props = {}) =>
  renderToString(
    createSSRApp({ render: () => h(PerformanceSessionSummary, props) }),
  );
beforeEach(() => {
  fixture.plan.state.error = null;
  fixture.plan.state.validationError = null;
  fixture.plan.state.isInitialized = true;
  fixture.plan.state.plan = { source: null, items: [] };
  fixture.library.state.tracks = [];
  fixture.playback.currentItem.value = null;
});
describe('full page summary', () => {
  it('shows total, known length and one entry for detailed facts', async () => {
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
    for (const text of ['My session', '共 5 項', '已知總長 8:00', '安排明細'])
      expect(html).toContain(text);
    expect(html).not.toContain('演唱耗時');
  });
  it('keeps empty, all-unknown and loading distinct', async () => {
    expect(await render()).toContain('共 0 項');
    expect(await render()).not.toContain('時長未知');
    fixture.plan.state.plan.items = [
      { itemId: 'manual', mode: 'manual', progress: 'queued' },
    ];
    expect(await render()).toContain('已知總長 —');
    expect(await render()).toContain('安排明細');
    fixture.plan.state.isInitialized = false;
    expect(await render()).toContain('讀取安排統計');
    expect(await render()).not.toContain('共 1 項');
    fixture.plan.state.error = 'Cannot load';
    expect(await render()).toContain('統計未更新');
    expect(await render()).not.toContain('讀取安排統計');
  });
});

describe('Dock keeps only decision-essential statistics', () => {
  it('keeps detailed categories on the page and removes them from the Dock', async () => {
    fixture.plan.state.plan = {
      source: { name: '來源清單' },
      items: [
        {
          itemId: 'a',
          mode: 'library-track',
          trackId: 'song',
          progress: 'completed',
        },
        { itemId: 'b', mode: 'manual', progress: 'queued' },
      ],
    };
    fixture.library.state.tracks = [{ id: 'song', duration: 120 }];
    const compact = await render({ compact: true });
    expect(compact).toContain('2 項，已知 2 分');
    expect(compact).not.toContain('2:00');
    for (const label of ['來源清單', '待唱 1', '已完成 1', '另 1 項時長未知'])
      expect(compact).not.toContain(label);
    const full = await render();
    for (const label of ['來源清單', '安排明細']) expect(full).toContain(label);
    for (const label of ['待唱 1', '目前播放 1', '已完成 1'])
      expect(full).not.toContain(label);
    expect(full).not.toContain('<details open');
  });
  it('distinguishes complete length, unknown length, empty, loading and stale data', async () => {
    expect(await render({ compact: true })).toContain('0 首曲目');
    expect(await render({ compact: true })).not.toContain('0:00');
    fixture.plan.state.plan.items = [
      { itemId: 'a', mode: 'manual', progress: 'queued' },
    ];
    expect(await render({ compact: true })).toContain('時長未知');
    expect(await render({ compact: true })).not.toContain('0:00');
    fixture.plan.state.plan.items[0] = {
      itemId: 'a',
      mode: 'library-track',
      trackId: 'song',
      progress: 'queued',
    };
    fixture.library.state.tracks = [{ id: 'song', duration: 120 }];
    expect(await render({ compact: true })).toContain('1 首曲目，2 分');
    expect(await render({ compact: true })).not.toContain('已知');
    fixture.plan.state.isInitialized = false;
    expect(await render({ compact: true })).toContain('讀取安排統計');
    fixture.plan.state.error = 'Failed';
    expect(await render({ compact: true })).toContain('統計未更新');
    expect(await render({ compact: true })).not.toContain('2 分');
  });
});

describe('summary facts remain independent of field validation', () => {
  it('keeps valid totals while a modal draft is rejected and omits duplicated section counts', async () => {
    fixture.plan.state.validationError = {
      field: 'displayTitle',
      message: 'Invalid title',
    };
    const html = await render({ showSource: false });
    expect(html).toContain('共 0 項');
    expect(html).not.toContain('統計未更新');
    expect(html).not.toContain('目前播放 0');
    expect(html).not.toContain('待唱 0');
    expect(html).not.toContain('已完成 0');
  });
});

describe('receipt summary uses the collection duration formatter', () => {
  it('counts only completed records for history, retaining correct units for manual records', async () => {
    fixture.plan.state.plan.items = [
      {
        itemId: 'one',
        mode: 'library-track',
        trackId: 'one',
        progress: 'completed',
      },
      {
        itemId: 'two',
        mode: 'library-track',
        trackId: 'two',
        progress: 'queued',
      },
      { itemId: 'three', mode: 'manual', progress: 'interrupted' },
    ];
    fixture.library.state.tracks = [
      { id: 'one', duration: 120 },
      { id: 'two', duration: 3600 },
    ];
    expect(await render({ compact: true, scope: 'completed' })).toContain(
      '1 首曲目，2 分',
    );
    fixture.plan.state.plan.items.push({
      itemId: 'four',
      mode: 'manual',
      progress: 'completed',
    });
    expect(await render({ compact: true, scope: 'completed' })).toContain(
      '2 項，已知 2 分',
    );
  });
  it.each([
    [10, '1 分'],
    [3900, '1 小時 5 分'],
    [7200, '2 小時'],
  ])('formats %s seconds as %s', async (duration, label) => {
    fixture.plan.state.plan.items = [
      { itemId: 'one', mode: 'library-track', trackId: 'one' },
    ];
    fixture.library.state.tracks = [{ id: 'one', duration }];
    expect(await render({ compact: true })).toContain(`1 首曲目，${label}`);
  });
});
