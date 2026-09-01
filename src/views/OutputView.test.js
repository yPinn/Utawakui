import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import OutputView from './OutputView.vue';
import { useOutputWorkspaceNavigation } from '../composables/useOutputWorkspaceNavigation.js';

const outputKindIds = ['setlist', 'lyrics', 'now-playing'];

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

  it('renders three output categories while keeping one template grid active', async () => {
    const html = await renderOutputView();
    const setlistTab = html.indexOf('id="output-workbench-kind-setlist-tab"');
    const lyricsTab = html.indexOf('id="output-workbench-kind-lyrics-tab"');
    const nowPlayingTab = html.indexOf(
      'id="output-workbench-kind-now-playing-tab"',
    );

    expect(html).toContain('模板庫');
    expect(html).toContain('工作台');
    expect(html).toContain('輸出設定');
    expect(html).toContain('模板縮圖');
    expect(html).toContain('模板展示預覽');
    expect(html).toContain('Now Playing');
    expect(html).toContain('Setlist');
    expect(html).toContain('Lyrics');
    expect(setlistTab).toBeGreaterThan(-1);
    expect(setlistTab).toBeLessThan(lyricsTab);
    expect(lyricsTab).toBeLessThan(nowPlayingTab);
    expect(html).not.toContain('id="output-workbench-kind-artwork-tab"');
    expect(html).toMatch(
      /id="output-workbench-kind-setlist-tab"[^>]*aria-selected="true"/,
    );
    expect(html).toContain('Simple Black B');
    expect(html).not.toContain('Focus Line');
  });

  it('reopens the last page and kind selected during this renderer session', async () => {
    const navigation = useOutputWorkspaceNavigation();
    navigation.selectPage('gallery');
    navigation.selectKind('lyrics', outputKindIds);

    try {
      const html = await renderOutputView();

      expect(html).toMatch(
        /id="obs-output-gallery-tab"[^>]*aria-selected="true"/,
      );
      expect(html).toMatch(
        /id="output-kind-lyrics-tab"[^>]*aria-selected="true"/,
      );
    } finally {
      navigation.selectPage('workbench');
      navigation.selectKind('setlist', outputKindIds);
    }
  });
});
