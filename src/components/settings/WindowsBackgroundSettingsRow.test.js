import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import WindowsBackgroundSettingsRow from './WindowsBackgroundSettingsRow.vue';

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () => h(WindowsBackgroundSettingsRow, props),
    }),
  );
}

describe('WindowsBackgroundSettingsRow', () => {
  it('explains all close choices and asks by default', async () => {
    const html = await renderRow();

    expect(html).toContain('關閉主視窗時');
    expect(html).toContain('每次詢問');
    expect(html).toContain('在系統匣背景執行');
    expect(html).toContain('完全結束');
    expect(html).toContain('播放、OBS 連線與輸出仍會繼續');
    expect(html).toContain('class="ui-select" value="ask"');
  });

  it('renders the persisted tray and busy states', async () => {
    const html = await renderRow({ behavior: 'tray', busy: true });

    expect(html).toContain('class="ui-select" value="tray" disabled');
    expect(html).toContain('disabled');
  });

  it('shows a bounded persistence failure', async () => {
    const html = await renderRow({
      error: '目前無法儲存關閉行為，請再試一次。',
    });

    expect(html).toContain('關閉行為未儲存');
    expect(html).toContain('目前無法儲存關閉行為');
  });
});
