import { beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import DisplayPage from './DisplayPage.vue';
import { useOutputWorkspaceNavigation } from '../composables/useOutputWorkspaceNavigation.js';
import { OUTPUT_SLOT_DEFINITIONS } from '../constants/outputTemplates.js';

const outputKindIds = OUTPUT_SLOT_DEFINITIONS.map((slot) => slot.id);
const defaultKind = outputKindIds[0];

beforeEach(() => {
  const navigation = useOutputWorkspaceNavigation();
  navigation.selectPage('workbench');
  navigation.selectKind(defaultKind, outputKindIds);
});

function renderDisplayPage() {
  return renderToString(
    createSSRApp({
      render: () => h(DisplayPage),
    }),
  );
}

describe('DisplayPage', () => {
  it('opens the workbench first and keeps the gallery second', async () => {
    const html = await renderDisplayPage();
    const editMode = html.indexOf('<!--[-->工作臺<!--]-->');
    const galleryMode = html.indexOf('<!--[-->模板庫<!--]-->');

    expect(editMode).toBeGreaterThan(-1);
    expect(editMode).toBeLessThan(galleryMode);
    expect(html).toContain('aria-checked="true" tabindex="0"');
    expect(html).toMatch(
      /aria-checked="true"[^>]*><span class="ui-segmented-control__label"[^>]*><!--\[-->工作臺/,
    );
    expect(html).toContain('aria-label="輸出設定"');
    expect(html).not.toContain('id="obs-output-settings-tab"');
  });

  it('renders three output categories while keeping one template grid active', async () => {
    const html = await renderDisplayPage();
    const renderedKindIds = [
      ...html.matchAll(/id="output-kind-([^"\s]+)-tab"/gu),
    ].map((match) => match[1]);

    expect(html).toContain('模板庫');
    expect(html).toContain('工作台');
    expect(html).toContain('輸出設定');
    expect(html).toContain('模板縮圖');
    expect(html).toContain('模板展示預覽');
    expect(html).toContain('播放中');
    expect(html).toContain('歌單');
    expect(html).toContain('歌詞');
    expect(html).toContain('aria-label="輸出畫面"');
    expect(renderedKindIds).toEqual(outputKindIds);
    expect(html).not.toContain('>封面</button>');
    expect(html).toMatch(
      new RegExp(
        `id="output-kind-${defaultKind}-tab"[^>]*aria-selected="true"`,
        'u',
      ),
    );
    expect(html).toContain('經典伴唱');
    expect(
      html.match(/class="[^"\n]*\bobs-template-gallery__grid\b[^"\n]*"/gu),
    ).toHaveLength(1);
    expect(html).not.toContain('聚焦歌詞');
  });

  it('reopens the last page and kind selected during this renderer session', async () => {
    const navigation = useOutputWorkspaceNavigation();
    const rememberedKind = outputKindIds.at(-1);
    navigation.selectPage('gallery');
    navigation.selectKind(rememberedKind, outputKindIds);

    try {
      const html = await renderDisplayPage();

      expect(html).toMatch(
        /aria-checked="true"[^>]*><span class="ui-segmented-control__label"[^>]*><!--\[-->模板庫/,
      );
      expect(html).toMatch(
        new RegExp(
          `id="output-kind-${rememberedKind}-tab"[^>]*aria-selected="true"`,
          'u',
        ),
      );
    } finally {
      navigation.selectPage('workbench');
      navigation.selectKind(defaultKind, outputKindIds);
    }
  });
});
