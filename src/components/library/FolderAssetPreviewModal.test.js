import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import FolderAssetPreviewModal from './FolderAssetPreviewModal.vue';

const source = readFileSync(
  new URL('./FolderAssetPreviewModal.vue', import.meta.url),
  'utf8',
);

describe('FolderAssetPreviewModal', () => {
  it('builds an image-only presentation on the shared modal mechanics', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(FolderAssetPreviewModal, {
            open: true,
            asset: {
              key: 'photo:asset-1',
              imageUrl: 'utawakui-media://folder-asset/asset-1/image.png',
            },
          }),
      }),
    );

    expect(source).toContain("import UiModal from '../ui/UiModal.vue'");
    expect(source).toContain(
      "import UiPhotoFrame from '../ui/UiPhotoFrame.vue'",
    );
    expect(source).toContain('presentation="media"');
    expect(source).not.toContain('size="wide"');
    expect(source).not.toContain('fixed-height');
    expect(source).toContain('#header-actions');
    expect(source).not.toContain('#footer');
    expect(html).toContain('utawakui-media://folder-asset/asset-1/image.png');
    expect(html).not.toContain('folder-asset-preview__stage');
    expect(source).toContain('<UiPhotoFrame');
    expect(source).toContain('intrinsic');
    expect(source).toContain('fit="contain"');
    expect(source).toContain('filtered');
    expect(html).toContain('ui-photo-frame--filtered');
    expect(source).not.toContain('<img');
    expect(source).not.toContain('background: var(--ui-color-canvas)');
  });

  it('inherits media bounds from the shared modal instead of local overrides', () => {
    // Local style only places the caption note; it never resizes the media.
    expect(source).not.toContain('--ui-modal-media-content-max');
    expect(source).not.toMatch(/max-(?:inline|block)-size|--ui-media-max/u);
  });

  it('opens photo text editing from the rail and shows the caption as a note', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(FolderAssetPreviewModal, {
            open: true,
            asset: {
              key: 'photo:asset-1',
              imageUrl: 'utawakui-media://folder-asset/asset-1/image.png',
              frame: 'instant',
              label: '2024 夏',
              caption: '第一次在 Live House 唱這首。',
              captionPaper: 'rose',
            },
          }),
      }),
    );
    expect(source).toContain('label="編輯照片文字"');
    expect(source).toContain("emit('editText', asset.key)");
    expect(source.indexOf(':icon="Pencil"')).toBeLessThan(
      source.indexOf(':icon="Trash2"'),
    );
    expect(html).toContain('2024 夏');
    expect(html).toContain('第一次在 Live House 唱這首。');
    expect(html).toContain('data-paper="rose"');
  });

  it('keeps removal as a compact media control behind the shared confirmation owner', () => {
    expect(source).toContain('useAppConfirmation');
    expect(source).toContain("intent: 'danger'");
    expect(source).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(source).not.toContain("import UiButton from '../ui/UiButton.vue'");
    expect(source).toContain(':icon="Trash2"');
    expect(source).toContain('variant="overlay"');
    expect(source).toContain('intent="danger"');
    expect(source).toContain('tooltip-placement="start"');
    expect(source).not.toContain('shape="circle"');
    expect(source).toContain('label="從頁面移除"');
    expect(source).toContain(':disabled="removing"');
    expect(source).not.toContain(':loading="removing"');
    expect(source).toContain("emit('remove', props.asset.key)");
    expect(source).toContain('@close="emit(\'close\')"');
    expect(source).toContain('dismiss-on-backdrop');
    expect(source).toContain('@after-leave="emit(\'afterLeave\')"');
  });

  it('states the removal consequence once with concise actions', () => {
    expect(source).toContain("title: '移除這張照片？'");
    expect(source).toContain(
      "message: '照片會從此頁面移除，原始檔案仍會保留。'",
    );
    expect(source).toContain("confirmLabel: '移除'");
    expect(source).not.toContain('subject:');
    expect(source).not.toContain('detail:');
    expect(source).not.toContain('cancelLabel:');
  });

  it('keeps the same framed-photo material when the asset is expanded', () => {
    expect(source).toContain('<UiPhotoFrame');
    expect(source).not.toMatch(/\bborder:/u);
    expect(source).not.toMatch(/\bbox-shadow:/u);
    expect(source).not.toMatch(/\bbackground(?:-color)?:/u);
  });
});
