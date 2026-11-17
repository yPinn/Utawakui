import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SeparationAutoSettingsRow from './SeparationAutoSettingsRow.vue';

function renderRow(props = {}) {
  return renderToString(
    createSSRApp({ render: () => h(SeparationAutoSettingsRow, props) }),
  );
}

describe('SeparationAutoSettingsRow', () => {
  it('describes the opt-in and stays unchecked by default', async () => {
    const html = await renderRow();
    expect(html).toContain('匯入後自動產生伴奏');
    expect(html).toContain('aria-label="匯入曲目後自動產生伴奏"');
    expect(html).toContain('OBS 直播或錄影時');
    expect(html).not.toContain('checked');
  });

  it('renders checked once the saved value is loaded', async () => {
    expect(await renderRow({ autoSeparate: true })).toContain('checked');
    expect(
      await renderRow({ autoSeparate: true, loaded: false }),
    ).not.toContain('checked');
  });

  it('offers a reload after a read failure', async () => {
    const html = await renderRow({ readError: '目前無法讀取' });
    expect(html).toContain('目前無法讀取');
    expect(html).toContain('重新讀取');
  });
});
