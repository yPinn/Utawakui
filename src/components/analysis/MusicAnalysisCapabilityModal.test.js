import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisCapabilityModal from './MusicAnalysisCapabilityModal.vue';

describe('MusicAnalysisCapabilityModal', () => {
  it('discloses user-visible effects without exposing implementation details', async () => {
    const context = {};
    await renderToString(
      createSSRApp(MusicAnalysisCapabilityModal, {
        open: true,
        capability: {
          status: 'ready',
          installed: true,
          canRepair: true,
          canRemove: true,
          modelName: 'Beat This! small0',
          modelVersion: '1.1.0',
          downloadBytes: 159368729,
          installedBytesEstimate: 557000000,
        },
      }),
      context,
    );
    const html = context.teleports?.body ?? '';

    expect(html).toContain('BPM 分析功能');
    expect(html).toContain('分析元件');
    expect(html).toContain('Beat This! small0');
    expect(html).toContain('額外下載');
    expect(html).toContain('本機');
    expect(html).toContain('不會上傳');
    expect(html).toContain('不會刪除歌曲');
    expect(html).toContain('BPM、節拍與強拍');
    expect(html).toContain('不包含歌曲段落辨識或逐字歌詞');
    expect(html).toContain('修復安裝');
    expect(html).toContain('移除分析功能');
    expect(html).not.toContain('Python');
    expect(html).not.toContain('runtime');
    expect(html).not.toContain('SHA-256');
    expect(html).not.toContain('sidecar');
  });
});
