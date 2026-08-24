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
        capability: {
          status: 'ready',
          installed: true,
          modelName: 'Beat This! small0',
        },
        capabilityStageLabel: '分析功能已就緒',
      }),
    );

    expect(html).toContain('單曲分析');
    expect(html).toContain('開始分析');
    expect(html).toContain('重新讀取 sidecar');
    expect(html).not.toContain('此頁只操作既有');
    expect(html).not.toContain('Analysis job');
    expect(html).not.toContain('Internal workbench');
  });

  it('uses installation as the primary action when the capability is missing', async () => {
    const html = await renderToString(
      createSSRApp(MusicAnalysisJobPanel, {
        selectedTrack: { id: 'track-1', title: '測試歌曲', artist: '歌手' },
        phaseLabel: '待命',
        stageLabel: '待命',
        capability: {
          status: 'missing',
          installed: false,
          canPrepare: true,
          modelName: 'Beat This! small0',
          downloadBytes: 159368729,
        },
        capabilityStageLabel: '尚未安裝分析功能',
      }),
    );

    expect(html).toContain('下載並安裝');
    expect(html).toContain('約 152 MB');
    expect(html).toContain('未安裝');
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('尚未是正式產品功能');
    expect(html).not.toContain('benchmark-only');
  });
});
