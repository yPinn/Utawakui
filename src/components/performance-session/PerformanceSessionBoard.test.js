import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PerformanceSessionBoard from './PerformanceSessionBoard.vue';

async function render(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          PerformanceSessionBoard,
          { tracks: [], historyItems: [], pendingCount: 0, ...props },
          { pending: () => h('p', 'Queued songs') },
        ),
    }),
  );
}
describe('Folder playback board', () => {
  it('keeps independent accessible headings when Folder and Dock show the same owner', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h('div', [
            h(PerformanceSessionBoard),
            h(PerformanceSessionBoard, {
              variant: 'dock',
              idPrefix: 'arrangement-dock',
            }),
          ]),
      }),
    );
    expect(html.match(/id="arrangement-current-title"/g)).toHaveLength(1);
    expect(html.match(/id="arrangement-dock-current-title"/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="arrangement-current-title"');
    expect(html).toContain('aria-labelledby="arrangement-dock-current-title"');
  });
  it('keeps all three progress sections visible without a streaming context', async () => {
    const html = await render();
    for (const label of ['待播', '目前播放', '已完成', 'Queued songs'])
      expect(html).toContain(label);
    expect(html).toContain('尚未開始播放');
    expect(html).toContain('播放第一首');
    expect(html).not.toContain('OBS');
  });
  it('resolves canonical artwork with occurrence labels and shows paused rather than completed', async () => {
    const html = await render({
      current: {
        itemId: 'i1',
        trackId: 't1',
        displayTitle: 'Encore',
        displayArtist: 'Live version',
        mode: 'library-track',
      },
      tracks: [
        {
          id: 't1',
          title: 'Canonical',
          thumbnailUrl: 'https://example.test/cover.jpg',
        },
      ],
      phase: 'paused',
      confirmed: true,
    });
    expect(html).toContain('Encore');
    expect(html).toContain('Live version');
    expect(html).toContain('https://example.test/cover.jpg');
    expect(html).toContain('已暫停');
    expect(html).toContain('標記完成');
  });
  it('distinguishes completed, skipped and interrupted results, with explicit requeue actions', async () => {
    const html = await render({
      historyItems: ['completed', 'skipped', 'interrupted'].map(
        (progress, n) => ({
          itemId: `i${n}`,
          displayTitle: `Song ${n}`,
          progress,
          ready: true,
        }),
      ),
    });
    for (const label of ['已完成', '已略過', '已中止', '再次加入待播'])
      expect(html).toContain(label);
  });
});
