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
  it('opens the workbench first and keeps the gallery second', async () => {
    const html = await renderOutputView();
    const workbenchTab = html.indexOf('id="obs-output-workbench-tab"');
    const galleryTab = html.indexOf('id="obs-output-gallery-tab"');
    const settingsTab = html.indexOf('id="obs-output-settings-tab"');

    expect(workbenchTab).toBeGreaterThan(-1);
    expect(workbenchTab).toBeLessThan(galleryTab);
    expect(galleryTab).toBeLessThan(settingsTab);
    expect(html).toMatch(
      /id="obs-output-workbench-tab"[^>]*aria-selected="true"/,
    );
    expect(html).toMatch(
      /id="obs-output-gallery-tab"[^>]*aria-selected="false"/,
    );
  });

  it('renders four output categories while keeping one template grid active', async () => {
    const html = await renderOutputView();

    expect(html).toContain('模板庫');
    expect(html).toContain('工作台');
    expect(html).toContain('輸出設定');
    expect(html).toContain('模板縮圖');
    expect(html).toContain('模板展示預覽');
    expect(html).toContain('Now Playing');
    expect(html).toContain('Setlist');
    expect(html).toContain('Lyrics');
    expect(html).toContain('Artwork');
    expect(html).toContain('Now / Next');
    expect(html).not.toContain('Focus Line');
  });
});
