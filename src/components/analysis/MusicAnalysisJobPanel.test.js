import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisJobPanel from './MusicAnalysisJobPanel.vue';

describe('MusicAnalysisJobPanel', () => {
  it('renders Traditional Chinese operational copy', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisJobPanel, {
        selectedTrack: { id: 'track-1', title: '測試歌曲', artist: '歌手' },
        phaseLabel: '準備就緒',
        stageLabel: '等待開始',
        canAnalyze: true,
      }),
    );

    expect(html).toContain('分析工作');
    expect(html).toContain('內部工作台');
    expect(html).toContain('重新讀取 sidecar');
    expect(html).not.toContain('Analysis job');
    expect(html).not.toContain('Internal workbench');
  });
});
