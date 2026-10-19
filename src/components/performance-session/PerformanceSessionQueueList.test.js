import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PerformanceSessionQueueList from './PerformanceSessionQueueList.vue';

const tracks = [
  {
    id: 'same-song',
    title: 'Canonical',
    artist: 'Canonical artist',
    url: 'media://song',
    thumbnailUrl: 'https://example.test/art.jpg',
  },
];
const entry = (itemId, title, fields = {}) => ({
  itemId,
  trackId: 'same-song',
  mode: 'library-track',
  displayTitle: title,
  displayArtist: 'Stage artist',
  ready: true,
  progress: 'queued',
  ...fields,
});
const render = (props = {}) =>
  renderToString(
    createSSRApp({
      render: () => h(PerformanceSessionQueueList, { tracks, ...props }),
    }),
  );

describe('arrangement pending uses the existing Queue row recipe', () => {
  it('shows duplicate track occurrences as independent selectable rows with snapshot labels', async () => {
    const html = await render({
      items: [
        entry('one', 'First occurrence'),
        entry('two', 'Encore occurrence'),
      ],
    });
    expect(html.match(/class="ui-track__artwork-action"/g)).toHaveLength(2);
    expect(
      html.match(/class="[^"]*queue-track right-dock-track /g),
    ).toHaveLength(2);
    expect(html).toContain('First occurrence');
    expect(html).toContain('Encore occurrence');
    expect(html).toContain('Stage artist');
    expect(html).toContain('https://example.test/art.jpg');
    expect(html).not.toContain('Canonical artist');
    expect(html.match(/draggable="true"/g)).toHaveLength(2);
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(2);
    expect(html).not.toMatch(/performance-session-plan-entry__ordinal|ui-chip/);
    expect(html).toContain('aria-label="待播第 1 首"');
    expect(html).toContain('aria-label="待播第 2 首"');
    const rows = html.match(/<li\b[\s\S]*?<\/li>/g);
    expect(rows[0]).toContain('待播第 1 首');
    expect(rows[0]).toContain('First occurrence');
  });
  it('renumbers the displayed pending order after reorder or removal', async () => {
    const html = await render({
      items: [
        entry('two', 'Encore occurrence'),
        entry('one', 'First occurrence'),
      ],
    });
    const rows = html.match(/<li\b[\s\S]*?<\/li>/g);
    expect(rows[0]).toContain('待播第 1 首');
    expect(rows[0]).toContain('Encore occurrence');
    expect(rows[1]).toContain('待播第 2 首');
    expect(rows[1]).toContain('First occurrence');
    const single = await render({ items: [entry('two', 'Encore occurrence')] });
    expect(single).toContain('待播第 1 首');
    expect(single).not.toContain('待播第 2 首');
  });
  it('keeps manual starts explicit and missing tracks visible without false playback', async () => {
    const html = await render({
      items: [
        entry('manual', 'Manual', {
          mode: 'manual',
          trackId: null,
          displayArtist: '',
        }),
        entry('gone', 'Missing', { trackId: 'gone', ready: false }),
      ],
    });
    expect(html).toContain('開始：Manual');
    expect(html).toContain('手動項目');
    expect(html).toContain('音檔無法使用');
    expect(html).toContain('Missing');
    expect(html.match(/class="ui-track__artwork-action"/g)).toHaveLength(1);
  });
  it('disables playback and drag during mutations and keeps an actionable empty state', async () => {
    const html = await render({
      saving: true,
      items: [entry('one', 'First'), entry('two', 'Second')],
    });
    expect(html).not.toContain('class="ui-track__artwork-action"');
    expect(html).not.toContain('draggable="true"');
    expect(await render()).toContain('沒有待播曲目');
  });
});
