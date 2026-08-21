import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import OutputView from './OutputView.vue';

function renderOutputView() {
  return renderToString(
    createSSRApp({
      render: () => h(OutputView),
    }),
  );
}

describe('OutputView', () => {
  it('renders one gallery containing setlist and lyrics template families', async () => {
    const html = await renderOutputView();

    expect(html).toContain('模板庫');
    expect(html).toContain('工作台');
    expect(html).toContain('模板縮圖');
    expect(html).toContain('模板展示預覽');
    expect(html).toContain('Now Playing');
    expect(html).toContain('Setlist');
    expect(html).toContain('Lyrics');
    expect(html).toContain('Now / Next');
    expect(html).toContain('Focus Line');
  });
});
