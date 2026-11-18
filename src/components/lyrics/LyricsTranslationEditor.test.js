import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LyricsTranslationEditor from './LyricsTranslationEditor.vue';

const context = {
  trackId: 'track',
  filename: 'betterlyrics-7.lrc',
  session: {},
  documentId: 'doc',
  lines: [{ lineId: 'a', text: '해 질 때의 바람' }],
};
const languages = [
  { id: 'zh-TW', label: '繁中' },
  { id: 'en', label: '英文' },
];

function render(saved, initialLanguage = 'en') {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LyricsTranslationEditor, {
          context,
          saved,
          languages,
          initialLanguage,
        }),
    }),
  );
}

describe('LyricsTranslationEditor source translations', () => {
  const sourceRows = {
    en: [
      { lineId: 'a', original: '해 질 때의 바람', text: 'The wind at sunset' },
    ],
  };

  it('offers the translation that came with the lyrics for the current language', async () => {
    const html = await render({
      revision: null,
      rows: { 'zh-TW': [], en: [] },
      sourceRows,
    });
    expect(html).toContain('這份歌詞附帶英文譯文。');
    expect(html).toContain('載入譯文');
  });

  it('stays quiet without source rows, in another language, or once saved', async () => {
    for (const html of [
      await render({ revision: null, rows: { 'zh-TW': [], en: [] } }),
      await render(
        { revision: null, rows: { 'zh-TW': [], en: [] }, sourceRows },
        'zh-TW',
      ),
      await render({
        revision: 'r1',
        rows: { 'zh-TW': [], en: sourceRows.en },
        sourceRows,
      }),
    ])
      expect(html).not.toContain('載入譯文');
  });
});
