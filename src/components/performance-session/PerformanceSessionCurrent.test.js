import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PerformanceSessionCurrent from './PerformanceSessionCurrent.vue';

const track = {
  id: 'song',
  title: 'Canonical',
  artist: 'Canonical artist',
  thumbnailUrl: 'https://example.test/art.jpg',
};
const current = {
  itemId: 'occurrence',
  trackId: 'song',
  mode: 'library-track',
  displayTitle: 'Stage title',
  displayArtist: 'Stage artist',
};
const render = (props = {}) =>
  renderToString(
    createSSRApp({
      render: () => h(PerformanceSessionCurrent, { tracks: [track], ...props }),
    }),
  );

describe('arrangement current uses the Queue current section', () => {
  it('renders a single shared current row with snapshot labels, canonical artwork and pause action', async () => {
    const html = await render({ current, phase: 'playing', confirmed: true });
    expect(html).toContain('現正播放');
    expect(html.match(/queue-track right-dock-track/g)).toHaveLength(1);
    expect(html).toContain('Stage title');
    expect(html).toContain('Stage artist');
    expect(html).not.toContain('Canonical artist');
    expect(html).toContain(track.thumbnailUrl);
    expect(html).toContain('暫停：Stage title');
    expect(html).toContain('標記完成');
    expect(html).toContain('停止');
    expect(html).not.toContain('performance-session-board');
  });
  it('reflects paused audio and supports ordinary player fallback without session actions', async () => {
    const html = await render({ playerTrack: track, phase: 'paused' });
    expect(html).toContain('已暫停');
    expect(html).toContain('播放：Canonical');
    expect(html).not.toContain('標記完成');
    expect(html).not.toContain('>停止<');
  });
  it('keeps manual completion and stop without a fake audio control', async () => {
    const html = await render({
      current: { ...current, trackId: null, mode: 'manual' },
      confirmed: true,
    });
    expect(html).toContain('手動進行中');
    expect(html).not.toContain('class="ui-track__artwork-action"');
    expect(html).toContain('標記完成');
  });
  it('allows cancellation while busy but disables cover playback and unconfirmed completion', async () => {
    const html = await render({ current, busy: true, phase: 'buffering' });
    expect(html).toContain('載入中');
    expect(html).not.toContain('class="ui-track__artwork-action"');
    const stop = html
      .match(/<button[^>]*>[\s\S]*?<\/button>/g)
      .find((button) => button.includes('>停止<'));
    expect(stop).toBeTruthy();
    expect(stop).not.toContain(' disabled');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?標記完成/);
  });
  it('keeps an actionable empty state without inventing a current track', async () => {
    const html = await render({ canStart: true });
    expect(html).toContain('尚未開始播放');
    expect(html).toContain('開始播放');
    expect(html).not.toContain('queue-track right-dock-track');
  });
});

describe('shared workspace current presentation', () => {
  it('uses the same occurrence snapshot and completion guard without inventing manual playback', async () => {
    const html = await render({
      variant: 'workspace',
      current: { ...current, mode: 'manual' },
      confirmed: false,
      busy: true,
    });
    expect(html).toContain('目前項目');
    expect(html).toContain('手動進行中');
    expect(html).not.toContain('播放：Stage title');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?標記完成/);
  });
});

it('keeps the workspace empty state actionable without an extra visible heading', async () => {
  const html = await render({ variant: 'workspace', canStart: true });
  expect(html).toContain('aria-label="目前項目"');
  expect(html).toContain('開始播放');
  expect(html).not.toContain('<h2');
});
