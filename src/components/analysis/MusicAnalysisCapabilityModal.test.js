import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisCapabilityModal from './MusicAnalysisCapabilityModal.vue';

describe('MusicAnalysisCapabilityModal', () => {
  it('keeps low-frequency model, storage, verification, and maintenance details out of the workbench', async () => {
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

    expect(html).toContain('分析功能資訊');
    expect(html).toContain('Beat This! small0');
    expect(html).toContain('SHA-256');
    expect(html).toContain('本機');
    expect(html).toContain('修復安裝');
    expect(html).toContain('移除分析功能');
  });
});
