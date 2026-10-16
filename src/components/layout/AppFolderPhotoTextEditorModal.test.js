import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderPhotoTextEditorModal from './AppFolderPhotoTextEditorModal.vue';

const source = readFileSync(
  new URL('./AppFolderPhotoTextEditorModal.vue', import.meta.url),
  'utf8',
);

function render(photo) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(AppFolderPhotoTextEditorModal, {
          open: true,
          photo: {
            key: 'photo:asset-1',
            imageUrl: 'utawakui-media://folder-asset/asset-1/image.png',
            ratio: 'portrait',
            ...photo,
          },
        }),
    }),
  );
}

describe('AppFolderPhotoTextEditorModal', () => {
  it('offers the instant line only on instant film and seeds both drafts', async () => {
    const instant = await render({
      frame: 'instant',
      label: '2024 夏',
      caption: '第一次唱這首。',
    });
    const print = await render({ frame: 'print', caption: '說明' });

    expect(instant).toContain('拍立得文字');
    expect(instant).toContain('value="2024 夏"');
    expect(instant).toContain('第一次唱這首。');
    expect(instant).toContain('data-photo-frame="instant"');
    expect(print).not.toContain('拍立得文字');
    expect(print).toContain('說明');
    expect(source).toContain('const PHOTO_LABEL_MAX_LENGTH = 16;');
    expect(source).toContain('const PHOTO_CAPTION_TITLE_MAX_LENGTH = 80;');
    expect(source).toContain('const PHOTO_CAPTION_MAX_LENGTH = 2000;');
  });

  it('saves trimmed text only when something changed', async () => {
    const unchanged = await render({ frame: 'print', caption: '說明' });
    const saveButton = unchanged.match(
      /<button[^>]*>(?:(?!<button)[\s\S])*?儲存/u,
    );
    expect(saveButton?.[0]).toContain('disabled');
    expect(source).toMatch(
      /emit\('save', \{\s*label: isInstant\.value \? labelDraft\.value\.trim\(\) : '',\s*captionTitle: captionTitleDraft\.value\.trim\(\),\s*caption: captionDraft\.value\.trimEnd\(\),\s*captionPaper: captionPaper\.value\.id,\s*\}\)/u,
    );
  });

  it('tucks a caption paper swatch at the print corner with the shared switch', async () => {
    const html = await render({
      frame: 'print',
      caption: '說明',
      captionPaper: 'kraft',
    });
    expect(html).toContain('data-paper="kraft"');
    expect(html).toContain('切換說明便條紙色（目前：牛皮紙）');
    expect(html).not.toContain('app-folder-photo-text__caption-paper--empty');
    const empty = await render({ frame: 'print' });
    expect(empty).toContain('app-folder-photo-text__caption-paper--empty');
    expect(source).toContain('@click="cycleCaptionPaper"');
    expect(source).toContain('captionPaper: captionPaper.value.id,');
    expect(source).not.toMatch(/<button\b/u);
  });

  it('shares the note editor anatomy with the footnote on the action row', () => {
    const footer = source.slice(source.indexOf('<template #footer>'));
    expect(footer).toMatch(
      /<UiHint class="app-folder-photo-text__footnote">[\s\S]*?<UiButton[^>]*variant="secondary"[\s\S]*?<UiButton[^>]*variant="accent"/u,
    );
    expect(source).toContain('const PREVIEW_SIZE = 160;');
  });
});
