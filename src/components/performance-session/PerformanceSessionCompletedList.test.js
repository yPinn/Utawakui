import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceSessionCompletedList from './PerformanceSessionCompletedList.vue';

const fixture = vi.hoisted(() => ({
  plan: {
    state: {
      isInitialized: true,
      isSaving: false,
      error: null,
      validationError: null,
    },
  },
  playback: {
    state: { busy: false, error: null },
    historyItems: { value: [] },
    replay: vi.fn(),
  },
  library: { state: { tracks: [] } },
}));
vi.mock('../../composables/usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => fixture.plan,
}));
vi.mock('../../composables/usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => fixture.playback,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => fixture.library,
}));
const render = () =>
  renderToString(
    createSSRApp({ render: () => h(PerformanceSessionCompletedList) }),
  );
beforeEach(() => {
  fixture.playback.historyItems.value = [];
  fixture.library.state.tracks = [];
  fixture.plan.state.isInitialized = true;
  fixture.plan.state.error = null;
});

describe('completed arrangement uses the Recent list recipe', () => {
  it('keeps separate occurrences in ascending completion order with snapshot labels and canonical artwork', async () => {
    fixture.library.state.tracks = [
      {
        id: 'song',
        title: 'canonical title',
        artist: 'canonical artist',
        url: 'media://song',
        thumbnailUrl: 'https://example.test/art.jpg',
      },
    ];
    fixture.playback.historyItems.value = [
      {
        itemId: 'old',
        trackId: 'song',
        displayTitle: 'Old completed',
        displayArtist: 'Snapshot artist',
        ready: true,
        progress: 'completed',
      },
      {
        itemId: 'skip',
        trackId: 'song',
        displayTitle: 'Skipped entry',
        displayArtist: '',
        ready: true,
        progress: 'skipped',
      },
      {
        itemId: 'new',
        trackId: 'song',
        displayTitle: 'New completed',
        displayArtist: 'Guest',
        ready: true,
        progress: 'completed',
      },
      {
        itemId: 'stop',
        trackId: 'song',
        displayTitle: 'Interrupted entry',
        displayArtist: '',
        ready: true,
        progress: 'interrupted',
      },
    ];
    const html = await render();
    expect(html).toContain('recent-playback__list');
    expect(html.match(/recent-playback__item/g)).toHaveLength(2);
    expect(html.indexOf('Old completed')).toBeLessThan(
      html.indexOf('New completed'),
    );
    expect(html).toContain('Snapshot artist');
    expect(html).toContain('https://example.test/art.jpg');
    expect(html).not.toMatch(
      /Skipped entry|Interrupted entry|canonical title|canonical artist/,
    );
    expect(html).not.toMatch(
      /performance-session-board__current|performance-session-plan-entry__ordinal|ui-chip/,
    );
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain('queue-track__ordinal');
    const rows = html.match(/<li\b[\s\S]*?<\/li>/g);
    expect(rows[0]).toContain('Old completed');
    expect(rows[1]).toContain('New completed');
  });
  it('keeps manual starts explicit and missing files visible without a false play action', async () => {
    fixture.playback.historyItems.value = [
      {
        itemId: 'manual',
        mode: 'manual',
        displayTitle: 'External accompaniment',
        displayArtist: '',
        ready: true,
        progress: 'completed',
      },
      {
        itemId: 'missing',
        mode: 'library-track',
        trackId: 'gone',
        displayTitle: 'Missing file',
        displayArtist: '',
        ready: false,
        progress: 'completed',
      },
    ];
    const html = await render();
    expect(html).not.toContain('開始：External accompaniment');
    expect(html).toContain('Missing file');
    expect(html).not.toContain('aria-label="播放：Missing file"');
    expect(html).not.toContain('class="ui-track__artwork-action"');
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(2);
  });
  it('uses completion-specific empty copy', async () => {
    const html = await render();
    expect(html).toContain(
      '尚無完成紀錄。請先加入演出待唱，再從待唱開始播放；完成後會列在這裡。',
    );
    expect(html).not.toContain('尚無最近播放紀錄');
    expect(html).not.toContain('ui-skeleton');
    expect(html).not.toContain('recent-playback__item');
  });
  it('keeps repeated performances in one flat list across dates without restarting ordinals', async () => {
    fixture.playback.historyItems.value = [
      {
        itemId: 'a',
        trackId: 'same-song',
        displayTitle: 'First',
        progress: 'completed',
        progressUpdatedAt: new Date(2026, 9, 20, 23, 50).toISOString(),
      },
      {
        itemId: 'b',
        trackId: 'same-song',
        displayTitle: 'Second',
        progress: 'completed',
        progressUpdatedAt: new Date(2026, 9, 20, 23, 59).toISOString(),
      },
      {
        itemId: 'c',
        trackId: 'same-song',
        displayTitle: 'Third',
        progress: 'completed',
        progressUpdatedAt: new Date(2026, 9, 21, 0, 1).toISOString(),
      },
    ];
    const html = await render();
    expect(html.match(/class="recent-playback__list"/g)).toHaveLength(1);
    expect(html).not.toContain('performance-session-completed-list__day');
    expect(html).not.toContain('<time');
    expect(html).not.toContain('完成時間');
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html.indexOf('Second')).toBeLessThan(html.indexOf('Third'));
    expect(html).not.toContain('queue-track__ordinal');
    expect(html.match(/recent-playback__item/g)).toHaveLength(3);
  });
  it('keeps legacy records under an update warning without adding date placeholders', async () => {
    fixture.playback.historyItems.value = [
      {
        itemId: 'legacy',
        displayTitle: 'Legacy record',
        progress: 'completed',
      },
    ];
    fixture.plan.state.error = '更新失敗';
    const html = await render();
    expect(html).toContain('演出紀錄未更新');
    expect(html).toContain('Legacy record');
    expect(html).not.toContain('日期未記錄');
    expect(html).not.toContain('完成時間未記錄');
    expect(html).not.toContain('<time');
  });
  it('shows an accessible skeleton only while the first read is pending', async () => {
    fixture.plan.state.isInitialized = false;
    const html = await render();
    expect(html).toContain('讀取演出紀錄…');
    expect(html).toContain('ui-skeleton--text');
    expect(html).not.toContain('尚無完成紀錄');
    expect(html).not.toContain('performance-session-completed-list__day');
  });
});
