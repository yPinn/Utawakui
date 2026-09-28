import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import DiagnosticsSettingsRow from './DiagnosticsSettingsRow.vue';

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(DiagnosticsSettingsRow, {
          recordCount: 0,
          isLoading: false,
          notice: null,
          ...props,
        }),
    }),
  );
}

function buttonTag(html, label) {
  const labelStart = html.indexOf(`>${label}</span>`);
  const buttonStart = html.lastIndexOf('<button', labelStart);
  return html.slice(buttonStart, html.indexOf('>', labelStart));
}

describe('DiagnosticsSettingsRow', () => {
  it('shows export as the one visible primary action plus an overflow menu trigger', async () => {
    const html = await renderRow({ recordCount: 4 });

    expect(html).toContain('錯誤紀錄');
    expect(html).toContain('有紀錄');
    expect(html).toContain('4 筆近期錯誤');
    expect(html).toMatch(
      /class="ui-visually-hidden"[^>]*>匯出錯誤紀錄<\/span>/u,
    );
    expect(html).not.toContain('aria-label="匯出錯誤紀錄"');
    expect(html).not.toContain('aria-describedby="ui-tooltip-');
    expect(html).not.toContain('title="匯出錯誤紀錄"');
    expect(html).toMatch(
      /class="ui-visually-hidden"[^>]*>錯誤紀錄選項<\/span>/u,
    );
    expect(html).toContain('aria-haspopup="menu"');
    // Refresh/open-folder/clear move behind the overflow menu instead of
    // sitting as their own always-visible icon buttons.
    expect(html).not.toContain('aria-label="重新讀取"');
    expect(html).not.toContain('aria-label="開啟錯誤紀錄資料夾"');
    expect(html).not.toContain('aria-label="清除錯誤紀錄"');
  });

  it('uses a concise two-row empty state', async () => {
    const html = await renderRow();

    expect(html).toContain('錯誤紀錄');
    expect(html).toContain('無紀錄');
    expect(html).toContain('沒有近期錯誤');
    expect(html).not.toContain('settings-action-row__description');
  });

  it('disables export while a record request is in flight but not when empty', async () => {
    const emptyHtml = await renderRow({ recordCount: 0 });
    expect(buttonTag(emptyHtml, '匯出錯誤紀錄')).not.toContain('disabled');

    const loadingHtml = await renderRow({ recordCount: 4, isLoading: true });
    expect(buttonTag(loadingHtml, '匯出錯誤紀錄')).toContain('disabled');
  });

  it('keeps the overflow trigger enabled even while loading or empty', async () => {
    const loadingHtml = await renderRow({ recordCount: 0, isLoading: true });
    expect(buttonTag(loadingHtml, '錯誤紀錄選項')).not.toContain('disabled');
  });

  it('renders safe notices without exposing diagnostic event details', async () => {
    const html = await renderRow({
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
