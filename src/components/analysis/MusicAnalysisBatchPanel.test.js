import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisBatchPanel from './MusicAnalysisBatchPanel.vue';

describe('MusicAnalysisBatchPanel', () => {
  it('shows compact default batch controls', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisBatchPanel, {
        selectedCount: 3,
        capabilityReady: true,
      }),
    );

    expect(html).toContain('批次分析');
    expect(html).toContain('已選 3 首');
    expect(html).toContain('分析已選曲目');
    expect(html).toContain('重新分析已有結果');
    expect(html).toContain('預設略過已有 M1／M2 結果的曲目');
    expect(html).not.toContain('此頁只操作既有');
  });

  it('shows aggregate progress and a single batch cancel action', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisBatchPanel, {
        selectedCount: 5,
        capabilityReady: true,
        active: true,
        summary: '已處理 2 / 5 首',
        batch: {
          status: 'running',
          total: 5,
          completed: 2,
          succeeded: 1,
          failed: 1,
          skipped: 0,
          cancelled: 0,
          percent: 40,
        },
      }),
    );

    expect(html).toContain('已處理 2 / 5 首');
    expect(html).toContain('value="40"');
    expect(html).toContain('批次分析總進度');
    expect(html).toContain('取消批次');
    expect(html).not.toContain('分析已選曲目');
  });
});
