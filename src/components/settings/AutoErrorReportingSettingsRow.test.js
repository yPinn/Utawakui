import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AutoErrorReportingSettingsRow from './AutoErrorReportingSettingsRow.vue';

const render = (props) =>
  renderToString(
    createSSRApp({ render: () => h(AutoErrorReportingSettingsRow, props) }),
  );

describe('severe error reporting preference', () => {
  it('states what a report contains and offers the three choices', async () => {
    const html = await render({});
    expect(html).toContain('嚴重錯誤回報');
    expect(html).toContain('不含曲庫、歌詞或檔案路徑');
    for (const label of ['每次詢問', '自動傳送', '不傳送']) {
      expect(html).toContain(label);
    }
  });

  it('disables an unconfirmed setting and offers its own read retry', async () => {
    const html = await render({ loaded: false, readError: '讀取失敗' });
    expect(html).toContain('讀取失敗');
    expect(html).toContain('重新讀取');
  });
});
