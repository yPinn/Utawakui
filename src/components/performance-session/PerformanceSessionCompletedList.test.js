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
});

describe('completed arrangement uses the Recent list recipe', () => {
  it('keeps separate occurrences in newest-first order with snapshot labels and canonical artwork', async () => {
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
    expect(html.indexOf('New completed')).toBeLessThan(
      html.indexOf('Old completed'),
    );
    expect(html).toContain('Snapshot artist');
    expect(html).toContain('https://example.test/art.jpg');
    expect(html).not.toMatch(
      /Skipped entry|Interrupted entry|canonical title|canonical artist/,
    );
    expect(html).not.toMatch(
      /performance-session-board__current|performance-session-plan-entry__ordinal|ui-chip/,
    );
    expect(html).toContain('aria-labelledby="arrangement-dock-history-tab"');
    expect(html).toContain('aria-label="完成第 2 首"');
    expect(html).toContain('aria-label="完成第 1 首"');
    const rows = html.match(/<li\b[\s\S]*?<\/li>/g);
    expect(rows[0]).toContain('完成第 2 首');
    expect(rows[0]).toContain('New completed');
    expect(rows[1]).toContain('完成第 1 首');
    expect(rows[1]).toContain('Old completed');
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
    expect(html).toContain('尚無演出紀錄');
    expect(html).not.toContain('尚無最近播放紀錄');
  });
});
