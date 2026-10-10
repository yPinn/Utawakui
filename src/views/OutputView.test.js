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
    const editMode = html.indexOf('<!--[-->編輯<!--]-->');
    const galleryMode = html.indexOf('<!--[-->模板<!--]-->');

    expect(editMode).toBeGreaterThan(-1);
    expect(editMode).toBeLessThan(galleryMode);
    expect(html).toContain('aria-checked="true" tabindex="0"');
    expect(html).toMatch(/aria-checked="true"[^>]*><!--\[-->編輯/);
    expect(html).toContain('aria-label="輸出設定"');
    expect(html).not.toContain('id="obs-output-settings-tab"');
  });

  it('renders three output categories while keeping one template grid active', async () => {
    const html = await renderOutputView();
    const setlistOption = html.indexOf('歌單');
    const lyricsOption = html.indexOf('歌詞');
    const nowPlayingOption = html.indexOf('播放中');

    expect(html).toContain('模板庫');
    expect(html).toContain('工作台');
    expect(html).toContain('輸出設定');
    expect(html).toContain('模板縮圖');
    expect(html).toContain('模板展示預覽');
    expect(html).toContain('播放中');
    expect(html).toContain('歌單');
    expect(html).toContain('歌詞');
    expect(html).toContain('aria-label="輸出畫面"');
    expect(setlistOption).toBeGreaterThan(-1);
    expect(setlistOption).toBeLessThan(lyricsOption);
    expect(lyricsOption).toBeLessThan(nowPlayingOption);
    expect(html).not.toContain('>封面</button>');
    expect(html).toMatch(
      /id="output-kind-setlist-tab"[^>]*aria-selected="true"/,
    );
    expect(html).toContain('黑幕歌單');
    expect(html).not.toContain('聚焦歌詞');
  });

  it('reopens the last page and kind selected during this renderer session', async () => {
    const navigation = useOutputWorkspaceNavigation();
    navigation.selectPage('gallery');
    navigation.selectKind('lyrics', outputKindIds);

    try {
      const html = await renderOutputView();

      expect(html).toMatch(/aria-checked="true"[^>]*><!--\[-->模板/);
      expect(html).toMatch(
        /id="output-kind-lyrics-tab"[^>]*aria-selected="true"/,
      );
    } finally {
      navigation.selectPage('workbench');
      navigation.selectKind('setlist', outputKindIds);
    }
  });
});
