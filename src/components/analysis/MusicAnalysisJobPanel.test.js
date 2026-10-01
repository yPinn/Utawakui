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
    expect(html).toContain('重新讀取分析結果');
    expect(html).not.toMatch(/sidecar|runtime/iu);
    expect(html).not.toContain('此頁只操作既有');
    expect(html).not.toContain('Analysis job');
    expect(html).not.toContain('Internal workbench');
  });

  it('directs capability recovery to Settings when analysis is not ready', async () => {
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

    expect(html).toContain('前往設定');
    expect(html).toContain('請到設定準備或修復 BPM 分析');
    expect(html).not.toContain('下載並安裝');
    expect(html).not.toContain('約 152 MB');
    expect(html).not.toContain('Beat This! small0');
    expect(html).not.toMatch(/sidecar|runtime/iu);
    expect(html).toContain('未準備');
    expect(html).not.toContain('尚未是正式產品功能');
    expect(html).not.toContain('benchmark-only');
  });
});
