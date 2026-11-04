import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import YoutubeLoginRow from './YoutubeLoginRow.vue';

const items = [
  { value: 'none', label: '不使用' },
  { value: 'firefox', label: '用 Firefox 的登入' },
  { value: 'file', label: '用登入檔案' },
];

function render(overrides = {}) {
  const login = {
    source: 'none',
    loaded: true,
    reading: false,
    busy: false,
    readError: '',
    saveError: '',
    status: { imported: false, noticeAcknowledged: false },
    fileBusy: false,
    fileError: '',
    items,
    ...overrides,
  };
  return renderToString(
    createSSRApp({ render: () => h(YoutubeLoginRow, { login }) }),
  );
}

describe('YoutubeLoginRow', () => {
  it('explains when sign-in is used and offers the three choices', async () => {
    const html = await render();
    expect(html).toContain('YouTube 登入');
    expect(html).toContain('有些影片要登入才能下載，下載失敗時才會使用。');
    expect(html).toContain('登入方式');
    expect(html).not.toContain('匯入檔案');
  });

  it('asks Firefox users to sign in there first', async () => {
    const html = await render({ source: 'firefox' });
    expect(html).toContain('請先在 Firefox 登入 YouTube。');
    expect(html).not.toContain('匯入檔案');
  });

  it('shows file status and actions for the sign-in file', async () => {
    const empty = await render({ source: 'file' });
    expect(empty).toContain('尚未匯入');
    expect(empty).toContain('匯入檔案');
    expect(empty).toContain('怎麼取得');
    expect(empty).not.toContain('>移除<');

    const imported = await render({
      source: 'file',
      status: { imported: true, noticeAcknowledged: true },
    });
    expect(imported).toContain('已匯入');
    expect(imported).toContain('移除');
  });

  it('shows a rejected file reason', async () => {
    const html = await render({
      source: 'file',
      fileError: '檔案裡沒有 YouTube 的登入資料。',
    });
    expect(html).toContain('檔案裡沒有 YouTube 的登入資料。');
  });
});
