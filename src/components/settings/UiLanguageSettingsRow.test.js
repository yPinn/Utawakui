import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiLanguageSettingsRow from './UiLanguageSettingsRow.vue';

const items = [
  { value: 'system', label: '跟隨系統' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
];

function render(props = {}) {
  return renderToString(
    createSSRApp({
      render: () => h(UiLanguageSettingsRow, { items, ...props }),
    }),
  );
}

describe('UiLanguageSettingsRow', () => {
  it('shows the language choice with its restart guidance', async () => {
    const html = await render({ preference: 'system' });
    expect(html).toContain('介面語言');
    expect(html).toContain('重新啟動後套用。');
    expect(html).not.toContain('立即重新啟動');
  });

  it('offers a restart while another language is pending', async () => {
    const html = await render({
      preference: 'en-US',
      pendingMessage: '重新啟動後會改用「English」。',
    });
    expect(html).toContain('重新啟動後會改用「English」。');
    expect(html).toContain('立即重新啟動');
  });

  it('replaces the pending hint with a relaunch failure', async () => {
    const html = await render({
      preference: 'en-US',
      pendingMessage: '重新啟動後會改用「English」。',
      relaunchError: '無法重新啟動，請手動關閉後再開啟 Utawakui。',
    });
    expect(html).toContain('無法重新啟動');
    expect(html).not.toContain('重新啟動後會改用「English」。');
  });
});
