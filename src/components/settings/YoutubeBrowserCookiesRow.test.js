import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import YoutubeBrowserCookiesRow from './YoutubeBrowserCookiesRow.vue';

const render = (props) =>
  renderToString(
    createSSRApp({ render: () => h(YoutubeBrowserCookiesRow, props) }),
  );
describe('browser sign-in preference', () => {
  it('discloses the browser data it reads and starts unchecked', async () => {
    const html = await render({});
    expect(html).toContain('瀏覽器登入資料');
    expect(html).toContain('Chrome、Edge 或 Firefox');
    expect(html).toContain('YouTube 帳號');
    expect(html).not.toContain('checked');
  });
  it('reflects an explicit opt-in', async () => {
    expect(await render({ allowBrowserCookies: true })).toContain('checked');
  });
  it('disables an unconfirmed setting and provides its own read retry', async () => {
    const html = await render({
      allowBrowserCookies: true,
      loaded: false,
      readError: '無法讀取登入資料設定',
    });
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).not.toContain('checked');
    expect(html).toContain('重新讀取');
  });
});
