import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import DiagnosticsSettingsBlock from './DiagnosticsSettingsBlock.vue';

async function renderBlock(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(DiagnosticsSettingsBlock, {
          recordCount: 0,
          isLoading: false,
          notice: null,
          ...props,
        }),
    }),
  );
}

describe('DiagnosticsSettingsBlock', () => {
  it('shows familiar actions as labelled icon buttons with tooltips', async () => {
    const html = await renderBlock({ recordCount: 4 });

    expect(html).toContain('使用記錄');
    expect(html).toContain('4 筆近期記錄');
    expect(html).toContain('記錄只保留在這台電腦');
    expect(html).toContain('aria-label="重新讀取"');
    expect(html).toContain('title="重新讀取"');
    expect(html).toContain('aria-label="開啟使用記錄資料夾"');
    expect(html).toContain('title="開啟使用記錄資料夾"');
    expect(html).toContain('aria-label="清除使用記錄"');
    expect(html).toContain('title="清除使用記錄"');
    expect(html).not.toContain('>重新讀取<');
    expect(html).not.toContain('>開啟資料夾<');
    expect(html).not.toContain('>清除<');
  });

  it('renders safe notices without exposing diagnostic event details', async () => {
    const html = await renderBlock({
      notice: {
        severity: 'error',
        title: '無法讀取使用記錄',
        message: '請稍後再試一次。',
        actionLabel: '重試',
      },
    });

    expect(html).toContain('ui-notice');
    expect(html).toContain('無法讀取使用記錄');
    expect(html).not.toContain('source');
    expect(html).not.toContain('operation');
    expect(html).not.toContain('stack');
  });
});
