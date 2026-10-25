import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AutoErrorReportModal', () => {
  it('asks with the readable title, scope and the three choices', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      Utawakui: {
        getPendingAutoReport: vi.fn(async () => ({
          reportId: 'r-1',
          title: '畫面程序異常結束',
          occurrences: 2,
          message: 'Renderer process terminated unexpectedly',
        })),
      },
    });
    const { useAutoErrorReport } =
      await import('../../composables/useAutoErrorReport.js');
    await useAutoErrorReport().initialize();
    const { default: AutoErrorReportModal } =
      await import('./AutoErrorReportModal.vue');

    const html = await renderToString(createSSRApp(AutoErrorReportModal));

    expect(html).toContain('發生嚴重錯誤');
    expect(html).toContain('畫面程序異常結束');
    expect(html).toContain('2 次');
    expect(html).toContain('不含曲庫、歌詞或檔案');
    for (const label of ['不要', '傳送', '自動傳送', '查看內容']) {
      expect(html).toContain(label);
    }
  });
});
