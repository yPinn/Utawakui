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
  it('owns pending and full history sections without duplicating current controls or totals', async () => {
    const html = await render({ pendingCount: 2 });
    for (const label of [
      '待唱',
      '演出紀錄',
      'Queued songs',
      'aria-labelledby="session-pending-title"',
      'aria-labelledby="session-history-title"',
    ])
      expect(html).toContain(label);
    for (const label of ['開始播放', '目前播放', '已知總長'])
      expect(html).not.toContain(label);
  });
  it('distinguishes completed, skipped and interrupted results, under a truthful history heading', async () => {
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
    for (const label of ['已完成', '已略過', '已中止'])
      expect(html).toContain(label);
  });
});
