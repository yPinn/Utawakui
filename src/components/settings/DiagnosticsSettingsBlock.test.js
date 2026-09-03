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

function buttonTag(html, label) {
  const start = html.indexOf(`aria-label="${label}"`);
  return html.slice(start, html.indexOf('>', start));
}

describe('DiagnosticsSettingsBlock', () => {
  it('shows export as the one visible primary action plus an overflow menu trigger', async () => {
    const html = await renderBlock({ recordCount: 4 });

    expect(html).toContain('錯誤紀錄');
    expect(html).toContain('有紀錄');
    expect(html).toContain('4 筆近期錯誤');
    expect(html).toContain('aria-label="匯出錯誤紀錄"');
    expect(html).toContain('title="匯出錯誤紀錄"');
    expect(html).toContain('aria-label="錯誤紀錄選項"');
    expect(html).toContain('aria-haspopup="menu"');
    // Refresh/open-folder/clear move behind the overflow menu instead of
    // sitting as their own always-visible icon buttons.
    expect(html).not.toContain('aria-label="重新讀取"');
    expect(html).not.toContain('aria-label="開啟錯誤紀錄資料夾"');
    expect(html).not.toContain('aria-label="清除錯誤紀錄"');
  });

  it('uses a concise two-row empty state', async () => {
    const html = await renderBlock();

    expect(html).toContain('錯誤紀錄');
    expect(html).toContain('無紀錄');
    expect(html).toContain('沒有近期錯誤');
    expect(html).not.toContain('settings-action-row__description');
  });

  it('disables export while a record request is in flight but not when empty', async () => {
    const emptyHtml = await renderBlock({ recordCount: 0 });
    expect(buttonTag(emptyHtml, '匯出錯誤紀錄')).not.toContain('disabled');

    const loadingHtml = await renderBlock({ recordCount: 4, isLoading: true });
    expect(buttonTag(loadingHtml, '匯出錯誤紀錄')).toContain('disabled');
  });

  it('keeps the overflow trigger enabled even while loading or empty', async () => {
    const loadingHtml = await renderBlock({ recordCount: 0, isLoading: true });
    expect(buttonTag(loadingHtml, '錯誤紀錄選項')).not.toContain('disabled');
  });

  it('renders safe notices without exposing diagnostic event details', async () => {
    const html = await renderBlock({
      notice: {
        severity: 'error',
        title: '無法讀取錯誤紀錄',
        message: '請稍後再試一次。',
        actionLabel: '重試',
      },
    });

    expect(html).toContain('ui-notice');
    expect(html).toContain('無法讀取錯誤紀錄');
    expect(html).not.toContain('source');
    expect(html).not.toContain('operation');
    expect(html).not.toContain('stack');
  });
});
