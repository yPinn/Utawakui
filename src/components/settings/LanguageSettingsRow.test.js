import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LanguageSettingsRow from './LanguageSettingsRow.vue';

const ui = {
  preference: 'system',
  items: [
    { value: 'system', label: '跟隨系統' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en-US', label: 'English' },
  ],
  loaded: true,
};
const output = {
  preference: 'ui',
  items: [
    { value: 'ui', label: '跟隨介面語言' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en-US', label: 'English' },
  ],
  loaded: true,
};

function render(uiOverrides = {}, outputOverrides = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LanguageSettingsRow, {
          ui: { ...ui, ...uiOverrides },
          output: { ...output, ...outputOverrides },
        }),
    }),
  );
}

describe('LanguageSettingsRow', () => {
  it('shows both language choices in one row', async () => {
    const html = await render();
    expect(html).toContain('語言');
    expect(html).toContain('介面語言重新啟動後套用；畫面輸出語言立即套用。');
    expect(html).toContain('介面語言');
    expect(html).toContain('畫面輸出語言');
    expect(html).not.toContain('立即重新啟動');
  });

  it('offers a restart while another UI language is pending', async () => {
    const html = await render({
      pendingMessage: '重新啟動後會改用「English」。',
    });
    expect(html).toContain('重新啟動後會改用「English」。');
    expect(html).toContain('立即重新啟動');
  });

  it('replaces the pending hint with a relaunch failure', async () => {
    const html = await render({
      pendingMessage: '重新啟動後會改用「English」。',
      relaunchError: '無法重新啟動，請手動關閉後再開啟 Utawakui。',
    });
    expect(html).toContain('無法重新啟動');
    expect(html).not.toContain('重新啟動後會改用「English」。');
  });

  it('reports an Output language read failure with a reload action', async () => {
    const html = await render({}, { readError: '無法讀取畫面輸出語言設定。' });
    expect(html).toContain('無法讀取畫面輸出語言設定。');
    expect(html).toContain('重新讀取');
  });
});
